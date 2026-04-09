const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');
const { getWeekNumber, getYear } = require('./weekNumber');
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
const WEEK_NUMBER_MIN = 0;
const WEEK_NUMBER_MAX = 53;
const UI_EXPERIENCE_COOKIE = 'ui_experience';
const UI_EXPERIENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const V2_VIEW_MAP = {
  index: 'v2/index',
  login: 'v2/login',
  forgot: 'v2/forgot',
  reset: 'v2/reset',
  profile: 'v2/profile',
  matches: 'v2/matches',
  admin: 'v2/admin',
  settings: 'v2/settings',
  notifications: 'v2/notifications',
  password: 'v2/password',
  'delete-account': 'v2/delete-account',
  'info-page': 'v2/info-page'
};
const CLASSIC_FALLBACK_PREFIXES = ['/couple-match'];

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

function parseRequestCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((cookies, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) {
      return cookies;
    }

    const rawValue = rest.join('=');
    try {
      cookies[rawKey] = decodeURIComponent(rawValue || '');
    } catch {
      cookies[rawKey] = rawValue || '';
    }

    return cookies;
  }, {});
}

function getUiExperience(req) {
  const cookies = parseRequestCookies(req);
  return cookies[UI_EXPERIENCE_COOKIE] === 'v2' ? 'v2' : 'classic';
}

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/';
  }

  return returnTo;
}

function buildExperienceSwitchUrl(mode, returnTo) {
  const params = new URLSearchParams();
  const safeReturnTo = sanitizeReturnTo(returnTo);

  if (safeReturnTo !== '/') {
    params.set('returnTo', safeReturnTo);
  }

  const query = params.toString();
  return `/experience/${mode}${query ? `?${query}` : ''}`;
}

function shouldRenderClassicFallbackNotice(req) {
  const requestPath = req.path || '';
  return req.isV2Enabled
    && req.method === 'GET'
    && CLASSIC_FALLBACK_PREFIXES.some(prefix => requestPath === prefix || requestPath.startsWith(`${prefix}/`));
}

function resolveExperienceView(req, classicView) {
  if (req.isV2Enabled && V2_VIEW_MAP[classicView]) {
    return V2_VIEW_MAP[classicView];
  }

  return classicView;
}

function renderExperienceView(req, res, classicView, locals = {}) {
  return res.render(resolveExperienceView(req, classicView), locals);
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
app.use(express.json()); // 支持 JSON body (cron 服务可能使用 application/json)
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
  const uiExperience = getUiExperience(req);
  const currentUrl = sanitizeReturnTo(req.originalUrl || '/');

  req.uiExperience = uiExperience;
  req.isV2Enabled = uiExperience === 'v2';
  res.locals.uiExperience = uiExperience;
  res.locals.isV2Enabled = req.isV2Enabled;
  res.locals.switchToV2Url = buildExperienceSwitchUrl('v2', currentUrl);
  res.locals.switchToClassicUrl = buildExperienceSwitchUrl('classic', currentUrl);
  res.locals.showV2FallbackNotice = shouldRenderClassicFallbackNotice(req);
  res.locals.v2FallbackMessage = res.locals.showV2FallbackNotice
    ? '该页面暂未适配新版，当前显示经典版'
    : '';
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

// Cron 调度接口限流器
const cronRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  limit: 10, // 最多10次
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator(req) {
    return `cron:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || '')}`;
  },
  handler(req, res) {
    console.warn('[Cron] 调度请求被限流');
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      timestamp: new Date().toISOString()
    });
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

async function ensureDevPreviewUser() {
  const devEmail = 'dev-preview@shu.edu.cn';
  const devNickname = '开发预览';
  let user = await findUserByEmailInsensitive(devEmail);

  if (!user) {
    const passwordHash = await hashPassword('123456');
    await db.execute(
      'INSERT INTO users (email, password_hash, nickname, verified) VALUES ($1, $2, $3, 1)',
      [devEmail, passwordHash, devNickname]
    );
    user = await findUserByEmailInsensitive(devEmail);
  } else if (!user.verified || !user.nickname) {
    await db.execute(
      'UPDATE users SET verified = 1, nickname = COALESCE(NULLIF(nickname, \'\'), $1) WHERE id = $2',
      [devNickname, user.id]
    );
    user = await findUserByEmailInsensitive(devEmail);
  }

  return user;
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

async function confirmCurrentUserPassword(req, password) {
  const user = await db.queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!user?.password_hash) {
    return false;
  }
  return verifyPassword(password || '', user.password_hash, db, req.user.id);
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
    editMode: req.query.edit === '1',
    pageKey: 'profile'
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
        title: '注销与数据删除',
        bullets: [
          '您可以随时在“设置”页面注销账号。',
          '注销后，系统会立即删除您的账号信息、问卷数据、匹配记录及相关个人资料，使其不再参与任何匹配流程或展示。',
          '系统运行过程中产生的最小必要日志（如邮件发送记录、错误日志）可能会在短期内保留，仅用于系统安全与故障排查，不会用于匹配或对外展示。',
          '注销完成后，该账号将无法恢复，如需再次使用需要重新注册。'
        ]
      },
      {
        title: '联系与更新',
        bullets: [
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
        bullets: [
          '账号、验证、密码重置、问卷提交、匹配结果等问题，可以通过 guoy@shu.edu.cn 反馈。',
          '如果只是想修改资料，优先使用站内的问卷编辑和密码修改入口。'
        ]
      }
    ]
  }
};

