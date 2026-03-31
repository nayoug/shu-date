const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');
const { getWeekNumber } = require('./weekNumber');
require('dotenv').config();
const lovetypeService = require('./lovetypeService');
const dbModule = require('./database');

// bcrypt 工作因子
const BCRYPT_ROUNDS = 10;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_PRUNE_INTERVAL_SECONDS = 15 * 60;
const SESSION_TABLE_NAME = dbModule.SESSION_TABLE_NAME;

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

const AUTH_RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试。';
const MAX_EMAIL_LENGTH_FOR_KEY = 320;
const MAX_CODE_LENGTH_FOR_KEY = 256;

function buildLoginRedirectPath(method, email) {
  const params = new URLSearchParams({
    method
  });
  if (email) {
    params.set('email', email);
  }
  return `/login?${params.toString()}`;
}

function redirectWithMessage(res, path, message, type = 'error') {
  const separator = path.includes('?') ? '&' : '?';
  return res.redirect(303, `${path}${separator}msg=${encodeURIComponent(message)}&type=${encodeURIComponent(type)}`);
}

function hashRateLimitFragment(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getEmailScopedRateLimitKey(req) {
  const ipKey = ipKeyGenerator(req.ip || '');
  const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
  const limitedEmail = rawEmail.slice(0, MAX_EMAIL_LENGTH_FOR_KEY);
  const email = normalizeEmail(limitedEmail);
  return email ? `${ipKey}:email:${hashRateLimitFragment(email)}` : ipKey;
}

function getUserScopedRateLimitKey(req) {
  const ipKey = ipKeyGenerator(req.ip || '');
  const userId = req.session?.userId;
  return userId ? `${ipKey}:user:${userId}` : ipKey;
}

function getResetScopedRateLimitKey(req) {
  const ipKey = ipKeyGenerator(req.ip || '');
  const rawCode = typeof req.params?.code === 'string' ? req.params.code : '';
  const limitedCode = rawCode.slice(0, MAX_CODE_LENGTH_FOR_KEY);
  return limitedCode ? `${ipKey}:reset:${hashRateLimitFragment(limitedCode)}` : ipKey;
}

function createRedirectRateLimiter({ windowMs, limit, keyGenerator, redirectTo, message = AUTH_RATE_LIMIT_MESSAGE }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler(req, res) {
      return redirectWithMessage(res, redirectTo(req), message);
    }
  });
}

function normalizeShortCommitSha(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/[a-f0-9]{7,40}/i);
  return match ? match[0].slice(0, 7).toLowerCase() : null;
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getLatestFileTimestamp(filePaths) {
  let latestTimestamp = null;

  for (const filePath of filePaths) {
    try {
      const { mtimeMs } = fs.statSync(filePath);
      if (Number.isFinite(mtimeMs) && (latestTimestamp === null || mtimeMs > latestTimestamp)) {
        latestTimestamp = mtimeMs;
      }
    } catch {
      // Best-effort fallback: skip missing files.
    }
  }

  return latestTimestamp === null ? null : new Date(latestTimestamp).toISOString();
}

function resolveDeployTime() {
  const explicitDeployTime = normalizeIsoTimestamp(process.env.DEPLOY_TIME);
  if (explicitDeployTime) {
    return explicitDeployTime;
  }

  return getLatestFileTimestamp([
    path.join(__dirname, 'package-lock.json'),
    path.join(__dirname, 'package.json'),
    __filename
  ]);
}

let db = dbModule;
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const appVersion = process.env.APP_VERSION || packageJson.version;
const fullCommitSha = process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || null;
const shortCommitSha = normalizeShortCommitSha(process.env.GIT_COMMIT_SHORT) || normalizeShortCommitSha(fullCommitSha);
const deployTime = resolveDeployTime();
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
);

if (isProduction) {
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  if (adminEmails.size === 0) {
    throw new Error('ADMIN_EMAILS must be set to at least one valid admin email in production');
  }
  app.set('trust proxy', 1);
}

// 中间件配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new PgSession({
    pool: dbModule.getPool(),
    tableName: SESSION_TABLE_NAME,
    ttl: Math.floor(SESSION_MAX_AGE_MS / 1000),
    pruneSessionInterval: SESSION_PRUNE_INTERVAL_SECONDS,
    createTableIfMissing: false,
    errorLog(err) {
      console.error('PostgreSQL session store 错误:', err && err.stack ? err.stack : err);
    }
  }),
  secret: sessionSecret || 'xin_yousuo_shu_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: SESSION_MAX_AGE_MS
  },
  proxy: isProduction
}));

