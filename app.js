const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

let dbModule;
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'admin@shu.edu.cn')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

if (isProduction) {
  app.set('trust proxy', 1);
}

// 中间件配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'xin_yousuo_shu_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// 登录中间件
function isLoggedIn(req, res, next) {
  if (req.session.userId) {
    const user = dbModule.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      const profile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
      req.user = { ...user, hasProfile: !!profile };
      req.isAdmin = ADMIN_EMAILS.has((user.email || '').toLowerCase());
      return next();
    }
  }
  res.redirect('/login');
}

function normalizeEmail(email = '') {
  return email.trim().toLowerCase();
}

function generateToken(size = 24) {
  return crypto.randomBytes(size).toString('hex');
}

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken(16);
  }

  return req.session.csrfToken;
}

function requireValidCsrf(req, res, next) {
  if (req.body?.csrfToken && req.session.csrfToken === req.body.csrfToken) {
    return next();
  }

  return res.redirect('/admin?msg=' + encodeURIComponent('请求无效，请刷新页面后重试') + '&type=error');
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

// ============ 路由 ============

// 首页
app.get('/', (req, res) => {
  let user = null;
  let isAdmin = false;
  if (req.session.userId) {
    const u = dbModule.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (u) {
      const profile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(u.id);
      user = { ...u, hasProfile: !!profile };
      isAdmin = ADMIN_EMAILS.has((u.email || '').toLowerCase());
    }
  }
  res.render('index', {
    title: '首页',
    user: user,
    isAdmin,
    message: req.query.msg,
    messageType: req.query.type
  });
});

// 登录页 - 输入邮箱
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { title: '登录' });
});

// 发送登录验证码
app.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email.endsWith('@shu.edu.cn')) {
    return res.render('login', {
      title: '登录',
      message: '只能使用 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email
    });
  }

  // 检查用户是否存在
  let user = dbModule.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // 生成登录验证码
  const loginCode = generateToken(24);
  const expireTime = new Date(Date.now() + 10 * 60 * 1000);

  if (user) {
    dbModule.prepare('UPDATE users SET login_code = ?, login_code_expire = ? WHERE id = ?')
      .run(loginCode, expireTime.toISOString(), user.id);
  } else {
    // 自动注册新用户（默认已验证）
    dbModule.prepare('INSERT INTO users (email, login_code, login_code_expire, verified) VALUES (?, ?, ?, 1)')
      .run(email, loginCode, expireTime.toISOString());
    user = dbModule.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  // 发送登录邮件
  const { sendLoginEmail } = require('./mailer');

  const result = await sendLoginEmail(email, loginCode);

  if (result.success) {
    res.render('login', {
      title: '登录',
      message: '验证码已发送到你的邮箱，点击邮件中的链接即可登录',
      messageType: 'success',
      email
    });
  } else if (result.simulated && !isProduction) {
    res.render('login', {
      title: '登录',
      message: '当前未配置邮件服务。开发环境可直接使用下方测试链接登录。',
      messageType: 'info',
      email,
      debugLoginUrl: result.url
    });
  } else {
    res.render('login', {
      title: '登录',
      message: '邮件发送失败，请稍后重试或联系管理员',
      messageType: 'error',
      email
    });
  }
});

// 验证码登录
app.get('/login/verify/:code', async (req, res) => {
  const user = dbModule.prepare('SELECT * FROM users WHERE login_code = ?').get(req.params.code);

  if (!user) {
    return res.render('login', {
      title: '登录',
      message: '验证码无效或已过期',
      messageType: 'error'
    });
  }

  if (new Date(user.login_code_expire) < new Date()) {
    return res.render('login', {
      title: '登录',
      message: '验证码已过期，请重新获取',
      messageType: 'error'
    });
  }

  dbModule.prepare('UPDATE users SET login_code = NULL, login_code_expire = NULL WHERE id = ?').run(user.id);
  try {
    await regenerateSession(req);
    req.session.userId = user.id;
    res.redirect('/');
  } catch (error) {
    console.error('重建登录会话失败:', error);
    res.render('login', {
      title: '登录',
      message: '登录失败，请重新获取登录链接',
      messageType: 'error'
    });
  }
});

// 注册页（已合并到登录流程）
app.get('/register', (req, res) => {
  res.redirect('/login');
});

// 个人资料页（问卷）
app.get('/profile', isLoggedIn, (req, res) => {
  const profile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  res.render('profile', {
    title: '填写问卷',
    user: req.user,
    profile,
    message: req.query.msg,
    messageType: req.query.type,
    isAdmin: req.isAdmin
  });
});

