const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  }
});

let isInitialized = false;

// 初始化数据库表
async function initDatabase() {
  if (isInitialized) return;

  // users 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      verified INTEGER DEFAULT 0,
      login_code TEXT,
      login_code_expire TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // profiles 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      gender TEXT,
      preferred_gender TEXT,
      purpose TEXT,
      my_grade TEXT,
      preferred_grade TEXT,
      campus TEXT,
      cross_campus TEXT,
      height TEXT,
      preferred_height TEXT,
      hometown TEXT,
      preferred_hometown TEXT,
      core_traits TEXT,
      long_distance TEXT,
      communication TEXT,
      spending TEXT,
      cohabitation TEXT,
      marriage_plan TEXT,
      relationship_style TEXT,
      sleep_schedule TEXT,
      smoke_alcohol TEXT,
      pet TEXT,
      social_public TEXT,
      social_boundary TEXT,
      interests TEXT,
      lovetype_answers TEXT,
      lovetype_code TEXT,
      lovetype_scores TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lovetype_answers TEXT');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lovetype_code TEXT');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lovetype_scores TEXT');

  // 新增字段 (2026-03 问卷更新)
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_min INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_max INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_campus TEXT');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_min INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_height_min INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_height_max INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sleep_pattern INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diet_preference INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spice_tolerance INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_preference INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spending_style INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoking_habit INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_smoking INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drinking_habit INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_drinking INTEGER');
  await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_interest INTEGER');

  // matches 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      user_id_1 INTEGER NOT NULL,
      user_id_2 INTEGER NOT NULL,
      score REAL,
      matched_at TIMESTAMP DEFAULT NOW(),
      week_number INTEGER,
      FOREIGN KEY (user_id_1) REFERENCES users(id),
      FOREIGN KEY (user_id_2) REFERENCES users(id)
    )
  `);

  isInitialized = true;
  console.log('✅ Supabase PostgreSQL 数据库初始化完成');
  return pool;
}

// SQL辅助函数 - 模拟 sql.js 的 API
// 支持 $1, $2 等 PostgreSQL 占位符和 ? 占位符
function convertPlaceholders(sql) {
  // 先转换 $1, $2 为 ?
  let converted = sql.replace(/\$(\d+)/g, '?');
  // 再将 ? 转换回 $1, $2 (用于 PostgreSQL)
  let paramIndex = 1;
  return converted.replace(/\?/g, () => '$' + paramIndex++);
}

function getQueryFingerprint(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex').slice(0, 12);
}

function logQueryError(operation, sql, error) {
  const metadata = {
    queryId: getQueryFingerprint(sql),
    code: error?.code || null,
    table: error?.table || null,
    constraint: error?.constraint || null,
    routine: error?.routine || null
  };

  console.error(`${operation}:`, metadata);
  if (error?.stack) {
    console.error(error.stack);
  } else if (error?.message) {
    console.error(error.message);
  }
}

function prepare(sql) {
  const converted = convertPlaceholders(sql);
  return {
    run: async function(...params) {
      try {
        const result = await pool.query(converted, params);
        return { changes: result.rowCount };
      } catch (e) {
        logQueryError('SQL执行失败', converted, e);
        return { changes: 0 };
      }
    },
    get: async function(...params) {
      try {
        const result = await pool.query(converted, params);
        return result.rows[0];
      } catch (e) {
        logQueryError('SQL查询失败', converted, e);
        return undefined;
      }
    },
    all: async function(...params) {
      try {
        const result = await pool.query(converted, params);
        return result.rows;
      } catch (e) {
        logQueryError('SQL查询失败', converted, e);
        return [];
      }
    }
  };
}

// 兼容方法
async function query(sql, params = []) {
  return (await prepare(sql).all(...params));
}

async function queryOne(sql, params = []) {
  return (await prepare(sql).get(...params));
}

async function execute(sql, params = []) {
  return (await prepare(sql).run(...params));
}

// 初始化并返回
async function init() {
  await initDatabase();
  return { initDatabase, prepare, query, queryOne, execute, pool };
}

module.exports = {
  initDatabase,
  prepare,
  query,
  queryOne,
  execute,
  init,
  getPool: () => pool
};