app.use((req, res, next) => {
  res.locals.isDev = !isProduction;
  res.locals.isProduction = isProduction;
  next();
});

// 登录中间件
async function isLoggedIn(req, res, next) {
  try {
    const user = await loadCurrentUserFromSession(req);
    if (user) {
      req.user = user;
      req.isAdmin = adminEmails.has(normalizeEmail(user.email));
      return next();
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

async function loadCurrentUserFromSession(req) {
  if (!req.session?.userId) {
    return null;
  }

  const currentUser = await db.queryOne(`
    SELECT id, email, nickname, name, verified
    FROM users
    WHERE id = $1
  `, [req.session.userId]);

  if (!currentUser) {
    return null;
  }

  const profile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [currentUser.id]);
  const user = {
    id: currentUser.id,
    email: currentUser.email,
    nickname: currentUser.nickname,
    name: currentUser.name,
    verified: currentUser.verified,
    hasProfile: !!profile
  };

  if (user.nickname) {
    req.session.nickname = user.nickname;
  }

  return user;
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.redirect('/');
  }
  next();
}

const loginRateLimiter = createRedirectRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: getEmailScopedRateLimitKey,
  redirectTo(req) {
    return buildLoginRedirectPath('login', normalizeEmail(req.body?.email));
  }
});

const registerRateLimiter = createRedirectRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 5,
  keyGenerator: getEmailScopedRateLimitKey,
  redirectTo(req) {
    return buildLoginRedirectPath('register', normalizeEmail(req.body?.email));
  }
});

const forgotRateLimiter = createRedirectRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 5,
  keyGenerator: getEmailScopedRateLimitKey,
  redirectTo(req) {
    const email = normalizeEmail(req.body?.email);
    return email ? `/forgot?email=${encodeURIComponent(email)}` : '/forgot';
  }
});

const resetRateLimiter = createRedirectRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 8,
  keyGenerator: getResetScopedRateLimitKey,
  redirectTo(req) {
    return `/reset/${encodeURIComponent(req.params?.code || '')}`;
  }
});

const passwordChangeRateLimiter = createRedirectRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 8,
  keyGenerator: getUserScopedRateLimitKey,
  redirectTo() {
    return '/profile/password';
  }
});

const adminActionRateLimiter = createRedirectRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  keyGenerator: getUserScopedRateLimitKey,
  redirectTo() {
    return '/admin';
  }
});

