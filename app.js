const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

let db;
const app = express();

// 中间件配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'xin_yousuo_shu_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
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

// ============ 路由 ============

// 首页
app.get('/', async (req, res) => {
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

  if (!email.toLowerCase().endsWith('@shu.edu.cn')) {
    return res.render('login', {
      title: '登录',
      message: '只能使用 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email
    });
  }

  // 检查用户是否存在
  let user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

  // 生成登录验证码
  const loginCode = Math.random().toString(36).substring(2, 10);
  const expireTime = new Date(Date.now() + 10 * 60 * 1000);

  if (user) {
    await db.execute('UPDATE users SET login_code = $1, login_code_expire = $2 WHERE id = $3',
      [loginCode, expireTime.toISOString(), user.id]);
  } else {
    // 自动注册新用户（默认已验证）
    const result = await db.execute('INSERT INTO users (email, login_code, login_code_expire, verified) VALUES ($1, $2, $3, 1)',
      [email.toLowerCase(), loginCode, expireTime.toISOString()]);
    user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  }

  // 发送登录邮件
  const { sendLoginEmail } = require('./mailer');
  const result = await sendLoginEmail(email, loginCode);

  if (result.success) {
    res.render('login', {
      title: '登录',
      message: '验证码已发送到你的邮箱，点击邮件中的链接即可登录',
      messageType: 'success'
    });
  } else {
    res.render('login', {
      title: '登录',
      message: '邮件发送失败，请使用以下链接登录（测试模式）:<br>' + result.url,
      messageType: 'error'
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

  await db.execute('UPDATE users SET login_code = NULL, login_code_expire = NULL WHERE id = $1', [user.id]);
  req.session.userId = user.id;
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

  res.redirect('/?msg=问卷已保存&type=success');
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
  const matches = matchService.getTopMatches(req.user.id, 10);

  res.render('matches', {
    title: '匹配结果',
    user: req.user,
    matches: matches,
    isAdmin: req.isAdmin
  });
});

// API: 获取匹配列表
app.get('/api/matches', isLoggedIn, (req, res) => {
  const matchService = require('./matchService');
  const matches = matchService.findMatches(req.user.id);
  res.json({ success: true, data: matches });
});

// API: 获取前5名
app.get('/api/match/top', isLoggedIn, (req, res) => {
  const matchService = require('./matchService');
  const matches = matchService.getTopMatches(req.user.id, 5);
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
    isAdmin: true
  });
});

// 手动触发匹配
app.get('/admin/match', isLoggedIn, async (req, res) => {
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