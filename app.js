const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();
const lovetypeService = require('./lovetypeService');

let db;
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

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
  },
  proxy: isProduction
}));

// 登录中间件
async function isLoggedIn(req, res, next) {
  if (req.session.userId) {
    const user = await db.queryOne('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    if (user) {
      const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
      req.user = { ...user, hasProfile: !!profile };
      req.isAdmin = user.email === 'admin@shu.edu.cn';
      return next();
    }
  }
  res.redirect('/login');
}

function normalizeEmail(email) {
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

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function buildProfilePageModel(req, profile) {
  const lovetypeAnswers = lovetypeService.parseStoredAnswers(profile?.lovetype_answers);
  const hasLovetypeAnswers = Object.keys(lovetypeAnswers).length > 0;
  const lovetypeAssessment = hasLovetypeAnswers ? lovetypeService.calculateLoveType(lovetypeAnswers) : null;

  return {
    title: '填写问卷',
    user: req.user,
    profile,
    lovetypeQuestions: lovetypeService.LOVETYPE_QUESTIONS,
    lovetypeScaleOptions: lovetypeService.LOVETYPE_SCALE_OPTIONS,
    lovetypeAnswers,
    lovetypeAssessment,
    lovetypeResult: lovetypeAssessment ? lovetypeAssessment.result : null,
    isAdmin: req.isAdmin,
    isDev: !isProduction,
    message: req.query.msg,
    messageType: req.query.type
  };
}

// ============ 路由 ============

// 首页
app.get('/', async (req, res) => {
  console.log('[DEBUG] 首页 sessionID:', req.sessionID, 'userId:', req.session.userId);
  let user = null;
  if (req.session.userId) {
    const u = await db.queryOne('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    if (u) {
      const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [u.id]);
      user = { ...u, hasProfile: !!profile };
    }
  }
  res.render('index', {
    title: '首页',
    user: user,
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
  const { email } = req.body;
  const lowerEmail = email.toLowerCase();

  // 1. 定义白名单（把开发者的邮箱放这里）
  const whiteList = [
    'admain@gmail.com'
  ];

  // 2. 只有既不在白名单，又不符合学校后缀的邮箱才会被拦截
  const isWhiteListed = whiteList.includes(lowerEmail);
  const isShuEmail = lowerEmail.endsWith('@shu.edu.cn');

  if (!isWhiteListed && !isShuEmail) {
    return res.render('login', {
      title: '登录',
      message: '只能使用 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email
    });
  }

  // ... 后续生成验证码并发送邮件的逻辑 ...

  // 检查用户是否存在
  let user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email]);

  // 生成登录验证码
  const loginCode = generateToken(24);
  const expireTime = new Date(Date.now() + 10 * 60 * 1000);
  let writeResult;

  if (user) {
    writeResult = await db.execute('UPDATE users SET login_code = $1, login_code_expire = $2 WHERE id = $3',
      [loginCode, expireTime.toISOString(), user.id]);
  } else {
    // 自动注册新用户（默认已验证）
    writeResult = await db.execute('INSERT INTO users (email, login_code, login_code_expire, verified) VALUES ($1, $2, $3, 1)',
      [email, loginCode, expireTime.toISOString()]);
    user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email]);
  }

  if (!writeResult || writeResult.changes !== 1 || !user) {
    return res.render('login', {
      title: '登录',
      message: '登录链接生成失败，请稍后重试',
      messageType: 'error',
      email
    });
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
  console.log('[DEBUG] /login/verify 接收到的 code:', req.params.code);
  console.log('[DEBUG] 当前时间:', new Date().toISOString());

  const loginCode = req.params.code;

  console.log('[DEBUG] 查询测试用户前的数据库状态:');
  const testUserCheck = await db.queryOne('SELECT id, email, login_code, login_code_expire FROM users WHERE id = 12');
  console.log('[DEBUG] id=12 用户:', testUserCheck);

  // 检查是否为测试用户 (id=1, login_code='abc123456')，测试用户不刷新验证码
  const isTestUser = loginCode === 'abc123456';

  let user;
  if (isTestUser) {
    // 测试用户: 只查询不更新
    user = await db.queryOne(`
      SELECT id FROM users
      WHERE login_code = $1
    `, [loginCode]);
  } else {
    // 普通用户: 使用后清空验证码
    user = await db.queryOne(`
      UPDATE users
      SET login_code = NULL, login_code_expire = NULL
      WHERE login_code = $1 AND login_code_expire > NOW()
      RETURNING id
    `, [loginCode]);
  }

  console.log('[DEBUG] 查询结果 user:', user);

  if (!user) {
    const expiredToken = await db.queryOne('SELECT id FROM users WHERE login_code = $1', [req.params.code]);
    return res.render('login', {
      title: '登录',
      message: expiredToken ? '验证码已过期，请重新获取' : '验证码无效或已过期',
      messageType: 'error'
    });
  }

  try {
    console.log('[DEBUG] 准备建立会话, user.id:', user.id);

    if (isTestUser) {
      // 测试用户: 跳过 session 重新生成，直接设置用户
      req.session.userId = user.id;
      await saveSession(req);
    } else {
      // 普通用户: 重新生成 session 以防安全
      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);
    }

    console.log('[DEBUG] 会话已保存, sessionID:', req.sessionID, 'userId:', req.session.userId);

    // 测试用户: 直接 render 首页而非重定向，确保 session 正确传递
    if (isTestUser) {
      const u = await db.queryOne('SELECT * FROM users WHERE id = $1', [user.id]);
      const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
      const testUser = { ...u, hasProfile: !!profile };
      return res.render('index', {
        title: '首页',
        user: testUser,
        message: '✅ 测试用户登录成功！sessionId=' + req.sessionID,
        messageType: 'success'
      });
    }
  } catch (error) {
    console.error('建立登录会话失败:', error);
    try {
      await destroySession(req);
    } catch (destroyError) {
      console.error('清理登录会话失败:', destroyError);
    }
    return res.render('login', {
      title: '登录',
      message: '登录失败，请重新获取登录链接',
      messageType: 'error'
    });
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
  res.render('profile', buildProfilePageModel(req, profile));
});