async function renderInfoPage(req, res, pageKey) {
  const page = INFO_PAGES[pageKey];
  const nav = await buildPublicNavigationModel(req);

  renderExperienceView(req, res, 'info-page', {
    ...nav,
    title: page.title,
    pageTitle: page.pageTitle,
    lead: page.lead,
    sections: page.sections,
    updatedAt: INFO_PAGE_UPDATED_AT,
    pageKey
  });
}

// ============ 路由 ============

// 首页
app.get('/', wrapAsync(async (req, res) => {
  const user = await loadCurrentUserFromSession(req);

  renderExperienceView(req, res, 'index', {
    title: '首页',
    user,
    nickname: req.session.nickname || user?.nickname,
    hasProfile: !!user?.hasProfile,
    showPassword: true,
    pageKey: 'home',
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

app.get('/experience/:mode', (req, res) => {
  const mode = req.params.mode === 'v2' ? 'v2' : 'classic';
  const returnTo = sanitizeReturnTo(req.query.returnTo || '/');
  const cookieOptions = {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: UI_EXPERIENCE_MAX_AGE_MS
  };

  if (mode === 'v2') {
    res.cookie(UI_EXPERIENCE_COOKIE, 'v2', cookieOptions);
  } else {
    res.clearCookie(UI_EXPERIENCE_COOKIE, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProduction
    });
  }

  return res.redirect(returnTo);
});

// 登录页
app.get('/login', (req, res) => {
  if (req.session.userId) {
    // 检查用户是否还存在，避免已注销账号但 session 仍有效的死循环
    return db.queryOne('SELECT id FROM users WHERE id = $1', [req.session.userId])
      .then(user => {
        if (!user) {
          // 用户已删除，清除 session
          return req.session.destroy(err => {
            if (err) {
              console.error('Failed to destroy session for deleted user during /login', err);
              return res.status(500).send('Internal Server Error');
            }
            return res.redirect('/login');
          });
        }
        return res.redirect('/');
      })
      .catch(() => {
        // 数据库错误时清除 session
        return req.session.destroy(err => {
          if (err) {
            console.error('Failed to destroy session after DB error during /login', err);
            return res.status(500).send('Internal Server Error');
          }
          return res.redirect('/login');
        });
      });
  }
  const method = req.query.method || 'login';
  const email = req.query.email || '';
  // 如果是重定向过来的，显示提示信息
  const msg = req.query.msg;
  const type = req.query.type;
  renderExperienceView(req, res, 'login', {
    title: '登录',
    loginMethod: method,
    email,
    debugLoginUrl: !isProduction ? `/dev/test-login?returnTo=${encodeURIComponent(getUiExperience(req) === 'v2' ? '/experience/v2' : '/')}` : null,
    message: msg,
    messageType: type,
    pageKey: 'login'
  });
});

app.get('/dev/test-login', wrapAsync(async (req, res) => {
  if (isProduction) {
    return res.status(404).type('text/plain; charset=utf-8').send('Not found');
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo || '/');
  const user = await ensureDevPreviewUser();

  if (!user) {
    return res.status(500).type('text/plain; charset=utf-8').send('测试账号初始化失败');
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.nickname = user.nickname || user.name || '开发预览';
  await saveSession(req);
  return res.redirect(returnTo);
}));

// 忘记密码页
app.get('/forgot', (req, res) => {
  renderExperienceView(req, res, 'forgot', {
    title: '忘记密码',
    message: req.query.msg,
    messageType: req.query.type,
    email: req.query.email || '',
    pageKey: 'forgot'
  });
});

// 发送密码重置邮件
app.post('/forgot', forgotRateLimiter, wrapAsync(async (req, res) => {
  const { email } = req.body;
  const lowerEmail = normalizeEmail(email);

  // 验证邮箱格式
  const emailPattern = /^[a-z0-9._%+-]+@shu\.edu\.cn$/;
  if (!emailPattern.test(lowerEmail)) {
    return renderExperienceView(req, res, 'forgot', {
      title: '忘记密码',
      message: '请输入 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email: lowerEmail,
      pageKey: 'forgot'
    });
  }

  // 查找用户
  const user = await findUserByEmailInsensitive(lowerEmail);

  if (!user) {
    return renderExperienceView(req, res, 'forgot', {
      title: '忘记密码',
      message: '该邮箱未注册，请先注册',
      messageType: 'error',
      email: lowerEmail,
      pageKey: 'forgot'
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
    const messageHtml = result.simulated && result.url
      ? `测试模式：<a href="${result.url}">${result.url}</a>`
      : '';
    renderExperienceView(req, res, 'forgot', {
      title: '忘记密码',
      message: '重置链接已发送到你的邮箱，请查收',
      messageType: 'success',
      messageHtml,
      email: lowerEmail,
      pageKey: 'forgot'
    });
  } else {
    renderExperienceView(req, res, 'forgot', {
      title: '忘记密码',
      message: '邮件发送失败，请稍后重试',
      messageType: 'error',
      email: lowerEmail,
      pageKey: 'forgot'
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
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '重置链接已过期，请重新发起',
      messageType: 'error',
      loginMethod: 'login',
      pageKey: 'login'
    });
  }

  renderExperienceView(req, res, 'reset', {
    title: '重置密码',
    code: resetCode,
    message: req.query.msg,
    messageType: req.query.type,
    pageKey: 'reset'
  });
}));

// 处理密码重置
app.post('/reset/:code', resetRateLimiter, wrapAsync(async (req, res) => {
  const { code } = req.params;
  const { password, confirmPassword } = req.body;

  if (!password || password.length < 6) {
    return renderExperienceView(req, res, 'reset', {
      title: '重置密码',
      message: '密码长度至少6位',
      messageType: 'error',
      code,
      pageKey: 'reset'
    });
  }

  if (password !== confirmPassword) {
    return renderExperienceView(req, res, 'reset', {
      title: '重置密码',
      message: '两次输入的密码不一致',
      messageType: 'error',
      code,
      pageKey: 'reset'
    });
  }

  const user = await db.queryOne(
    'SELECT id, nickname FROM users WHERE reset_token = $1 AND reset_token_expire > NOW()',
    [code]
  );

  if (!user) {
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '重置链接已过期，请重新发起',
      messageType: 'error',
      loginMethod: 'login',
      pageKey: 'login'
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
  const { email, password, confirmPassword, nickname } = req.body;
  const lowerEmail = normalizeEmail(email);
  const trimmedNickname = typeof nickname === 'string' ? nickname.trim() : '';

  function renderRegisterError(message) {
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message,
      messageType: 'error',
      email: lowerEmail,
      nickname: trimmedNickname,
      loginMethod: 'register',
      pageKey: 'login'
    });
  }

  // 验证邮箱格式
  const emailPattern = /^[a-z0-9._%+-]+@shu\.edu\.cn$/;
  if (!emailPattern.test(lowerEmail)) {
    return renderRegisterError('请使用 @shu.edu.cn 结尾的学校邮箱');
  }

  // 验证密码
  if (!password || password.length < 6) {
    return renderRegisterError('密码长度至少6位');
  }

  if (password !== confirmPassword) {
    return renderRegisterError('两次输入的密码不一致');
  }

  // 验证昵称
  if (!trimmedNickname) {
    return renderRegisterError('请输入昵称');
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
      [passwordHash, trimmedNickname, verificationToken, new Date(Date.now() + 30 * 60 * 1000), existingUser.id]
    );
    // 发送验证邮件
    const { sendVerifyEmail } = require('./mailer');
    const verifyResult = await sendVerifyEmail(lowerEmail, verificationToken);
    let message = '请前往邮箱点击验证链接完成验证。';
    let messageType = 'success';
    let messageHtml = '';
    if (verifyResult && verifyResult.simulated) {
      messageHtml = `测试模式：<a href="${verifyResult.url}">${verifyResult.url}</a>`;
    }
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message,
      messageType,
      messageHtml,
      loginMethod: 'login',
      pageKey: 'login'
    });
  }

  // 创建新用户（未验证状态）
  const passwordHash = await hashPassword(password);
  const verificationToken = generateToken();
  const writeResult = await db.execute(
    'INSERT INTO users (email, password_hash, nickname, verified, verification_token, verification_expire) VALUES ($1, $2, $3, 0, $4, $5)',
    [lowerEmail, passwordHash, trimmedNickname, verificationToken, new Date(Date.now() + 30 * 60 * 1000)]
  );

  if (!writeResult || writeResult.changes !== 1) {
    return renderRegisterError('注册失败，请稍后重试');
  }

  // 发送验证邮件
  const { sendVerifyEmail } = require('./mailer');
  const verifyResult = await sendVerifyEmail(lowerEmail, verificationToken);

  // 无论邮件是否发送成功，都显示验证提示（邮件发送失败时显示模拟链接）
  let message = '注册成功！请前往邮箱点击验证链接完成验证。';
  let messageType = 'success';
  let messageHtml = '';

  if (verifyResult && verifyResult.simulated) {
    messageHtml = `测试模式：<a href="${verifyResult.url}">${verifyResult.url}</a>`;
  } else if (verifyResult && !verifyResult.success) {
    message = '注册成功，但邮件发送失败。请稍后尝试重新发送验证邮件。';
    messageType = 'warning';
  }

  return renderExperienceView(req, res, 'login', {
    title: '登录',
    message,
    messageType,
    messageHtml,
    loginMethod: 'login',
    pageKey: 'login'
  });
}));

// 登录
app.post('/login', loginRateLimiter, wrapAsync(async (req, res) => {
  const { email, password } = req.body;
  const lowerEmail = normalizeEmail(email);

  // 验证邮箱格式
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(lowerEmail)) {
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '请输入有效的邮箱地址',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login',
      pageKey: 'login'
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
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '密码错误，请重试',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login',
      pageKey: 'login'
    });
  }

  // 检查邮箱是否已验证
  if (!user.verified) {
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '邮箱还未验证，请先查收验证邮件完成验证',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login',
      pageKey: 'login'
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
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '登录失败，请重试',
      messageType: 'error',
      email: lowerEmail,
      loginMethod: 'login',
      pageKey: 'login'
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
      return renderExperienceView(req, res, 'login', {
        title: '登录',
        message: '验证链接无效',
        messageType: 'error',
        loginMethod: 'login',
        pageKey: 'login'
      });
    }

    // 检查token是否过期
    if (!user.verification_expire || new Date(user.verification_expire) < new Date()) {
      return renderExperienceView(req, res, 'login', {
        title: '登录',
        message: '验证链接已过期，请重新注册',
        messageType: 'error',
        loginMethod: 'login',
        pageKey: 'login'
      });
    }

    if (user.verified) {
      return renderExperienceView(req, res, 'login', {
        title: '登录',
        message: '邮箱已验证，请直接登录',
        messageType: 'success',
        loginMethod: 'login',
        pageKey: 'login'
      });
    }

    // 更新为已验证，并使token失效
    const result = await db.execute(
      'UPDATE users SET verified = 1, verification_token = NULL, verification_expire = NULL WHERE id = $1',
      [user.id]
    );

    if (result && result.changes === 1) {
      return renderExperienceView(req, res, 'login', {
        title: '登录',
        message: '邮箱验证成功！请登录',
        messageType: 'success',
        loginMethod: 'login',
        pageKey: 'login'
      });
    } else {
      return renderExperienceView(req, res, 'login', {
        title: '登录',
        message: '验证失败，请稍后重试',
        messageType: 'error',
        loginMethod: 'login',
        pageKey: 'login'
      });
    }
  } catch (error) {
    console.error('验证邮箱失败:', error);
    return renderExperienceView(req, res, 'login', {
      title: '登录',
      message: '验证链接无效',
      messageType: 'error',
      loginMethod: 'login',
      pageKey: 'login'
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
  renderExperienceView(req, res, 'profile', model);
}));
// 账户设置
app.get('/settings', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  renderExperienceView(req, res, 'settings', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: !!profile,
    pageKey: 'settings'
  });
}));

