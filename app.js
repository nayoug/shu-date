const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();
const lovetypeService = require('./lovetypeService');

// bcrypt 工作因子
const BCRYPT_ROUNDS = 10;

// 密码哈希函数 - 使用 bcrypt
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// 密码验证函数 - 支持自动升级旧 SHA256 哈希
async function verifyPassword(password, hash, db, userId) {
  // 检测哈希格式
  // bcrypt: $2[aby]$[rounds]$[salt+hash] (约60字符)
  // SHA256: 64字符十六进制
  if (hash.length === 64 && /^[a-f0-9]+$/i.test(hash)) {
    // 旧 SHA256 格式 - 验证并升级
    const oldHash = crypto.createHash('sha256').update(password).digest('hex');
    if (oldHash === hash) {
      // 密码正确，升级到 bcrypt
      const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.execute('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
      console.log(`用户 ${userId} 密码哈希已从 SHA256 升级到 bcrypt`);
      return true;
    }
    return false;
  }

  // bcrypt 格式
  return bcrypt.compare(password, hash);
}

// Async wrapper: 将 promise rejection 转为传递给 next(err)
function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
  },
  proxy: false
}));

// 登录中间件
async function isLoggedIn(req, res, next) {
  try {
    if (req.session.userId) {
      const user = await db.queryOne('SELECT * FROM users WHERE id = $1', [req.session.userId]);
      if (user) {
        const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
        req.user = { ...user, hasProfile: !!profile };
        req.isAdmin = user.email === 'admin@shu.edu.cn';
        // 同步更新 session 中的 nickname
        if (user.nickname) {
          req.session.nickname = user.nickname;
        }
        return next();
      }
    }
    res.redirect('/login');
  } catch (err) {
    console.error('isLoggedIn 中间件错误:', err.message);
    res.redirect('/login');
  }
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
  const lovetypeAnswers = lovetypeService.parseStoredAnswers(profile && profile.lovetype_answers);
  const hasLovetypeAnswers = lovetypeAnswers && Object.keys(lovetypeAnswers).length > 0;
  const lovetypeAssessment = hasLovetypeAnswers ? lovetypeService.calculateLoveType(lovetypeAnswers) : null;
  const showResult = lovetypeAssessment && !req.query.edit;

  return {
    title: '填写问卷',
    user: req.user,
    profile,
    lovetypeQuestions: lovetypeService.LOVETYPE_QUESTIONS,
    lovetypeScaleOptions: lovetypeService.LOVETYPE_SCALE_OPTIONS,
    lovetypeAnswers,
    lovetypeAssessment,
    lovetypeResult: showResult && lovetypeAssessment ? lovetypeAssessment.result : null,
    isAdmin: req.isAdmin,
    isDev: !isProduction,
    isProduction,
    message: req.query.msg,
    messageType: req.query.type,
    editMode: req.query.edit === '1'
  };
}

// ============ 路由 ============

// 首页
app.get('/', wrapAsync(async (req, res) => {
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
    nickname: req.session.nickname,
    hasProfile: user ? user.hasProfile : false,
    showPassword: true,
    message: req.query.msg,
    messageType: req.query.type
  });
}));

// 登录页
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  const method = req.query.method || 'login';
  const email = req.query.email || '';
  // 如果是重定向过来的，显示提示信息
  const msg = req.query.msg;
  const type = req.query.type;
  res.render('login', { title: '登录', loginMethod: method, email, message: msg, messageType: type });
});

// 忘记密码页
app.get('/forgot', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('forgot', { title: '忘记密码' });
});