// 提交问卷（完整24题，删除第6题）
app.post('/survey/submit', isLoggedIn, (req, res) => {
  const data = req.body;

  // 处理多选字段（checkbox返回数组）
  const processMultiSelect = (val) => {
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  };

  // 字段列表（删除expected_graduation）
  const fields = [
    'gender', 'preferred_gender', 'purpose', 'my_grade', 'preferred_grade',
    'campus', 'cross_campus', 'height', 'preferred_height',
    'hometown', 'preferred_hometown', 'core_traits', 'long_distance',
    'communication', 'spending', 'cohabitation', 'marriage_plan', 'relationship_style',
    'sleep_schedule', 'smoke_alcohol', 'pet', 'social_public', 'social_boundary', 'interests'
  ];

  const values = {};
  fields.forEach(f => {
    if (f === 'core_traits' || f === 'interests') {
      values[f] = processMultiSelect(data[f]);
    } else {
      values[f] = data[f] || null;
    }
  });

  try {
    const existing = dbModule.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.user.id);

    if (existing) {
      const setClauses = fields.map(f => `${f} = ?`).join(', ');
      const sql = `UPDATE profiles SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`;
      dbModule.prepare(sql).run(...fields.map(f => values[f]), req.user.id);
    } else {
      const cols = ['user_id', ...fields].join(', ');
      const placeholders = ['?', ...fields.map(() => '?')].join(', ');
      const sql = `INSERT INTO profiles (${cols}) VALUES (${placeholders})`;
      dbModule.prepare(sql).run(req.user.id, ...fields.map(f => values[f]));
    }
  } catch (error) {
    console.error('保存问卷失败:', error);
    return res.redirect('/profile?msg=' + encodeURIComponent('问卷保存失败，请重试') + '&type=error');
  }

  res.redirect('/?msg=问卷已保存&type=success');
});

// 旧版保存个人资料（兼容）
app.post('/profile', isLoggedIn, (req, res) => {
  res.redirect('/profile');
});

// 匹配结果页 - 显示匹配列表和分数
app.get('/matches', isLoggedIn, (req, res) => {
  if (!req.user.verified) {
    return res.render('matches', {
      title: '匹配结果',
      user: req.user,
      isAdmin: req.isAdmin
    });
  }

  const profile = dbModule.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.user.id);
  if (!profile) {
    return res.redirect('/profile');
  }

  const matchService = require('./matchService');
  const { matches, source } = matchService.getMatchesForDisplay(req.user.id, 10);

  res.render('matches', {
    title: '匹配结果',
    user: req.user,
    matches,
    matchSource: source,
    isAdmin: req.isAdmin
  });
});

// API: 获取匹配列表
app.get('/api/matches', isLoggedIn, (req, res) => {
  const matchService = require('./matchService');
  const result = matchService.getMatchesForDisplay(req.user.id);
  res.json({ success: true, data: result.matches, source: result.source });
});

// API: 获取前5名
app.get('/api/match/top', isLoggedIn, (req, res) => {
  const matchService = require('./matchService');
  const result = matchService.getMatchesForDisplay(req.user.id, 5);
  res.json({ success: true, data: result.matches, source: result.source });
});

// 管理页
app.get('/admin', isLoggedIn, (req, res) => {
  if (!req.isAdmin) return res.redirect('/');

  const users = dbModule.prepare(`
    SELECT u.*, CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as hasProfile
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ORDER BY u.created_at DESC
  `).all();

  res.render('admin', {
    title: '管理',
    user: req.user,
    users,
    weekNumber: getWeekNumber(),
    csrfToken: ensureCsrfToken(req),
    message: req.query.msg,
    messageType: req.query.type,
    isAdmin: true
  });
});

// 手动触发匹配
app.get('/admin/match', isLoggedIn, (req, res) => {
  if (!req.isAdmin) return res.redirect('/');
  return res.redirect('/admin?msg=' + encodeURIComponent('请使用页面表单触发匹配') + '&type=error');
});

app.post('/admin/match', isLoggedIn, requireValidCsrf, async (req, res) => {
  if (!req.isAdmin) return res.redirect('/');
  const result = await runWeeklyMatch();
  res.redirect('/admin?msg=' + encodeURIComponent(result.message) + '&type=' + (result.success ? 'success' : 'error'));
});

// 登出
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ============ 匹配逻辑 ============

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  return Math.floor(diff / 604800000);
}

async function runWeeklyMatch() {
  const matchService = require('./matchService');
  const result = matchService.saveWeeklyMatches();
  if (!result.success) {
    return result;
  }

  const { sendMatchEmail } = require('./mailer');
  const emailJobs = result.results.flatMap(pair => ([
    sendMatchEmail(pair.user.email, pair.user.name || '同学', pair.match.name || 'TA', pair.match.my_grade, pair.score),
    sendMatchEmail(pair.match.email, pair.match.name || '同学', pair.user.name || 'TA', pair.user.my_grade, pair.score)
  ]));
  const emailResults = await Promise.allSettled(emailJobs);
  const failedEmails = emailResults.filter(item =>
    item.status === 'rejected' || (item.status === 'fulfilled' && item.value?.success === false)
  ).length;

  if (failedEmails > 0) {
    return {
      ...result,
      message: `${result.message}，但有 ${failedEmails} 封通知邮件发送失败`
    };
  }

  return result;
}

// 初始化数据库并启动
async function start() {
  dbModule = require('./database');
  await dbModule.initDatabase();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`
  ╔════════════════════════════════════════╗
  ║     💕 心有所SHU 服务器已启动          ║
  ║     访问: http://localhost:${PORT}           ║
  ╚════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);

module.exports = app;
