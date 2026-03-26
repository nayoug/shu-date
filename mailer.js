const { Resend } = require('resend');
require('dotenv').config();

console.log('邮件配置:', {
  provider: 'Resend',
  from: process.env.FROM_EMAIL || 'no-reply@shudate.xyz',
  apiKey: process.env.RESEND_API_KEY ? '已设置' : '未设置'
});

let resend = null;

function getResend() {
  if (resend) return resend;

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ 邮件配置未完成，请在 .env 文件中配置 RESEND_API_KEY');
    return null;
  }

  resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

function isMailConfigured() {
  return !!getResend();
}

// 发送登录验证码邮件
async function sendLoginEmail(email, loginCode) {
  const r = getResend();
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const loginUrl = `${baseUrl}/login/verify/${loginCode}`;

  if (!r) {
    console.log('邮件模拟模式: 登录验证码', loginCode);
    return { success: false, code: loginCode, url: loginUrl };
  }

  try {
    await r.emails.send({
      from: process.env.FROM_EMAIL || '心有所SHU <onboarding@resend.dev>',
      to: email,
      subject: '【心有所SHU】登录验证码',
      html: `
        <div style="font-family: 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #e74c3c;">🎓 登录心有所SHU</h2>
          <p>同学你好！</p>
          <p>点击以下链接直接登录：</p>
          <p style="margin: 20px 0;">
            <a href="${loginUrl}" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">立即登录</a>
          </p>
          <p>或复制以下链接到浏览器打开：</p>
          <p style="word-break: break-all; color: #666;">${loginUrl}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            链接有效期为10分钟。如非本人操作，请忽略此邮件。
          </p>
        </div>
      `
    });

    console.log(`✅ 登录邮件已发送至 ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ 发送邮件失败:', error.message);
    return { success: false, code: loginCode, url: loginUrl, error: error.message };
  }
}

// 发送匹配结果邮件
async function sendMatchEmail(userEmail, userName, matchedName, matchedGrade, matchedMajor) {
  const r = getResend();
  if (!r) {
    console.log('邮件模拟模式: 匹配通知');
    return { success: true };
  }

  try {
    await r.emails.send({
      from: process.env.FROM_EMAIL || '心有所SHU <onboarding@resend.dev>',
      to: userEmail,
      subject: '【心有所SHU】本周匹配结果出炉啦！',
      html: `
        <div style="font-family: 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #e74c3c;">💕 本周匹配结果</h2>
          <p>${userName} 同学你好！</p>
          <p>本周为你匹配到了一位新朋友：</p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>👤 姓名：</strong>${matchedName}</p>
            <p><strong>🎓 年级：</strong>${matchedGrade || '未填写'}</p>
            <p><strong>📚 专业：</strong>${matchedMajor || '未填写'}</p>
          </div>
          <p>快去网站看看 ta 的详细信息，主动打个招呼吧！</p>
          <p style="margin-top: 30px;">
            <a href="${process.env.BASE_URL}/matches" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">查看详情</a>
          </p>
        </div>
      `
    });

    console.log(`✅ 匹配通知邮件已发送至 ${userEmail}`);
    return { success: true };
  } catch (error) {
    console.error('❌ 发送匹配邮件失败:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getResend,
  isMailConfigured,
  sendLoginEmail,
  sendMatchEmail
};