// 发送密码重置邮件
app.post('/forgot', wrapAsync(async (req, res) => {
  const { email } = req.body;
  const lowerEmail = normalizeEmail(email);

  // 验证邮箱格式
  const emailPattern = /^[a-z0-9._%+-]+@shu\.edu\.cn$/;
  if (!emailPattern.test(lowerEmail)) {
    return res.render('forgot', {
      title: '忘记密码',
      message: '请输入 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email: lowerEmail
    });
  }

  // 查找用户
  const user = await db.queryOne('SELECT * FROM users WHERE email = $1', [lowerEmail]);

  if (!user) {
    return res.render('forgot', {
      title: '忘记密码',
      message: '该邮箱未注册，请先注册',
      messageType: 'error',
      email: lowerEmail
    });
  }

  // 生成重置验证码
  const resetCode = generateToken(24);
  const expireTime = new Date(Date.now() + 30 * 60 * 1000); // 30分钟有效

  await db.execute(
    'UPDATE users SET login_code = $1, login_code_expire = $2 WHERE id = $3',
    [resetCode, expireTime.toISOString(), user.id]
  );

  // 发送重置邮件
  const { sendLoginEmail } = require('./mailer');
  const result = await sendLoginEmail(lowerEmail, resetCode);

  if (result.success || (result.simulated && !isProduction)) {
    res.render('forgot', {
      title: '忘记密码',
      message: '重置链接已发送到你的邮箱，请查收',
      messageType: 'success',
      email: lowerEmail
    });
  } else {
    res.render('forgot', {
      title: '忘记密码',
      message: '邮件发送失败，请稍后重试',
      messageType: 'error',
      email: lowerEmail
    });
  }
}));

// 密码重置页
app.get('/reset/:code', wrapAsync(async (req, res) => {
  const resetCode = req.params.code;

  const user = await db.queryOne(
    'SELECT id FROM users WHERE login_code = $1 AND login_code_expire > NOW()',
    [resetCode]
  );

  if (!user) {
    return res.render('login', {
      title: '登录',
      message: '重置链接已过期，请重新发起',
      messageType: 'error',
      loginMethod: 'login'
    });
  }

  res.render('reset', { title: '重置密码', code: resetCode });
}));

// 处理密码重置
app.post('/reset/:code', wrapAsync(async (req, res) => {
  const { code } = req.params;
  const { password, confirmPassword } = req.body;

  if (!password || password.length < 6) {
    return res.render('reset', {
      title: '重置密码',
      message: '密码长度至少6位',
      messageType: 'error',
      code
    });
  }

  if (password !== confirmPassword) {
    return res.render('reset', {
      title: '重置密码',
      message: '两次输入的密码不一致',
      messageType: 'error',
      code
    });
  }

  const user = await db.queryOne(
    'SELECT id, nickname FROM users WHERE login_code = $1 AND login_code_expire > NOW()',
    [code]
  );

  if (!user) {
    return res.render('login', {
      title: '登录',
      message: '重置链接已过期，请重新发起',
      messageType: 'error',
      loginMethod: 'login'
    });
  }

  // 更新密码
  const passwordHash = await hashPassword(password);
  await db.execute(
    'UPDATE users SET password_hash = $1, login_code = NULL, login_code_expire = NULL WHERE id = $2',
    [passwordHash, user.id]
  );

  // 自动登录
  try {
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.nickname = user.nickname;
    await saveSession(req);
    res.redirect('/');
  } catch (error) {
    res.redirect('/login');
  }
}));