async function findUserByEmailInsensitive(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const exactUser = await db.queryOne(
    'SELECT * FROM users WHERE email = $1',
    [normalizedEmail]
  );
  if (exactUser) {
    return exactUser;
  }

  const legacyMatches = await db.query(
    'SELECT * FROM users WHERE LOWER(email) = $1 ORDER BY verified DESC, created_at DESC, id DESC LIMIT 2',
    [normalizedEmail]
  );
  if (legacyMatches.length > 1) {
    console.warn(`检测到邮箱大小写不一致的重复记录: ${normalizedEmail}`);
  }

  return legacyMatches[0] || null;
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

function renderSafely(res, status, view, locals = {}, fallbackMessage = '页面暂时不可用') {
  res.status(status).render(view, locals, (renderErr, html) => {
    if (!renderErr) {
      return res.send(html);
    }

    console.error(`❌ 渲染 ${view} 失败:`, renderErr.message);
    if (!res.headersSent) {
      res
        .status(status)
        .type('text/plain; charset=utf-8')
        .send(locals.message || fallbackMessage);
    }
  });
}

function isApiRequest(req) {
  return /^\/api(?:\/|$)/.test(req.path || '');
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

async function buildPublicNavigationModel(req) {
  const user = await loadCurrentUserFromSession(req);

  return {
    user,
    nickname: req.session?.nickname || user?.nickname,
    hasProfile: !!user?.hasProfile,
    showPassword: !!user
  };
}

const INFO_PAGE_UPDATED_AT = '2026-03-31';
const INFO_PAGES = {
  privacy: {
    title: '隐私政策',
    pageTitle: '隐私政策',
    lead: '这是内测阶段的最小用户告知说明，用于解释平台当前会收集哪些信息、这些信息会被怎样使用，以及哪些内容可能会在匹配流程中展示给别人。',
    sections: [
      {
        title: '我们会收集哪些信息',
        bullets: [
          '学校邮箱、密码哈希、昵称等账号信息。',
          '问卷中的基础信息、匹配偏好、生活习惯、恋爱观量表、兴趣标签和 LoveType 结果。',
          '匹配结果记录、必要的 Session 数据，以及用于排查问题的最小运行日志。'
        ]
      },
      {
        title: '这些信息会怎么用',
        bullets: [
          '完成注册、登录、邮箱验证、密码重置等账号功能。',
          '计算匹配结果、生成每周正式匹配，并发送验证邮件、重置邮件和匹配通知。',
          '在站内匹配结果页向你展示匹配对象的部分资料；通知邮件中也可能包含对方昵称和年级。'
        ]
      },
      {
        title: '谁可以看到这些信息',
        bullets: [
          '普通用户默认只能看到系统向自己返回的匹配结果，不会直接浏览全站用户列表。',
          '匹配结果页当前会展示对方的年级、性别、校区、兴趣爱好和 LoveType；邮件通知中可能包含对方昵称与年级。',
          '管理员可在后台查看注册邮箱、验证状态、是否填写资料、注册时间等基础管理信息，并在排查故障或处理反馈时接触相关数据。'
        ]
      },
      {
        title: '存储与安全',
        bullets: [
          '密码不会以明文保存，当前使用 bcrypt 哈希存储。',
          'Session 已持久化到 PostgreSQL，默认有效期为 7 天，并定期清理过期记录。',
          '我们会尽量减少不必要的数据暴露，但内测阶段仍不承诺达到正式商业服务的安全等级。'
        ]
      },
      {
        title: '联系与更新',
        paragraphs: [
          '如果你对数据使用方式、权限范围或删除流程有疑问，可以通过 guoy@shu.edu.cn 反馈。',
          '本页会随产品迭代更新；继续使用服务，表示你接受当前公开说明。'
        ]
      }
    ]
  },
  guide: {
    title: '使用说明',
    pageTitle: '使用说明与风险提示',
    lead: '心有所SHU 当前仍处于校园内测阶段。下面这份说明聚焦在“如何使用”以及“使用时应注意哪些风险边界”，帮助你在现有产品能力下更稳妥地体验。',
    sections: [
      {
        title: '基本使用流程',
        bullets: [
          '使用 @shu.edu.cn 邮箱注册并完成邮箱验证。',
          '登录后填写问卷，补全基础信息、匹配偏好和 LoveType 结果。',
          '等待管理员发布本周正式匹配结果，再前往“匹配”页面查看。'
        ]
      },
      {
        title: '当前产品边界',
        bullets: [
          '平台提供的是“认识人”的入口，不保证一定匹配到最合适的人，也不保证建立长期关系。',
          '当前仍以小范围内测为主，功能、文案和算法都可能继续调整。',
          '如果你发现显示异常、页面报错或明显不合理的匹配结果，请及时反馈。'
        ]
      },
      {
        title: '风险提示',
        bullets: [
          '请不要因为系统推荐就立即透露住址、身份证号、银行卡、验证码等敏感信息。',
          '涉及转账、借款、代购、投资、兼职等请求时，请提高警惕并自行核验。',
          '线下见面请优先选择校园内或公共场所，并告知信任的人你的行程。',
          '请尊重对方意愿，不要因系统推荐而实施骚扰、跟踪、截图传播或其他不当行为。'
        ]
      },
      {
        title: '遇到问题怎么办',
        paragraphs: [
          '账号、验证、密码重置、问卷提交、匹配结果等问题，可以通过 guoy@shu.edu.cn 反馈。',
          '如果只是想修改资料，优先使用站内的问卷编辑和密码修改入口。'
        ]
      }
    ]
  },
  dataDeletion: {
    title: '删除数据说明',
    pageTitle: '账号与数据删除说明',
    lead: '平台目前还没有自助“删除账号”按钮。如果你希望删除账号或删除相关数据，请按下面的方式联系管理员处理。',
    sections: [
      {
        title: '如何申请删除',
        bullets: [
          '请使用你注册时绑定的 @shu.edu.cn 邮箱发送邮件到 guoy@shu.edu.cn。',
          '邮件标题建议写成“心有所SHU 删除账号/删除数据申请”。',
          '邮件正文建议注明注册邮箱、昵称，以及你想删除的是“整个账号”还是“部分资料”。'
        ]
      },
      {
        title: '删除后会发生什么',
        bullets: [
          '账号删除后，你将无法继续使用当前账号登录平台。',
          '与你账号直接关联的问卷、匹配结果和 Session 数据会在可行范围内一并清理。',
          '已经发送到邮件系统中的历史通知邮件不一定能被撤回。'
        ]
      },
      {
        title: '如果只是想更正资料',
        paragraphs: [
          '如果你只是想修改昵称、问卷答案或密码，通常不需要删除账号；直接使用站内编辑能力即可。',
          '若你不确定应该“修改资料”还是“删除账号”，也可以先发邮件说明情况，我们会按现有能力给出建议。'
        ]
      }
    ]
  }
};

async function renderInfoPage(req, res, pageKey) {
  const page = INFO_PAGES[pageKey];
  const nav = await buildPublicNavigationModel(req);

  res.render('info-page', {
    ...nav,
    title: page.title,
    pageTitle: page.pageTitle,
    lead: page.lead,
    sections: page.sections,
    updatedAt: INFO_PAGE_UPDATED_AT
  });
}

// ============ 路由 ============

// 首页
app.get('/', wrapAsync(async (req, res) => {
  const user = await loadCurrentUserFromSession(req);

  res.render('index', {
    title: '首页',
    user,
    nickname: req.session.nickname || user?.nickname,
    hasProfile: !!user?.hasProfile,
    showPassword: true,
    message: req.query.msg,
    messageType: req.query.type
  });
}));

app.get('/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    version: appVersion,
    commit: shortCommitSha,
    deployedAt: deployTime
  });
});

