/**
 * 告警服务模块
 * 用于发送周匹配执行结果的通知邮件
 */

const { getResend } = require('./mailer');

// 告警级别对应的颜色和图标
const levelColors = {
  error: '#e74c3c',
  warning: '#f39c12',
  info: '#27ae60'
};

const levelEmojis = {
  error: '❌',
  warning: '⚠️',
  info: '✅'
};

/**
 * 获取告警接收邮箱列表
 * @returns {string[]}
 */
function getAlertEmails() {
  // 优先从环境变量读取，否则使用默认管理员邮箱
  const envEmails = process.env.ALERT_EMAILS;
  if (envEmails) {
    return envEmails.split(',').map(e => e.trim()).filter(Boolean);
  }

  // 回退：使用 ADMIN_EMAIL 环境变量
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    return [adminEmail.trim()];
  }

  return [];
}

/**
 * 发送告警邮件
 * @param {'error' | 'warning' | 'info'} level - 告警级别
 * @param {string} subject - 邮件主题
 * @param {string} message - 详细信息
 * @returns {Promise<Array>}
 */
async function sendAlert(level, subject, message) {
  const emails = getAlertEmails();

  if (emails.length === 0) {
    console.warn(`[Alert] 未配置告警邮箱，跳过发送: ${subject}`);
    return [];
  }

  const r = getResend();
  if (!r) {
    console.log(`[Alert] 邮件服务未配置，模拟发送: [${level}] ${subject}`);
    return emails.map(email => ({ email, success: true, simulated: true }));
  }

  const timestamp = new Date().toISOString();
  const fullSubject = `[心有所SHU][${level.toUpperCase()}] ${subject}`;
  const color = levelColors[level] || '#666';
  const emoji = levelEmojis[level] || '📢';

  const results = [];

  for (const email of emails) {
    try {
      await r.emails.send({
        from: process.env.FROM_EMAIL || '心有所SHU <onboarding@resend.dev>',
        to: email,
        subject: fullSubject,
        html: `
          <div style="font-family: 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: ${color};">${emoji} 系统通知 - 心有所SHU</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${color};">
              <p><strong>级别：</strong>${level.toUpperCase()}</p>
              <p><strong>时间：</strong>${timestamp}</p>
              <p><strong>详情：</strong></p>
              <pre style="white-space: pre-wrap; word-break: break-word; font-size: 14px;">${message}</pre>
            </div>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              此邮件由系统自动发送，请勿回复。
            </p>
          </div>
        `
      });

      console.log(`[Alert] ✅ 告警邮件已发送至 ${email}`);
      results.push({ email, success: true });
    } catch (error) {
      console.error(`[Alert] ❌ 发送告警邮件到 ${email} 失败:`, error.message);
      results.push({ email, success: false, error: error.message });
    }
  }

  return results;
}

/**
 * 发送匹配失败告警
 * @param {Error|string} error - 错误对象或错误信息
 * @param {Object} context - 上下文信息
 * @returns {Promise<Array>}
 */
async function alertMatchFailed(error, context = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  const contextStr = Object.keys(context).length > 0 ? `\n\n上下文:\n${JSON.stringify(context, null, 2)}` : '';

  const message = `周匹配执行失败\n\n错误信息: ${errorMessage}${stack ? `\n\n堆栈:\n${stack}` : ''}${contextStr}`;

  return sendAlert('error', '周匹配执行失败', message);
}

/**
 * 发送匹配成功通知
 * @param {Object} result - 匹配结果
 * @returns {Promise<Array>}
 */
async function alertMatchSuccess(result) {
  const matchCount = result.results?.length || 0;
  const message = `周匹配执行成功\n\n匹配对数: ${matchCount}\n消息: ${result.message}\n\n时间: ${new Date().toISOString()}`;

  return sendAlert('info', '周匹配执行成功', message);
}

/**
 * 发送匹配跳过通知（如已执行过）
 * @param {string} reason - 跳过原因
 * @returns {Promise<Array>}
 */
async function alertMatchSkipped(reason) {
  return sendAlert('warning', '周匹配跳过', reason);
}

module.exports = {
  sendAlert,
  alertMatchFailed,
  alertMatchSuccess,
  alertMatchSkipped,
  getAlertEmails
};