// 注册
app.post('/register', wrapAsync(async (req, res) => {
  const { email, password, nickname } = req.body;
  const lowerEmail = normalizeEmail(email);

  // 验证邮箱格式
  const emailPattern = /^[a-z0-9._%+-]+@shu\.edu\.cn$/;
  if (!emailPattern.test(lowerEmail)) {
    return res.render('login', {
      title: '登录',
      message: '请使用 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'register'
    });
  }

  // 验证密码
  if (!password || password.length < 6) {
    return res.render('login', {
      title: '登录',
      message: '密码长度至少6位',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'register'
    });
  }

  // 验证昵称
  if (!nickname || nickname.trim().length === 0) {
    return res.render('login', {
      title: '登录',
      message: '请输入昵称',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'register'
    });
  }

  // 检查用户是否已存在
  const existingUser = await db.queryOne('SELECT * FROM users WHERE email = $1', [lowerEmail]);

  if (existingUser) {
    // 检查是否已完成注册（密码和昵称都有）
    if (existingUser.password_hash && existingUser.nickname) {
      return res.redirect('/login?method=login&msg=' + encodeURIComponent('该邮箱已完成注册，请直接登录') + '&type=info');
    }
    // 用户存在但未完成注册，更新信息
    const passwordHash = await hashPassword(password);
    const verificationToken = generateToken();
    await db.execute(
      'UPDATE users SET password_hash = $1, nickname = $2, verification_token = $3, verification_expire = $4, verified = 0 WHERE id = $5',
      [passwordHash, nickname.trim(), verificationToken, new Date(Date.now() + 30 * 60 * 1000), existingUser.id]
    );
    // 发送验证邮件
    const { sendVerifyEmail } = require('./mailer');
    const verifyResult = await sendVerifyEmail(lowerEmail, verificationToken);
    let message = '请前往邮箱点击验证链接完成验证。';
    let messageType = 'success';
    if (verifyResult && verifyResult.simulated) {
      message += ` （测试模式：<a href="${verifyResult.url}">${verifyResult.url}</a>）`;
    }
    return res.render('login', {
      title: '登录',
      message,
      messageType,
      loginMethod: 'login'
    });
  }

  // 创建新用户（未验证状态）
  const passwordHash = await hashPassword(password);
  const verificationToken = generateToken();
  const writeResult = await db.execute(
    'INSERT INTO users (email, password_hash, nickname, verified, verification_token, verification_expire) VALUES ($1, $2, $3, 0, $4, $5)',
    [lowerEmail, passwordHash, nickname.trim(), verificationToken, new Date(Date.now() + 30 * 60 * 1000)]
  );

  if (!writeResult || writeResult.changes !== 1) {
    return res.render('login', {
      title: '登录',
      message: '注册失败，请稍后重试',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'register'
    });
  }

  // 发送验证邮件
  const { sendVerifyEmail } = require('./mailer');
  const verifyResult = await sendVerifyEmail(lowerEmail, verificationToken);

  // 无论邮件是否发送成功，都显示验证提示（邮件发送失败时显示模拟链接）
  let message = '注册成功！请前往邮箱点击验证链接完成验证。';
  let messageType = 'success';

  if (verifyResult && verifyResult.simulated) {
    message += ` （测试模式：<a href="${verifyResult.url}">${verifyResult.url}</a>）`;
  } else if (verifyResult && !verifyResult.success) {
    message = '注册成功，但邮件发送失败。请稍后尝试重新发送验证邮件。';
    messageType = 'warning';
  }

  return res.render('login', {
    title: '登录',
    message,
    messageType,
    loginMethod: 'login'
  });
}));

// 登录
app.post('/login', wrapAsync(async (req, res) => {
  const { email, password } = req.body;
  const lowerEmail = normalizeEmail(email);

  // 验证邮箱格式
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(lowerEmail)) {
    return res.render('login', {
      title: '登录',
      message: '请输入有效的邮箱地址',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login'
    });
  }

  // 查找用户
  const user = await db.queryOne('SELECT * FROM users WHERE email = $1', [lowerEmail]);

  if (!user) {
    return res.redirect('/login?method=register&email=' + encodeURIComponent(lowerEmail) + '&msg=' + encodeURIComponent('账号不存在，请先注册') + '&type=error');
  }

  // 检查是否完成注册（需要有密码和昵称和邮箱）
  if (!user.password_hash || !user.nickname || !user.email) {
    return res.redirect('/login?method=register&email=' + encodeURIComponent(lowerEmail) + '&msg=' + encodeURIComponent('你还未设置密码，请先完成注册') + '&type=warning');
  }

  // 验证密码
  const passwordValid = await verifyPassword(password, user.password_hash, db, user.id);
  if (!passwordValid) {
    return res.render('login', {
      title: '登录',
      message: '密码错误，请重试',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login'
    });
  }

  // 检查邮箱是否已验证
  if (!user.verified) {
    return res.render('login', {
      title: '登录',
      message: '邮箱还未验证，请先查收验证邮件完成验证',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login'
    });
  }

  // 登录成功
  try {
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.nickname = user.nickname;
    await saveSession(req);
  } catch (error) {
    console.error('建立登录会话失败:', error);
    return res.render('login', {
      title: '登录',
      message: '登录失败，请重试',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login'
    });
  }

  res.redirect('/');
}));