app.get('/privacy', wrapAsync(async (req, res) => {
  await renderInfoPage(req, res, 'privacy');
}));

app.get('/guide', wrapAsync(async (req, res) => {
  await renderInfoPage(req, res, 'guide');
}));

app.get('/data-deletion', wrapAsync(async (req, res) => {
  await renderInfoPage(req, res, 'dataDeletion');
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
  res.render('forgot', {
    title: '忘记密码',
    message: req.query.msg,
    messageType: req.query.type,
    email: req.query.email || ''
  });
});

// 发送密码重置邮件
app.post('/forgot', forgotRateLimiter, wrapAsync(async (req, res) => {
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
  const user = await findUserByEmailInsensitive(lowerEmail);

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
    'UPDATE users SET reset_token = $1, reset_token_expire = $2 WHERE id = $3',
    [resetCode, expireTime.toISOString(), user.id]
  );

  // 发送重置邮件
  const { sendPasswordResetEmail } = require('./mailer');
  const result = await sendPasswordResetEmail(lowerEmail, resetCode);

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
    'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expire > NOW()',
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

  res.render('reset', {
    title: '重置密码',
    code: resetCode,
    message: req.query.msg,
    messageType: req.query.type
  });
}));

// 处理密码重置
app.post('/reset/:code', resetRateLimiter, wrapAsync(async (req, res) => {
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
    'SELECT id, nickname FROM users WHERE reset_token = $1 AND reset_token_expire > NOW()',
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
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expire = NULL WHERE id = $2',
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
app.post('/register', registerRateLimiter, wrapAsync(async (req, res) => {
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
  const existingUser = await findUserByEmailInsensitive(lowerEmail);

  if (existingUser) {
    // 检查是否已完成注册（密码和昵称都有且邮箱验证通过）
    if (existingUser.password_hash && existingUser.nickname && existingUser.verified === 1) {
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
app.post('/login', loginRateLimiter, wrapAsync(async (req, res) => {
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
  const user = await findUserByEmailInsensitive(lowerEmail);

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

// 注册入口（已合并到登录页，此路由保留以防旧链接访问）
app.get('/register', (_req, res) => {
  res.redirect('/login');
});

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
// 账户设置
app.get('/settings', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  res.render('settings', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: !!profile
  });
}));

// 修改密码页面
app.get('/settings/password', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  res.render('password', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: !!profile,
    passwordMessage: req.query.msg || '',
    passwordMessageType: req.query.type || ''
  });
}));

// 针对 /settings/password 使用的限流中间件，修正重定向目标
function passwordChangeRateLimiterForSettings(req, res, next) {
  const originalRedirect = res.redirect.bind(res);

  res.redirect = function patchedRedirect(url, ...args) {
    if (url === '/profile/password') {
      url = '/settings/password';
    }
    return originalRedirect(url, ...args);
  };

  passwordChangeRateLimiter(req, res, function (err) {
    // 恢复原始的 redirect 方法，避免影响后续中间件
    res.redirect = originalRedirect;
    return next(err);
  });
}

// 修改密码
app.post('/settings/password', isLoggedIn, passwordChangeRateLimiterForSettings, wrapAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.session.userId]);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.render('password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '请填写所有字段',
      passwordMessageType: 'error'
    });
  }

  if (newPassword.length < 6) {
    return res.render('password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '新密码长度至少6位',
      passwordMessageType: 'error'
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render('password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '两次输入的密码不一致',
      passwordMessageType: 'error'
    });
  }

  // 获取当前用户
  const user = await db.queryOne('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);

  // 如果之前没有密码，则跳过验证
  if (user.password_hash) {
    const currentPasswordValid = await verifyPassword(currentPassword, user.password_hash, db, req.session.userId);
    if (!currentPasswordValid) {
      return res.render('password', {
        user: req.user,
        nickname: req.session.nickname,
        hasProfile: !!profile,
        passwordMessage: '当前密码错误',
        passwordMessageType: 'error'
      });
    }
  }

  // 更新密码
  const passwordHash = await hashPassword(newPassword);
  const result = await db.execute(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, req.session.userId]
  );

  if (result && result.changes === 1) {
    return res.redirect('/settings/password?msg=密码修改成功&type=success');  } else {
    return res.render('password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '密码修改失败，请重试',
      passwordMessageType: 'error'
    });
  }
}));

