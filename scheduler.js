/**
 * 定时任务调度器
 * 负责自动执行每周匹配任务
 */

const cron = require('node-cron');
const matchService = require('./matchService');
const { sendMatchEmail } = require('./mailer');
const { getWeekNumber } = require('./weekNumber');

// 调度器状态
let isSchedulerRunning = false;
let scheduledTask = null;

/**
 * 执行每周匹配任务
 */
async function runWeeklyMatchTask() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔄 开始执行每周匹配任务...`);

  try {
    const result = await matchService.saveWeeklyMatches();

    if (result.success) {
      console.log(`[${timestamp}] ✅ 每周匹配完成: ${result.message}`);

      // 发送匹配通知邮件
      if (result.results && result.results.length > 0) {
        let emailSuccessCount = 0;
        let emailFailCount = 0;

        for (const pair of result.results) {
          try {
            // 发送给 user1
            await sendMatchEmail(
              pair.user1.email,
              pair.user1.nickname || '同学',
              pair.user2.nickname || 'TA',
              pair.user2.my_grade,
              null
            );
            // 发送给 user2
            await sendMatchEmail(
              pair.user2.email,
              pair.user2.nickname || '同学',
              pair.user1.nickname || 'TA',
              pair.user1.my_grade,
              null
            );
            emailSuccessCount += 2;
          } catch (emailError) {
            console.error(`[${timestamp}] ❌ 发送匹配邮件失败:`, emailError.message);
            emailFailCount += 2;
          }
        }

        console.log(`[${timestamp}] 📧 邮件发送完成: 成功 ${emailSuccessCount} 封, 失败 ${emailFailCount} 封`);
      }
    } else {
      console.log(`[${timestamp}] ⏭️ 每周匹配跳过: ${result.message}`);
    }

    return result;
  } catch (error) {
    console.error(`[${timestamp}] ❌ 每周匹配任务执行失败:`, error.message);
    throw error;
  }
}

/**
 * 启动定时任务调度器
 * @param {string} cronExpression - cron 表达式，默认每周一凌晨 5 点执行
 * @returns {boolean} 是否启动成功
 */
function startScheduler(cronExpression = '0 5 * * 1') {
  if (isSchedulerRunning) {
    console.log('⚠️ 调度器已经在运行中');
    return false;
  }

  // 验证 cron 表达式
  if (!cron.validate(cronExpression)) {
    console.error('❌ 无效的 cron 表达式:', cronExpression);
    return false;
  }

  try {
    // 启动定时任务
    scheduledTask = cron.schedule(cronExpression, runWeeklyMatchTask, {
      scheduled: true,
      timezone: 'Asia/Shanghai'
    });

    isSchedulerRunning = true;
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║     ⏰ 定时任务调度器已启动            ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  Cron: ${cronExpression.padEnd(30)}║`);
    console.log('║  时区: Asia/Shanghai                    ║');
    console.log(`║  当前周数: ${String(getWeekNumber()).padEnd(28)}║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    return true;
  } catch (error) {
    console.error('❌ 启动调度器失败:', error.message);
    return false;
  }
}

/**
 * 停止定时任务调度器
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  isSchedulerRunning = false;
  console.log('⏹️ 定时任务调度器已停止');
}

/**
 * 获取调度器状态
 * @returns {Object} 调度器状态信息
 */
function getStatus() {
  return {
    isRunning: isSchedulerRunning,
    currentWeek: getWeekNumber(),
    nextRunTime: isSchedulerRunning ? '每周一凌晨 5:00 (Asia/Shanghai)' : null
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  runWeeklyMatchTask,
  getStatus
};