// 退出登录
app.get('/logout', wrapAsync(async (req, res) => {
  try {
    await destroySession(req);
  } catch (error) {
    console.error('退出登录失败:', error);
  }
  res.redirect('/login');
}));

// 注册页（已合并到登录流程）
app.get('/register', (req, res) => {
  res.redirect('/login');
});


// 发送登录验证码（已有账户）
app.post('/login/code', wrapAsync(async (req, res) => {
  const { email } = req.body;
  const lowerEmail = normalizeEmail(email);

  // 验证邮箱格式
  const emailPattern = /^[a-z0-9._%+-]+@shu\.edu\.cn$/;
  if (!emailPattern.test(lowerEmail)) {
    return res.render('login', {
      title: '登录',
      message: '请使用 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'code'
    });
  }

  // 检查用户是否存在
  let user = await db.queryOne('SELECT * FROM users WHERE email = $1', [lowerEmail]);

  // 如果用户存在但没有密码或昵称，视为未完成注册
  if (user && (!user.password_hash || !user.nickname || !user.email)) {
    return res.redirect('/login?method=register&email=' + encodeURIComponent(lowerEmail) + '&msg=' + encodeURIComponent('你还未设置密码，请先完成注册') + '&type=warning');
  }

  // 生成登录验证码
  const loginCode = generateToken(24);
  const expireTime = new Date(Date.now() + 30 * 60 * 1000);
  let writeResult;

  if (user) {
    writeResult = await db.execute(
      'UPDATE users SET login_code = $1, login_code_expire = $2 WHERE id = $3',
      [loginCode, expireTime.toISOString(), user.id]
    );
  } else {
    // 自动注册新用户（默认已验证）
    writeResult = await db.execute(
      'INSERT INTO users (email, login_code, login_code_expire, verified) VALUES ($1, $2, $3, 1)',
      [lowerEmail, loginCode, expireTime.toISOString()]
    );
    user = await db.queryOne('SELECT * FROM users WHERE email = $1', [lowerEmail]);
  }

  if (!writeResult || writeResult.changes !== 1 || !user) {
    return res.render('login', {
      title: '登录',
      message: '登录链接生成失败，请稍后重试',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'code'
    });
  }

  // 发送登录邮件
  const { sendLoginEmail } = require('./mailer');
  const result = await sendLoginEmail(lowerEmail, loginCode);

  if (result.success) {
    res.render('login', {
      title: '登录',
      message: '验证码已发送到你的邮箱，点击邮件中的链接即可登录。由于校内网关限制，邮件可能会有 1-2 分钟延迟，请耐心等待',
      messageType: 'success',
      email: lowerEmail,
      loginMethod: 'code'
    });
  } else if (result.simulated && !isProduction) {
    res.render('login', {
      title: '登录',
      message: '当前未配置邮件服务。开发环境可直接使用下方测试链接登录。',
      messageType: 'info',
      email: lowerEmail,
      debugLoginUrl: result.url,
      loginMethod: 'code'
    });
  } else {
    res.render('login', {
      title: '登录',
      message: '邮件发送失败，请稍后重试或联系管理员',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'code'
    });
  }
}));