// 注销账号页面
app.get('/settings/delete', isLoggedIn, ensureCsrfToken, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  res.render('delete-account', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: !!profile,
    csrfToken: req.csrfToken
  });
}));

// 注销账号
app.post('/settings/delete', isLoggedIn, requireValidCsrf, wrapAsync(async (req, res) => {
  const { email, password } = req.body;
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.session.userId]);

  if (!email || !password) {
    return res.render('delete-account', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      deleteMessage: '请填写邮箱和密码',
      deleteMessageType: 'error'
    });
  }

  // 获取当前用户
  const user = await db.queryOne('SELECT id, email, password_hash FROM users WHERE id = $1', [req.session.userId]);

  // 校验邮箱（对输入 email 做 normalize 后再比较）
  const normalizedEmail = normalizeEmail(email);
  if (user.email !== normalizedEmail) {
    return res.render('delete-account', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      deleteMessage: '邮箱或密码错误',
      deleteMessageType: 'error'
    });
  }

  // 校验密码
  if (user.password_hash) {
    const passwordValid = await verifyPassword(password, user.password_hash, db, req.session.userId);
    if (!passwordValid) {
      return res.render('delete-account', {
        user: req.user,
        nickname: req.session.nickname,
        hasProfile: !!profile,
        deleteMessage: '邮箱或密码错误',
        deleteMessageType: 'error'
      });
    }
  }

  // 删除用户数据（使用事务确保原子性）
  const userId = req.session.userId;

  try {
    await db.execute('BEGIN');

    await db.execute('DELETE FROM profiles WHERE user_id = $1', [userId]);
    await db.execute('DELETE FROM matches WHERE user_id_1 = $1 OR user_id_2 = $1', [userId]);
    await db.execute('DELETE FROM users WHERE id = $1', [userId]);

    await db.execute('COMMIT');
  } catch (error) {
    try {
      await db.execute('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back account deletion transaction:', rollbackError);
    }

    console.error('Error deleting user account:', error);
    return res.render('delete-account', {
      nickname: req.session.nickname,
      hasProfile: true,
      deleteMessage: '账号注销失败，请稍后重试',
      deleteMessageType: 'error'
    });
  }
  // 销毁 session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    return res.redirect('/');
  });
}));