// 通知中心
app.get('/notifications', isLoggedIn, wrapAsync(async (req, res) => {
  const notifications = await db.query(`
    SELECT n.*, cr.status
    FROM notifications n
    LEFT JOIN couple_requests cr ON cr.id = n.related_request_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
    LIMIT 20
  `, [req.user.id]);

  if (notifications.some(n => !n.is_read)) {
    await db.execute('UPDATE notifications SET is_read = 1 WHERE user_id = $1 AND is_read = 0', [req.user.id]);
  }

  renderExperienceView(req, res, 'notifications', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: req.user.hasProfile,
    notifications,
    message: req.query.msg,
    messageType: req.query.type,
    pageKey: 'notifications'
  });
}));

// 修改密码页面
app.get('/settings/password', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  renderExperienceView(req, res, 'password', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: !!profile,
    passwordMessage: req.query.msg || '',
    passwordMessageType: req.query.type || '',
    pageKey: 'settings-password'
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
    return renderExperienceView(req, res, 'password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '请填写所有字段',
      passwordMessageType: 'error',
      pageKey: 'settings-password'
    });
  }

  if (newPassword.length < 6) {
    return renderExperienceView(req, res, 'password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '新密码长度至少6位',
      passwordMessageType: 'error',
      pageKey: 'settings-password'
    });
  }

  if (newPassword !== confirmPassword) {
    return renderExperienceView(req, res, 'password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '两次输入的密码不一致',
      passwordMessageType: 'error',
      pageKey: 'settings-password'
    });
  }

  // 获取当前用户
  const user = await db.queryOne('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);

  // 如果之前没有密码，则跳过验证
  if (user.password_hash) {
    const currentPasswordValid = await verifyPassword(currentPassword, user.password_hash, db, req.session.userId);
    if (!currentPasswordValid) {
      return renderExperienceView(req, res, 'password', {
        user: req.user,
        nickname: req.session.nickname,
        hasProfile: !!profile,
        passwordMessage: '当前密码错误',
        passwordMessageType: 'error',
        pageKey: 'settings-password'
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
    return renderExperienceView(req, res, 'password', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      passwordMessage: '密码修改失败，请重试',
      passwordMessageType: 'error',
      pageKey: 'settings-password'
    });
  }
}));