// 验证码登录
app.get('/login/verify/:code', wrapAsync(async (req, res) => {
  const loginCode = req.params.code;

  // 检查是否为测试用户 (id=1, login_code='abc123456')，测试用户不刷新验证码
  const isTestUser = loginCode === 'abc123456';

  let user;
  if (isTestUser) {
    // 测试用户: 只查询不更新
    user = await db.queryOne(`
      SELECT id, nickname, email FROM users
      WHERE login_code = $1
    `, [loginCode]);
  } else {
    // 普通用户: 使用后清空验证码
    user = await db.queryOne(`
      UPDATE users
      SET login_code = NULL, login_code_expire = NULL
      WHERE login_code = $1 AND login_code_expire > NOW()
      RETURNING id, nickname, email
    `, [loginCode]);
  }

  if (!user) {
    const expiredToken = await db.queryOne('SELECT id FROM users WHERE login_code = $1', [req.params.code]);
    return res.render('login', {
      title: '登录',
      message: expiredToken ? '验证码已过期，请重新获取' : '验证码无效或已过期',
      messageType: 'error',
      loginMethod: 'code'
    });
  }

  try {
    // 重新生成 session 并设置用户
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.nickname = user.nickname || user.email.split('@')[0];
    await saveSession(req);

    // 测试用户: 重定向到首页，确保 session cookie 正确传递
    if (isTestUser) {
      return res.redirect('/');
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
}));

// 验证注册邮箱
app.get('/register/verify/:token', wrapAsync(async (req, res) => {
  try {
    const token = req.params.token;

    // 按token查询用户
    const user = await db.queryOne(
      'SELECT id, email, nickname, verified, verification_expire, verification_token FROM users WHERE verification_token = $1',
      [token]
    );

    if (!user) {
      return res.render('login', {
        title: '登录',
        message: '验证链接无效',
        messageType: 'error',
        loginMethod: 'login'
      });
    }

    // 检查token是否过期
    if (!user.verification_expire || new Date(user.verification_expire) < new Date()) {
      return res.render('login', {
        title: '登录',
        message: '验证链接已过期，请重新注册',
        messageType: 'error',
        loginMethod: 'login'
      });
    }

    if (user.verified) {
      return res.render('login', {
        title: '登录',
        message: '邮箱已验证，请直接登录',
        messageType: 'success',
        loginMethod: 'login'
      });
    }

    // 更新为已验证，并使token失效
    const result = await db.execute(
      'UPDATE users SET verified = 1, verification_token = NULL, verification_expire = NULL WHERE id = $1',
      [user.id]
    );

    if (result && result.changes === 1) {
      return res.render('login', {
        title: '登录',
        message: '邮箱验证成功！请登录',
        messageType: 'success',
        loginMethod: 'login'
      });
    } else {
      return res.render('login', {
        title: '登录',
        message: '验证失败，请稍后重试',
        messageType: 'error',
        loginMethod: 'login'
      });
    }
  } catch (error) {
    console.error('验证邮箱失败:', error);
    return res.render('login', {
      title: '登录',
      message: '验证链接无效',
      messageType: 'error',
      loginMethod: 'login'
    });
  }
}));

// 个人资料页（问卷）
app.get('/profile', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  const hasProfile = !!profile;
  const model = buildProfilePageModel(req, profile);
  // 传递导航栏所需变量
  model.nickname = req.session.nickname;
  model.hasProfile = hasProfile;
  model.showPassword = false; // profile页面隐藏修改密码
  // 传递密码修改相关变量
  model.passwordMessage = req.query.passwordMsg || (res.locals.passwordMessage || '');
  model.passwordMessageType = res.locals.passwordMessageType || '';
  res.render('profile', model);
}));

// 提交问卷
app.post('/survey/submit', isLoggedIn, wrapAsync(async (req, res) => {
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
    'age_min', 'age_max', 'campus', 'accepted_campus',
    'height_min', 'preferred_height_min', 'preferred_height_max',
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
    } else if (f === 'age_min' || f === 'age_max' ||
               f === 'height_min' ||
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
}));

// 旧版保存个人资料（兼容）
app.post('/profile', isLoggedIn, (req, res) => {
  res.redirect('/profile');
});

// 修改密码页面
app.get('/profile/password', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  const hasProfile = !!profile;
  const model = buildProfilePageModel(req, profile);
  model.nickname = req.session.nickname;
  model.hasProfile = hasProfile;
  model.showPassword = true; // 显示修改密码
  model.passwordMessage = req.query.msg || '';
  model.passwordMessageType = req.query.type || '';
  res.render('profile', model);
}));

