const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

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

function prepare(sql) {
  const converted = convertPlaceholders(sql);
  return {
    run: async function(...params) {
      try {
        const result = await pool.query(converted, params);
        return { changes: result.rowCount };
      } catch (e) {
        console.error('SQL执行失败:', e.message);
        return { changes: 0 };
      }
    },
    get: async function(...params) {
      try {
        const result = await pool.query(converted, params);
        return result.rows[0];
      } catch (e) {
        console.error('SQL查询失败:', e.message);
        return undefined;
      }
    },
    all: async function(...params) {
      try {
        const result = await pool.query(converted, params);
        return result.rows;
      } catch (e) {
        console.error('SQL查询失败:', e.message);
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