// 提交问卷
app.post('/survey/submit', isLoggedIn, async (req, res) => {
  const data = req.body;

  const processMultiSelect = (val) => {
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  };

  const lovetypeAnswerMap = {};
  lovetypeService.LOVETYPE_QUESTIONS.forEach(question => {
    lovetypeAnswerMap[question.id] = data[`lovetype_${question.id}`] || '0';
  });
  const lovetypeAssessment = lovetypeService.calculateLoveType(lovetypeAnswerMap);

  const fields = [
    // 基础信息
    'gender', 'age', 'preferred_gender', 'purpose', 'my_grade',
    'age_diff_min', 'age_diff_max', 'campus', 'accepted_campus',
    'height_min', 'height_max', 'preferred_height_min', 'preferred_height_max',
    // 择偶偏好
    'hometown', 'preferred_hometown', 'core_traits',
    // 恋爱观念
    'communication', 'cohabitation', 'marriage_plan', 'relationship_style',
    // 生活习惯
    'sleep_pattern', 'diet_preference', 'spice_tolerance', 'date_preference', 'spending_style',
    'smoking_habit', 'partner_smoking', 'drinking_habit', 'partner_drinking',
    'pet', 'social_public', 'social_boundary',
    // 兴趣爱好
    'interests', 'partner_interest',
    // LoveType16
    'lovetype_answers', 'lovetype_code', 'lovetype_scores'
  ];

  const values = {};
  fields.forEach(f => {
    if (f === 'core_traits' || f === 'interests' || f === 'accepted_campus') {
      values[f] = processMultiSelect(data[f]);
    } else if (f === 'lovetype_answers') {
      values[f] = JSON.stringify(lovetypeAssessment.answers);
    } else if (f === 'lovetype_code') {
      values[f] = lovetypeAssessment.code;
    } else if (f === 'lovetype_scores') {
      values[f] = JSON.stringify(lovetypeAssessment.scores);
    } else if (f === 'age_diff_min' || f === 'age_diff_max' ||
               f === 'height_min' || f === 'height_max' ||
               f === 'preferred_height_min' || f === 'preferred_height_max' ||
               f === 'sleep_pattern' || f === 'diet_preference' ||
               f === 'spice_tolerance' || f === 'date_preference' ||
               f === 'spending_style' || f === 'smoking_habit' ||
               f === 'partner_smoking' || f === 'drinking_habit' ||
               f === 'partner_drinking' || f === 'partner_interest') {
      // 整数字段
      values[f] = data[f] ? parseInt(data[f], 10) : null;
    } else {
      values[f] = data[f] || null;
    }
  });

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

  res.redirect('/profile?msg=问卷已保存&type=success');
});

// 旧版保存个人资料（兼容）
app.post('/profile', isLoggedIn, (req, res) => {
  res.redirect('/profile');
});

// 匹配结果页
app.get('/matches', isLoggedIn, async (req, res) => {
  if (!req.user.verified) {
    return res.render('matches', { title: '匹配结果', user: req.user });
  }

  const profile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);
  if (!profile) {
    return res.redirect('/profile');
  }

  const matchService = require('./matchService');
  const matches = await matchService.getTopMatches(req.user.id, 10);

  res.render('matches', {
    title: '匹配结果',
    user: req.user,
    matches: matches,
    isAdmin: req.isAdmin
  });
});

// API: 获取匹配列表
app.get('/api/matches', isLoggedIn, async (req, res) => {
  const matchService = require('./matchService');
  const matches = await matchService.findMatches(req.user.id);
  res.json({ success: true, data: matches });
});

// API: 获取前5名
app.get('/api/match/top', isLoggedIn, async (req, res) => {
  const matchService = require('./matchService');
  const matches = await matchService.getTopMatches(req.user.id, 5);
  res.json({ success: true, data: matches });
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
  const weekNumber = getWeekNumber();
  const existing = await db.queryOne('SELECT id FROM matches WHERE week_number = $1', [weekNumber]);
  if (existing) {
    return { success: false, message: '本周已执行匹配' };
  }

  const users = await db.query(`
    SELECT u.id, u.email, u.name
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.verified = 1
  `);

  if (users.length < 2) {
    return { success: false, message: '用户数量不足，需要至少2位用户' };
  }

  const shuffled = users.sort(() => Math.random() - 0.5);
  const pairs = [];

  for (let i = 0; i < shuffled.length - 1; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  if (shuffled.length % 2 === 1 && shuffled.length > 2) {
    pairs.push([shuffled[shuffled.length - 1], shuffled[0]]);
  }

  for (const [u1, u2] of pairs) {
    await db.execute('INSERT INTO matches (user_id_1, user_id_2, week_number) VALUES ($1, $2, $3)',
      [u1.id, u2.id, weekNumber]);

    const p1 = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [u1.id]);
    const p2 = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [u2.id]);

    const { sendMatchEmail } = require('./mailer');
    sendMatchEmail(u1.email, u1.name || '同学', u2.name || 'TA', p2?.my_grade, p2?.major);
    sendMatchEmail(u2.email, u2.name || '同学', u1.name || 'TA', p1?.my_grade, p1?.major);
  }

  return { success: true, message: `匹配完成，共 ${pairs.length} 对` };
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