// 提交问卷
app.post('/survey/submit', isLoggedIn, wrapAsync(async (req, res) => {
  const data = req.body;

  const lovetypeAnswerMap = {};
  lovetypeService.LOVETYPE_QUESTIONS.forEach(question => {
    lovetypeAnswerMap[question.id] = data[`lovetype_${question.id}`] || '0';
  });
  const lovetypeAssessment = lovetypeService.calculateLoveType(lovetypeAnswerMap);

  const fields = [
    // 基础信息
    'gender', 'preferred_gender', 'my_grade', 'age',
    'age_min', 'age_max', 'purpose',
    'campus', 'accepted_campus',
    'height', 'preferred_height_min', 'preferred_height_max',
    'hometown', 'preferred_hometown', 'core_traits',
    // 恋爱观念
    'relationship_rhythm', 'romantic_ritual', 'relationship_style',
    'sleep_pattern', 'diet_preference', 'spice_tolerance', 'date_preference',
    'spending_style', 'drinking_habit', 'partner_drinking', 'smoking_habit', 'partner_smoking',
    'pet_attitude', 'sexual_timing', 'conflict_style', 'meeting_frequency',
    // 个人特征与匹配偏好
    'my_traits', 'partner_traits',
    'interests', 'partner_interest',
    // LoveType16
    'lovetype_answers', 'lovetype_code', 'lovetype_scores'
  ];

  const values = {};
  // 多选字段
  const multiSelectFields = [
    'accepted_campus', 'core_traits',
    'my_traits', 'partner_traits', 'interests'
  ];
  // 整数字段
  const integerFields = [
    // 基础信息
    'age', 'age_min', 'age_max',
    'height', 'preferred_height_min', 'preferred_height_max',
    // 恋爱观念
    'relationship_rhythm', 'romantic_ritual', 'relationship_style', 
    'sleep_pattern', 'diet_preference', 'spice_tolerance', 'date_preference',
    'spending_style', 'drinking_habit', 'partner_drinking', 'smoking_habit', 'partner_smoking', 
    'pet_attitude', 'sexual_timing', 'conflict_style', 'meeting_frequency',
    // 个人特征与匹配偏好
    'partner_interest'
  ];

  fields.forEach(field => {
    // 多选
    if (multiSelectFields.includes(field)) {
      // 兼容 string -> [string]（单选时 Express 返回 string 而非 array）
      const raw = Array.isArray(data[field])
        ? data[field]
        : (typeof data[field] === 'string' && data[field] ? [data[field]] : []);
      // core_traits 最多 3 项
      const limit = field === 'core_traits' ? 3 : raw.length;
      values[field] = raw.slice(0, limit).join(',');
      return;
    }
    // LoveType16
    if (field === 'lovetype_answers') {
      values[field] = JSON.stringify(lovetypeAssessment.answers);
      return;
    }
    if (field === 'lovetype_code') {
      values[field] = lovetypeAssessment.code;
      return;
    }
    if (field === 'lovetype_scores') {
      values[field] = JSON.stringify(lovetypeAssessment.scores);
      return;
    }
    // 整数
    if (integerFields.includes(field)) {
      const parsed = data[field] ? parseInt(data[field], 10) : null;
      values[field] = (parsed !== null && !isNaN(parsed)) ? parsed : null;
      return;
    }
    // 默认
    values[field] = data[field] || null;
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

// 匹配结果页
app.get('/matches', isLoggedIn, wrapAsync(async (req, res) => {
  if (!req.user.verified) {
    return res.render('matches', {
      title: '匹配结果',
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: false,
      showPassword: true,
      matchSource: 'weekly'
    });
  }

  const profile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);
  if (!profile) {
    return res.redirect('/profile');
  }

  const weekNumber = getWeekNumber();
  const weeklyMatches = await db.query(`
    SELECT
      m.week_number,
      m.score,
      m.matched_at,
      partner.id AS partner_id,
      partner.email AS partner_email,
      partner.nickname AS partner_nickname,
      partner.name AS partner_name,
      p.my_grade AS partner_grade,
      p.gender AS partner_gender,
      p.campus AS partner_campus,
      p.interests AS partner_interests,
      p.lovetype_code AS partner_lovetype_code
    FROM matches m
    JOIN users partner
      ON partner.id = CASE
        WHEN m.user_id_1 = $1 THEN m.user_id_2
        ELSE m.user_id_1
      END
    LEFT JOIN profiles p ON p.user_id = partner.id
    WHERE m.week_number = $2
      AND ($1 = m.user_id_1 OR $1 = m.user_id_2)
    ORDER BY m.matched_at DESC, m.id DESC
    LIMIT 1
  `, [req.user.id, weekNumber]);

  const weeklyMatch = weeklyMatches.length > 0 ? {
    weekNumber: weeklyMatches[0].week_number,
    score: weeklyMatches[0].score,
    matchedAt: weeklyMatches[0].matched_at,
    partner: {
      id: weeklyMatches[0].partner_id,
      email: weeklyMatches[0].partner_email,
      nickname: weeklyMatches[0].partner_nickname || weeklyMatches[0].partner_name || weeklyMatches[0].partner_email?.split('@')[0],
      my_grade: weeklyMatches[0].partner_grade,
      gender: weeklyMatches[0].partner_gender,
      campus: weeklyMatches[0].partner_campus,
      interests: weeklyMatches[0].partner_interests,
      lovetype_code: weeklyMatches[0].partner_lovetype_code
    }
  } : null;

  res.render('matches', {
    title: '匹配结果',
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: true,
    showPassword: true,
    weeklyMatch: weeklyMatch,
    matches: weeklyMatch ? [weeklyMatch.partner] : [],
    isAdmin: req.isAdmin,
    matchSource: 'weekly',
    weekNumber
  });
}));

// API: 获取实时推荐列表
app.get('/api/matches', isLoggedIn, wrapAsync(async (req, res) => {
  const matchService = require('./matchService');
  const matches = await matchService.findMatches(req.user.id);
  res.json({ success: true, source: 'recommendation', data: matches });
}));

// API: 获取前5名实时推荐
app.get('/api/match/top', isLoggedIn, wrapAsync(async (req, res) => {
  const matchService = require('./matchService');
  const matches = await matchService.getTopMatches(req.user.id, 5);
  res.json({ success: true, source: 'recommendation', data: matches });
}));

// 管理页
app.get('/admin', isLoggedIn, requireAdmin, wrapAsync(async (req, res) => {
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
app.get('/admin/match', isLoggedIn, requireAdmin, wrapAsync(async (req, res) => {
  return res.redirect('/admin?msg=' + encodeURIComponent('请使用页面表单触发匹配') + '&type=error');
}));

app.post('/admin/match', isLoggedIn, requireAdmin, adminActionRateLimiter, requireValidCsrf, wrapAsync(async (req, res) => {
  const result = await runWeeklyMatch();
  res.redirect('/admin?msg=' + encodeURIComponent(result.message) + '&type=' + (result.success ? 'success' : 'error'));
}));

// ============ 匹配逻辑 ============

async function runWeeklyMatch() {
  const matchService = require('./matchService');
  const result = await matchService.saveWeeklyMatches();

  if (!result.success) {
    return result;
  }

  const { sendMatchEmail } = require('./mailer');
  const emailTasks = [];
  for (const pair of result.results || []) {
    emailTasks.push(sendMatchEmail(
      pair.user1.email,
      pair.user1.nickname || '同学',
      pair.user2.nickname || 'TA',
      pair.user2.my_grade,
      null
    ));
    emailTasks.push(sendMatchEmail(
      pair.user2.email,
      pair.user2.nickname || '同学',
      pair.user1.nickname || 'TA',
      pair.user1.my_grade,
      null
    ));
  }

  const emailResults = await Promise.all(emailTasks);
  const failedEmailCount = emailResults.filter(item => !item?.success).length;
  if (failedEmailCount > 0) {
    console.error(`❌ 本次匹配共有 ${failedEmailCount} 封邮件发送失败`);
  }

  return result;
}

// 初始化数据库并启动
async function start() {
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

app.use((req, res) => {
  if (isApiRequest(req)) {
    return res.status(404).json({
      success: false,
      error: '接口不存在'
    });
  }

  renderSafely(res, 404, '404', {
    title: '页面不存在',
    statusCode: 404,
    message: '你访问的页面不存在，可能已被移动、删除，或者链接地址写错了。'
  }, '页面不存在');
});

// 统一错误处理中间件
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err.message);

  if (res.headersSent) {
    return next(err);
  }

  if (isApiRequest(req)) {
    return res.status(500).json({
      success: false,
      error: isProduction ? '服务器内部错误' : err.message
    });
  }

  renderSafely(res, 500, 'error', {
    title: '服务器异常',
    statusCode: 500,
    message: isProduction ? '服务器开了点小差，请稍后再试。' : err.message
  }, isProduction ? '服务器内部错误' : err.message);
});

module.exports = app;
