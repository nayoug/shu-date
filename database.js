const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 同步缓存（模拟同步行为）
let syncDb = null;
let syncReady = false;
const pendingQueries = [];

// 初始化数据库表
async function initDatabase() {
  const client = await pool.connect();
  try {
    // users 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        verified INTEGER DEFAULT 0,
        login_code TEXT,
        login_code_expire TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // profiles 表
    await client.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // matches 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        user_id_1 INTEGER NOT NULL,
        user_id_2 INTEGER NOT NULL,
        score REAL,
        matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        week_number INTEGER,
        FOREIGN KEY (user_id_1) REFERENCES users(id),
        FOREIGN KEY (user_id_2) REFERENCES users(id)
      )
    `);

    // 初始化同步缓存
    syncDb = pool;
    syncReady = true;

    // 处理积压的查询
    for (const query of pendingQueries) {
      query.resolve();
    }
    pendingQueries.length = 0;

    console.log('✅ Supabase数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// 确保数据库就绪
function ensureReady() {
  if (!syncReady) {
    return new Promise((resolve) => {
      pendingQueries.push({ resolve });
    });
  }
}

// SQL辅助函数 - 兼容同步API
function prepare(sql) {
  return {
    run: async function(...params) {
      await ensureReady();
      try {
        const result = await pool.query(sql, params);
        return { changes: result.rowCount || 0 };
      } catch (error) {
        console.error('SQL Error (run):', error.message, sql);
        return { changes: 0 };
      }
    },
    get: async function(...params) {
      await ensureReady();
      try {
        const result = await pool.query(sql, params);
        return result.rows[0];
      } catch (error) {
        console.error('SQL Error (get):', error.message, sql);
        return undefined;
      }
    },
    all: async function(...params) {
      await ensureReady();
      try {
        const result = await pool.query(sql, params);
        return result.rows;
      } catch (error) {
        console.error('SQL Error (all):', error.message, sql);
        return [];
      }
    }
  };
}

// 同步版本（用于不兼容async的地方，会返回undefined）
function prepareSync(sql) {
  return {
    run: (...params) => {
      if (!syncReady) return { changes: 0 };
      pool.query(sql, params).catch(e => console.error('SQL Error:', e.message));
      return { changes: 1 };
    },
    get: (...params) => {
      if (!syncReady) return undefined;
      return pool.query(sql, params).then(r => r.rows[0]).catch(() => undefined);
    },
    all: (...params) => {
      if (!syncReady) return [];
      return pool.query(sql, params).then(r => r.rows).catch(() => []);
    }
  };
}

// 直接查询方法
async function query(sql, params = []) {
  await ensureReady();
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  await ensureReady();
  const result = await pool.query(sql, params);
  return result.rows[0];
}

async function execute(sql, params = []) {
  await ensureReady();
  const result = await pool.query(sql, params);
  return { changes: result.rowCount || 0 };
}

// 异步初始化包装（兼容旧代码）
async function init() {
  await initDatabase();
  return { initDatabase, prepare, query, queryOne, execute, pool };
}

module.exports = {
  initDatabase,
  prepare,
  prepareSync: prepare,
  query,
  queryOne,
  execute,
  pool,
  init
};