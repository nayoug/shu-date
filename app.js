const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

let db;
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'admin@shu.edu.cn')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

if (isProduction) {
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  app.set('trust proxy', 1);
}

// 中间件配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: sessionSecret || 'xin_yousuo_shu_secret',
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
async function isLoggedIn(req, res, next) {
  if (req.session.userId) {
    const user = await db.queryOne('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    if (user) {
      const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
      req.user = { ...user, hasProfile: !!profile };
      req.isAdmin = ADMIN_EMAILS.has((user.email || '').toLowerCase());
      return next();
    }
  }
  res.redirect('/login');
}

function normalizeEmail(email) {
  // Handle arrays from repeated form fields like "email=a&email=b"
  if (Array.isArray(email)) {
    email = email[0];
  }

  if (email === undefined || email === null) {
    email = '';
  }

  if (typeof email !== 'string') {
    return '';
  }
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

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(error => {
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
app.get('/', async (req, res) => {
  let user = null;
  let isAdmin = false;
  if (req.session.userId) {
    const u = await db.queryOne('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    if (u) {
      const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [u.id]);
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
  let user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email]);

  // 生成登录验证码
  const loginCode = generateToken(24);
  const expireTime = new Date(Date.now() + 10 * 60 * 1000);

  if (user) {
    await db.execute('UPDATE users SET login_code = $1, login_code_expire = $2 WHERE id = $3',
      [loginCode, expireTime.toISOString(), user.id]);
  } else {
    // 自动注册新用户（默认已验证）
    const result = await db.execute('INSERT INTO users (email, login_code, login_code_expire, verified) VALUES ($1, $2, $3, 1)',
      [email, loginCode, expireTime.toISOString()]);
    user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email]);
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
  const user = await db.queryOne('SELECT * FROM users WHERE login_code = $1', [req.params.code]);

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

  try {
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
  } catch (error) {
    console.error('建立登录会话失败:', error);
    return res.render('login', {
      title: '登录',
      message: '登录失败，请重新获取登录链接',
      messageType: 'error'
    });
  }

  try {
    await db.execute('UPDATE users SET login_code = NULL, login_code_expire = NULL WHERE id = $1', [user.id]);
  } catch (error) {
    console.error('清理登录验证码失败:', error);
  }

  res.redirect('/');
});

// 注册页（已合并到登录流程）
app.get('/register', (req, res) => {
  res.redirect('/login');
});

// 个人资料页（问卷）
app.get('/profile', isLoggedIn, async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  res.render('profile', {
    title: '填写问卷',
    user: req.user,
    profile,
    message: req.query.msg,
    messageType: req.query.type,
    isAdmin: req.isAdmin
  });
});

// 提交问卷
app.post('/survey/submit', isLoggedIn, async (req, res) => {
  const data = req.body;

  const processMultiSelect = (val) => {
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  };

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
    const existing = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);

    if (existing) {
      const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
      const params = [...fields.map(f => values[f]), req.user.id];
      await db.execute(`UPDATE profiles SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${fields.length + 1}`, params);
    } else {
      const cols = ['user_id', ...fields].join(', ');
      const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ');
      const params = [req.user.id, ...fields.map(f => values[f])];
      await db.execute(`INSERT INTO profiles (${cols}) VALUES ($1, ${placeholders})`, params);
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

// 匹配结果页
app.get('/matches', isLoggedIn, async (req, res) => {
  if (!req.user.verified) {
    return res.render('matches', {
      title: '匹配结果',
      user: req.user,
      isAdmin: req.isAdmin
    });
  }

  const profile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);
  if (!profile) {
    return res.redirect('/profile');
  }

  const matchService = require('./matchService');
  const { matches, source } = await matchService.getMatchesForDisplay(req.user.id, 10);

  res.render('matches', {
    title: '匹配结果',
    user: req.user,
    matches,
    matchSource: source,
    isAdmin: req.isAdmin
  });
});

// API: 获取匹配列表
app.get('/api/matches', isLoggedIn, async (req, res) => {
  const matchService = require('./matchService');
  const result = await matchService.getMatchesForDisplay(req.user.id);
  res.json({ success: true, data: result.matches, source: result.source });
});

// API: 获取前5名
app.get('/api/match/top', isLoggedIn, async (req, res) => {
  const matchService = require('./matchService');
  const result = await matchService.getMatchesForDisplay(req.user.id, 5);
  res.json({ success: true, data: result.matches, source: result.source });
});

// 管理页
app.get('/admin', isLoggedIn, async (req, res) => {
  if (!req.isAdmin) return res.redirect('/');

  const users = await db.query(`
    SELECT u.*, CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as hasProfile
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ORDER BY u.created_at DESC
  `);

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
app.get('/admin/match', isLoggedIn, async (req, res) => {
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
  const result = await matchService.saveWeeklyMatches();
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
  const dbModule = require('./database');
  db = dbModule;
  await db.initDatabase();

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