// 注销账号页面
app.get('/settings/delete', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  renderExperienceView(req, res, 'delete-account', {
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: !!profile,
    csrfToken: ensureCsrfToken(req),
    pageKey: 'settings-delete'
  });
}));

// 注销账号
app.post('/settings/delete', isLoggedIn, requireValidCsrf, wrapAsync(async (req, res) => {
  const { email, password } = req.body;
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [req.session.userId]);

  if (!email || !password) {
    return renderExperienceView(req, res, 'delete-account', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      csrfToken: ensureCsrfToken(req),
      deleteMessage: '请填写邮箱和密码',
      deleteMessageType: 'error',
      pageKey: 'settings-delete'
    });
  }

  // 获取当前用户
  const user = await db.queryOne('SELECT id, email, password_hash FROM users WHERE id = $1', [req.session.userId]);

  // 校验邮箱（对输入 email 做 normalize 后再比较）
  const normalizedEmail = normalizeEmail(email);
  if (user.email !== normalizedEmail) {
    return renderExperienceView(req, res, 'delete-account', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: !!profile,
      csrfToken: ensureCsrfToken(req),
      deleteMessage: '邮箱或密码错误',
      deleteMessageType: 'error',
      pageKey: 'settings-delete'
    });
  }

  // 校验密码
  if (user.password_hash) {
    const passwordValid = await verifyPassword(password, user.password_hash, db, req.session.userId);
    if (!passwordValid) {
      return renderExperienceView(req, res, 'delete-account', {
        user: req.user,
        nickname: req.session.nickname,
        hasProfile: !!profile,
        csrfToken: ensureCsrfToken(req),
        deleteMessage: '邮箱或密码错误',
        deleteMessageType: 'error',
        pageKey: 'settings-delete'
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
    return renderExperienceView(req, res, 'delete-account', {
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: true,
      csrfToken: ensureCsrfToken(req),
      deleteMessage: '账号注销失败，请稍后重试',
      deleteMessageType: 'error',
      pageKey: 'settings-delete'
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
    return renderExperienceView(req, res, 'matches', {
      title: '匹配结果',
      user: req.user,
      nickname: req.session.nickname,
      hasProfile: false,
      showPassword: true,
      matchSource: 'weekly',
      pageKey: 'matches'
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
    WHERE m.match_year = $3 AND m.week_number = $2
      AND ($1 = m.user_id_1 OR $1 = m.user_id_2)
    ORDER BY m.matched_at DESC, m.id DESC
    LIMIT 1
  `, [req.user.id, weekNumber, getYear()]);

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

  renderExperienceView(req, res, 'matches', {
    title: '匹配结果',
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: true,
    showPassword: true,
    weeklyMatch: weeklyMatch,
    matches: weeklyMatch ? [weeklyMatch.partner] : [],
    isAdmin: req.isAdmin,
    matchSource: 'weekly',
    weekNumber,
    pageKey: 'matches'
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

// 情侣匹配页
app.get('/couple-match', isLoggedIn, wrapAsync(async (req, res) => {
  const profile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);
  if (!profile) {
    return res.redirect('/profile?msg=请先填写问卷&type=warning');
  }

  const myRequests = await db.query(`
    SELECT cr.id, cr.status, cr.created_at, u.nickname, u.email
    FROM couple_requests cr
    JOIN users u ON u.id = cr.receiver_id
    WHERE cr.requester_id = $1
    ORDER BY cr.created_at DESC
    LIMIT 10
  `, [req.user.id]);

  const receivedRequests = await db.query(`
    SELECT cr.id, cr.status, cr.created_at, u.nickname, u.email
    FROM couple_requests cr
    JOIN users u ON u.id = cr.requester_id
    WHERE cr.receiver_id = $1
    ORDER BY cr.created_at DESC
    LIMIT 10
  `, [req.user.id]);

  const acceptedMatches = await db.query(`
    SELECT cr.id, cr.created_at as matched_at,
      CASE
        WHEN cr.requester_id = $1 THEN receiver.id
        ELSE requester.id
      END as partner_id,
      CASE
        WHEN cr.requester_id = $1 THEN receiver.nickname
        ELSE requester.nickname
      END as partner_nickname,
      CASE
        WHEN cr.requester_id = $1 THEN receiver.email
        ELSE requester.email
      END as partner_email
    FROM couple_requests cr
    JOIN users requester ON requester.id = cr.requester_id
    JOIN users receiver ON receiver.id = cr.receiver_id
    WHERE (cr.requester_id = $1 OR cr.receiver_id = $1)
      AND cr.status = 'accepted'
    ORDER BY cr.updated_at DESC
  `, [req.user.id]);

  res.render('couple-match', {
    title: '情侣匹配度测试',
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: true,
    myRequests,
    receivedRequests,
    acceptedMatches,
    message: req.query.msg,
    messageType: req.query.type
  });
}));

// 发送情侣匹配度测试申请
app.post('/couple-match/request', isLoggedIn, wrapAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.redirect('/couple-match?msg=请输入对方邮箱&type=error');
  }

  const targetUser = await findUserByEmailInsensitive(email);
  if (!targetUser) {
    return res.redirect('/couple-match?msg=用户不存在&type=error');
  }

  if (targetUser.id === req.user.id) {
    return res.redirect('/couple-match?msg=不能对自己发起匹配申请&type=error');
  }

  const targetProfile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [targetUser.id]);
  if (!targetProfile) {
    return res.redirect('/couple-match?msg=对方还未填写问卷&type=error');
  }

  const existingRequest = await db.queryOne(`
    SELECT id FROM couple_requests
    WHERE (requester_id = $1 AND receiver_id = $2)
       OR (requester_id = $2 AND receiver_id = $1)
  `, [req.user.id, targetUser.id]);

  if (existingRequest) {
    return res.redirect('/couple-match?msg=已存在匹配申请&type=error');
  }

  const todayCount = await db.queryOne(`
    SELECT COUNT(*) as count FROM couple_requests
    WHERE requester_id = $1 AND created_at >= CURRENT_DATE
  `, [req.user.id]);

  if (parseInt(todayCount?.count || '0', 10) >= 3) {
    return res.redirect('/couple-match?msg=今日申请次数已达上限（3次）&type=error');
  }

  const result = await db.execute(`
    INSERT INTO couple_requests (requester_id, receiver_id, status)
    VALUES ($1, $2, 'pending')
  `, [req.user.id, targetUser.id]);

  if (!result || result.changes !== 1) {
    return res.redirect('/couple-match?msg=发送失败，请重试&type=error');
  }

  const newRequest = await db.queryOne(`
    SELECT id FROM couple_requests
    WHERE requester_id = $1 AND receiver_id = $2
    ORDER BY id DESC LIMIT 1
  `, [req.user.id, targetUser.id]);

  await db.execute(`
    INSERT INTO notifications (user_id, type, content, related_user_id, related_request_id)
    VALUES ($1, 'match_request', $2, $3, $4)
  `, [
    targetUser.id,
    `用户 ${req.user.nickname || req.user.email} 请求与你进行情侣匹配度测试`,
    req.user.id,
    newRequest.id
  ]);

  res.redirect('/couple-match?msg=匹配申请已发送&type=success');
}));

// 同意情侣匹配度测试申请
app.post('/couple-match/accept/:id', isLoggedIn, wrapAsync(async (req, res) => {
  const requestId = parseInt(req.params.id, 10);

  const coupleRequest = await db.queryOne(`
    SELECT cr.*, requester.nickname as requester_nickname, receiver.nickname as receiver_nickname
    FROM couple_requests cr
    JOIN users requester ON requester.id = cr.requester_id
    JOIN users receiver ON receiver.id = cr.receiver_id
    WHERE cr.id = $1 AND cr.receiver_id = $2 AND cr.status = 'pending'
  `, [requestId, req.user.id]);

  if (!coupleRequest) {
    return res.redirect('/notifications?msg=匹配请求不存在或已处理&type=error');
  }

  await db.execute(`
    UPDATE couple_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [requestId]);

  await db.execute(`
    INSERT INTO notifications (user_id, type, content, related_user_id, related_request_id)
    VALUES ($1, 'match_accepted', $2, $3, $4)
  `, [
    coupleRequest.requester_id,
    `用户 ${req.user.nickname || req.user.email} 已同意你的情侣匹配度测试申请`,
    req.user.id,
    requestId
  ]);

  res.redirect(`/couple-match/result/${requestId}?msg=匹配成功&type=success`);
}));

// 拒绝情侣匹配度测试申请
app.post('/couple-match/reject/:id', isLoggedIn, wrapAsync(async (req, res) => {
  const requestId = parseInt(req.params.id, 10);

  const coupleRequest = await db.queryOne(`
    SELECT cr.*, requester.nickname as requester_nickname
    FROM couple_requests cr
    JOIN users requester ON requester.id = cr.requester_id
    WHERE cr.id = $1 AND cr.receiver_id = $2 AND cr.status = 'pending'
  `, [requestId, req.user.id]);

  if (!coupleRequest) {
    return res.redirect('/notifications?msg=匹配请求不存在或已处理&type=error');
  }

  await db.execute(`
    UPDATE couple_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [requestId]);

  await db.execute(`
    INSERT INTO notifications (user_id, type, content, related_user_id, related_request_id)
    VALUES ($1, 'match_rejected', $2, $3, $4)
  `, [
    coupleRequest.requester_id,
    `用户 ${req.user.nickname || req.user.email} 已拒绝你的情侣匹配度测试申请`,
    req.user.id,
    requestId
  ]);

  res.redirect('/notifications?msg=已拒绝匹配度测试申请&type=success');
}));

async function generateMatchComment(userAProfile, userBProfile, matchScore) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DeepSeek API Key 未配置');
    return null;
  }
  const url = 'https://api.deepseek.com/v1/chat/completions';

  const buildProfileSummary = (profile) => {
    const info = [];
    if (profile.gender) info.push(`性别: ${profile.gender}`);
    if (profile.my_grade) info.push(`年级: ${profile.my_grade}`);
    if (profile.age) info.push(`年龄: ${profile.age}`);
    if (profile.campus) info.push(`校区: ${profile.campus}`);
    if (profile.height) info.push(`身高: ${profile.height}cm`);
    if (profile.hometown) info.push(`家乡: ${profile.hometown}`);
    if (profile.purpose) info.push(`交友目的: ${profile.purpose}`);
    if (profile.core_traits) info.push(`核心特质: ${profile.core_traits}`);
    if (profile.relationship_rhythm !== null) info.push(`恋爱节奏: ${profile.relationship_rhythm}`);
    if (profile.romantic_ritual !== null) info.push(`仪式感: ${profile.romantic_ritual}`);
    if (profile.relationship_style !== null) info.push(`相处模式: ${profile.relationship_style}`);
    if (profile.sleep_pattern !== null) info.push(`作息习惯: ${profile.sleep_pattern}`);
    if (profile.diet_preference !== null) info.push(`饮食偏好: ${profile.diet_preference}`);
    if (profile.spice_tolerance !== null) info.push(`辣度接受度: ${profile.spice_tolerance}`);
    if (profile.date_preference !== null) info.push(`约会偏好: ${profile.date_preference}`);
    if (profile.spending_style !== null) info.push(`消费观念: ${profile.spending_style}`);
    if (profile.drinking_habit !== null) info.push(`饮酒习惯: ${profile.drinking_habit}`);
    if (profile.smoking_habit !== null) info.push(`吸烟习惯: ${profile.smoking_habit}`);
    if (profile.pet_attitude !== null) info.push(`宠物态度: ${profile.pet_attitude}`);
    if (profile.sexual_timing !== null) info.push(`性观念: ${profile.sexual_timing}`);
    if (profile.conflict_style !== null) info.push(`应对冲突: ${profile.conflict_style}`);
    if (profile.meeting_frequency !== null) info.push(`见面频率: ${profile.meeting_frequency}`);
    if (profile.my_traits) info.push(`个人特征: ${profile.my_traits}`);
    if (profile.partner_traits) info.push(`偏好特质: ${profile.partner_traits}`);
    if (profile.interests) info.push(`兴趣爱好: ${profile.interests}`);
    if (profile.partner_interest !== null) info.push(`对方兴趣权重: ${profile.partner_interest}`);
    if (profile.preferred_gender) info.push(`偏好性别: ${profile.preferred_gender}`);
    if (profile.age_min !== null && profile.age_max !== null) info.push(`年龄偏好: ${profile.age_min}-${profile.age_max}`);
    if (profile.preferred_height_min !== null && profile.preferred_height_max !== null) info.push(`身高偏好: ${profile.preferred_height_min}-${profile.preferred_height_max}`);
    if (profile.preferred_hometown) info.push(`家乡偏好: ${profile.preferred_hometown}`);
    if (profile.accepted_campus) info.push(`接受校区: ${profile.accepted_campus}`);
    if (profile.partner_drinking !== null) info.push(`对方饮酒偏好: ${profile.partner_drinking}`);
    if (profile.partner_smoking !== null) info.push(`对方吸烟偏好: ${profile.partner_smoking}`);
    if (profile.lovetype_code) info.push(`恋爱类型: ${profile.lovetype_code}`);
    return info.join('， ');
  };

  const prompt = `请为以下两位用户生成一段100-150字的匹配评语，要有梗、有趣、活泼一些：

用户A问卷: ${buildProfileSummary(userAProfile)}
用户B问卷: ${buildProfileSummary(userBProfile)}
匹配得分: ${Math.round(matchScore)}分

要求：
- 语言生动有趣
- 若性取向不符合，可以用活泼有趣的方式提及
- 适度调侃但不过分
- 适度提及双方的加分项和亮点
- 我们都是上海大学大学生
- 给一些简单的聊天话题开启建议
- 不要夸大或过于乐观

- 100-150字，直接输出评语内容，按段落分为换成2-3段显示，不需要开场白`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('DeepSeek API 错误:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('调用 DeepSeek API 失败:', error);
    return null;
  }
}

// 查看情侣匹配度测试结果
app.get('/couple-match/result/:id', isLoggedIn, wrapAsync(async (req, res) => {
  const requestId = parseInt(req.params.id, 10);

  const coupleRequest = await db.queryOne(`
    SELECT cr.*,
      requester.id as requester_id, requester.nickname as requester_nickname, requester.email as requester_email,
      receiver.id as receiver_id, receiver.nickname as receiver_nickname, receiver.email as receiver_email
    FROM couple_requests cr
    JOIN users requester ON requester.id = cr.requester_id
    JOIN users receiver ON receiver.id = cr.receiver_id
    WHERE cr.id = $1 AND cr.status = 'accepted'
      AND (cr.requester_id = $2 OR cr.receiver_id = $2)
  `, [requestId, req.user.id]);

  if (!coupleRequest) {
    return res.redirect('/couple-match?msg=匹配度测试结果不存在&type=error');
  }

  let savedScore = coupleRequest.match_score;

  if (!savedScore) {
    const matchService = require('./matchService');
    const matchResult = await matchService.getCoupleMatch(coupleRequest.requester_id, coupleRequest.receiver_id);
    if (matchResult) {
      await db.execute(`
        UPDATE couple_requests SET match_score = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `, [matchResult.total, requestId]);
      savedScore = matchResult.total;
    }
  }

  const isRequester = coupleRequest.requester_id === req.user.id;
  const partnerId = isRequester ? coupleRequest.receiver_id : coupleRequest.requester_id;
  const partnerNickname = isRequester ? coupleRequest.receiver_nickname : coupleRequest.requester_nickname;
  const partnerEmail = isRequester ? coupleRequest.receiver_email : coupleRequest.requester_email;

  const partnerProfile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [partnerId]);
  const lovettService = require('./lovetypeService');
  const partnerLoveType = partnerProfile?.lovetype_code ? lovettService.getLoveTypeProfile(partnerProfile.lovetype_code) : null;

  res.render('couple-result', {
    title: '匹配度测试结果',
    user: req.user,
    nickname: req.session.nickname,
    hasProfile: true,
    partner: {
      id: partnerId,
      nickname: partnerNickname,
      email: partnerEmail,
      ...partnerProfile,
      loveTypeProfile: partnerLoveType
    },
    matchResult: savedScore ? { total: savedScore } : null,
    matchComment: undefined,
    requestId
  });
}));

// API: 异步获取匹配评语
app.get('/api/couple-match/comment/:id', isLoggedIn, wrapAsync(async (req, res) => {
  const requestId = parseInt(req.params.id, 10);

  const coupleRequest = await db.queryOne(`
    SELECT cr.*,
      requester.id as requester_id, receiver.id as receiver_id
    FROM couple_requests cr
    JOIN users requester ON requester.id = cr.requester_id
    JOIN users receiver ON receiver.id = cr.receiver_id
    WHERE cr.id = $1 AND cr.status = 'accepted'
      AND (cr.requester_id = $2 OR cr.receiver_id = $2)
  `, [requestId, req.user.id]);

  if (!coupleRequest) {
    return res.status(404).json({ success: false, error: '匹配结果不存在' });
  }

  if (coupleRequest.match_comment) {
    return res.json({ success: true, comment: coupleRequest.match_comment, score: coupleRequest.match_score });
  }

  const profileA = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [coupleRequest.requester_id]);
  const profileB = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [coupleRequest.receiver_id]);

  if (!profileA || !profileB) {
    return res.json({ success: false, error: '无法获取用户资料' });
  }

  const matchService = require('./matchService');
  const matchResult = await matchService.getCoupleMatch(coupleRequest.requester_id, coupleRequest.receiver_id);

  if (!matchResult) {
    return res.json({ success: false, error: '无法计算匹配得分' });
  }

  const comment = await generateMatchComment(profileA, profileB, matchResult.total);

  await db.execute(`
    UPDATE couple_requests SET match_score = $1, match_comment = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3
  `, [matchResult.total, comment, requestId]);

  res.json({ success: true, comment, score: matchResult.total });
}));

// 管理页
app.get('/admin', isLoggedIn, requireAdmin, wrapAsync(async (req, res) => {
  const users = await db.query(`
    SELECT u.*, CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as hasProfile
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ORDER BY u.created_at DESC
  `);
  const currentUserProfile = await db.queryOne('SELECT id FROM profiles WHERE user_id = $1', [req.user.id]);

  renderExperienceView(req, res, 'admin', {
    title: '管理',
    user: req.user,
    users,
    weekNumber: getWeekNumber(),
    currentYear: getYear(),
    csrfToken: ensureCsrfToken(req),
    message: req.query.msg,
    messageType: req.query.type,
    isAdmin: true,
    nickname: req.session.nickname,
    hasProfile: !!currentUserProfile,
    pageKey: 'admin'
  });
}));

// 手动触发匹配
app.get('/admin/match', isLoggedIn, requireAdmin, wrapAsync(async (req, res) => {
  return res.redirect('/admin?msg=' + encodeURIComponent('请使用页面表单触发匹配') + '&type=error');
}));

app.post('/admin/match', isLoggedIn, requireAdmin, adminActionRateLimiter, requireValidCsrf, wrapAsync(async (req, res) => {
  const { confirmPassword: passwordConfirm } = req.body;
  // 二次密码确认
  const isValid = await confirmCurrentUserPassword(req, passwordConfirm);
  if (!isValid) {
    return res.redirect('/admin?msg=' + encodeURIComponent('密码错误，操作已拒绝') + '&type=error');
  }
  const result = await runWeeklyMatch();
  res.redirect('/admin?msg=' + encodeURIComponent(result.message) + '&type=' + (result.success ? 'success' : 'error'));
}));

// 补跑匹配
app.post('/admin/match/rerun', isLoggedIn, requireAdmin, adminActionRateLimiter, requireValidCsrf, wrapAsync(async (req, res) => {
  const { targetWeek, targetYear, force, confirmPassword: passwordConfirm } = req.body;

  // 二次密码确认
  const isValid = await confirmCurrentUserPassword(req, passwordConfirm);
  if (!isValid) {
    return res.redirect('/admin?msg=' + encodeURIComponent('密码错误，操作已拒绝') + '&type=error');
  }

  const currentYear = getYear();
  const currentWeek = getWeekNumber();

  // 校验并解析 targetWeek
  let weekToRun;
  if (targetWeek !== undefined && targetWeek !== null && targetWeek !== '') {
    const parsed = parseInt(targetWeek, 10);
    if (Number.isNaN(parsed) || parsed < WEEK_NUMBER_MIN || parsed > WEEK_NUMBER_MAX) {
      return res.redirect('/admin?msg=' + encodeURIComponent(`周数必须是 ${WEEK_NUMBER_MIN}-${WEEK_NUMBER_MAX} 之间的整数`) + '&type=error');
    }
    weekToRun = parsed;
  } else {
    weekToRun = currentWeek;
  }

  // 校验并解析 targetYear
  let yearToRun;
  if (targetYear !== undefined && targetYear !== null && targetYear !== '') {
    const parsed = parseInt(targetYear, 10);
    if (Number.isNaN(parsed) || parsed < 2020 || parsed > 2100) {
      return res.redirect('/admin?msg=' + encodeURIComponent('年份必须是 2020-2100 之间的整数') + '&type=error');
    }
    yearToRun = parsed;
  } else {
    yearToRun = currentYear;
  }

  // 安全限制: 不允许补跑未来的周/年
  if (yearToRun > currentYear || (yearToRun === currentYear && weekToRun > currentWeek)) {
    return res.redirect('/admin?msg=' + encodeURIComponent('不能补跑未来的周') + '&type=error');
  }
  // 检查目标周是否已有匹配记录
  const existingMatches = await db.queryOne(
    'SELECT COUNT(*) as count FROM matches WHERE match_year = $1 AND week_number = $2',
    [yearToRun, weekToRun]
  );

  const matchCount = parseInt(existingMatches?.count || '0', 10);

  if (matchCount > 0 && force !== 'true') {
    return res.redirect(
      '/admin?msg=' + encodeURIComponent(`第${weekToRun}周已有 ${matchCount} 对匹配记录，如需重新执行请勾选"强制重跑"`) +
      '&type=warning'
    );
  }

  // 强制重跑: 删除现有记录
  if (matchCount > 0 && force === 'true') {
    await db.execute('DELETE FROM matches WHERE match_year = $1 AND week_number = $2', [yearToRun, weekToRun]);
    console.log(`[Admin] 已删除第${yearToRun}年第${weekToRun}周的 ${matchCount} 条匹配记录`);
  }
  // 执行补跑
  console.log(`[Admin] 开始补跑第${yearToRun}年第${weekToRun}周的匹配`);
  const result = await runWeeklyMatchWithWeek(yearToRun, weekToRun);

  res.redirect('/admin?msg=' + encodeURIComponent(result.message) + '&type=' + (result.success ? 'success' : 'error'));
}));

// ============ Cron 调度接口 ============

const CRON_SECRET = process.env.CRON_SECRET;

function requireValidCronSecret(req, res, next) {
  const timestamp = new Date().toISOString();

  const authHeader = req.headers['x-cron-secret'] || req.body?.cronSecret;
  if (!CRON_SECRET || authHeader !== CRON_SECRET) {
    console.warn(`[Cron] 无效的调度请求: 密钥不匹配 (${timestamp})`);
    return res.status(403).json({
      success: false,
      error: 'Unauthorized',
      timestamp
    });
  }

  next();
}

app.post('/api/cron/weekly-match', requireValidCronSecret, cronRateLimiter, wrapAsync(async (req, res) => {
  const timestamp = new Date().toISOString();

  console.log(`[Cron] 开始执行周匹配: ${timestamp}`);

  try {
    const result = await runWeeklyMatch();

    // 发送告警通知
    const { alertMatchSuccess, alertMatchSkipped } = require('./alertService');

    if (result.success) {
      console.log(`[Cron] 匹配成功: ${result.message}`);
      await alertMatchSuccess(result);
    } else {
      console.log(`[Cron] 匹配跳过: ${result.message}`);
      await alertMatchSkipped(result.message);
    }

    res.json({
      success: result.success,
      message: result.message,
      matchCount: result.results?.length || 0,
      timestamp
    });
  } catch (error) {
    console.error('[Cron] 匹配执行失败:', error);

    // 发送失败告警
    const { alertMatchFailed } = require('./alertService');
    await alertMatchFailed(error, {
      timestamp,
      weekNumber: getWeekNumber()
    });

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp
    });
  }
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

/**
 * 执行指定年份和周数的匹配（用于补跑）
 * @param {number} targetYear - 目标年份
 * @param {number} targetWeek - 目标周数
 */
async function runWeeklyMatchWithWeek(targetYear, targetWeek) {
  const matchService = require('./matchService');
  const result = await matchService.saveWeeklyMatches(targetYear, targetWeek);

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