// 修改密码
app.post('/profile/password', isLoggedIn, wrapAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  // 获取当前用户的 profile
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  const hasProfile = !!profile;

  const baseModel = buildProfilePageModel(req, profile);
  baseModel.nickname = req.session.nickname;
  baseModel.hasProfile = hasProfile;
  baseModel.showPassword = true; // 始终显示修改密码表单

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.render('profile', Object.assign(baseModel, {
      passwordMessage: '请填写所有字段',
      passwordMessageType: 'error'
    }));
  }

  if (newPassword.length < 6) {
    return res.render('profile', Object.assign(baseModel, {
      passwordMessage: '新密码长度至少6位',
      passwordMessageType: 'error'
    }));
  }

  if (newPassword !== confirmPassword) {
    return res.render('profile', Object.assign(baseModel, {
      passwordMessage: '两次输入的密码不一致',
      passwordMessageType: 'error'
    }));
  }

  // 获取当前用户
  const user = await db.queryOne('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);

  // 如果之前没有密码，则跳过验证
  if (user.password_hash) {
    const currentPasswordValid = await verifyPassword(currentPassword, user.password_hash, db, req.session.userId);
    if (!currentPasswordValid) {
      return res.render('profile', Object.assign(baseModel, {
        passwordMessage: '当前密码错误',
        passwordMessageType: 'error'
      }));
    }
  }

  // 更新密码
  const passwordHash = await hashPassword(newPassword);
  const result = await db.execute(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, req.session.userId]
  );

  if (result && result.changes === 1) {
    return res.render('profile', Object.assign(baseModel, {
      passwordMessage: '密码修改成功',
      passwordMessageType: 'success'
    }));
  } else {
    return res.render('profile', Object.assign(baseModel, {
      passwordMessage: '密码修改失败，请重试',
      passwordMessageType: 'error'
    }));
  }
}));

// 匹配结果页
app.get('/matches', isLoggedIn, wrapAsync(async (req, res) => {
  if (!req.user.verified) {
    return res.render('matches', {
      title: '匹配结果',
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: false,
      showPassword: true
    });
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
    nickname: req.session.nickname,
    hasProfile: true,
    showPassword: true,
    matches: matches,
    isAdmin: req.isAdmin
  });
}));

// API: 获取匹配列表
app.get('/api/matches', isLoggedIn, wrapAsync(async (req, res) => {
  const matchService = require('./matchService');
  const matches = await matchService.findMatches(req.user.id);
  res.json({ success: true, data: matches });
}));

// API: 获取前5名
app.get('/api/match/top', isLoggedIn, wrapAsync(async (req, res) => {
  const matchService = require('./matchService');
  const matches = await matchService.getTopMatches(req.user.id, 5);
  res.json({ success: true, data: matches });
}));

// 管理页
app.get('/admin', isLoggedIn, wrapAsync(async (req, res) => {
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
}));

// 手动触发匹配
app.get('/admin/match', isLoggedIn, wrapAsync(async (req, res) => {
  if (!req.isAdmin) return res.redirect('/');
  return res.redirect('/admin?msg=' + encodeURIComponent('请使用页面表单触发匹配') + '&type=error');
}));

app.post('/admin/match', isLoggedIn, requireValidCsrf, wrapAsync(async (req, res) => {
  if (!req.isAdmin) return res.redirect('/');
  const result = await runWeeklyMatch();
  res.redirect('/admin?msg=' + encodeURIComponent(result.message) + '&type=' + (result.success ? 'success' : 'error'));
}));

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
    SELECT u.id, u.email, u.nickname
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
    sendMatchEmail(u1.email, u1.nickname || '同学', u2.nickname || 'TA', p2?.my_grade, p2?.major);
    sendMatchEmail(u2.email, u2.nickname || '同学', u1.nickname || 'TA', p1?.my_grade, p1?.major);
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
  ║     访问: http://localhost:${PORT}        ║
  ╚════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);

// 统一错误处理中间件
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err.message);
  res.status(500).render('error', {
    message: isProduction ? '服务器内部错误' : err.message
  });
});

module.exports = app;
