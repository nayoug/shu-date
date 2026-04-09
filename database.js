const { Pool } = require('pg');
const SESSION_TABLE_NAME = 'user_sessions';
const SESSION_EXPIRE_INDEX_NAME = 'idx_user_sessions_expire';

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
      password_hash TEXT,
      nickname TEXT,
      name TEXT,
      verified INTEGER DEFAULT 0,
      verification_token TEXT,
      verification_expire TIMESTAMP,
      reset_token TEXT,
      reset_token_expire TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 确保新字段存在（升级时）
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expire TIMESTAMP');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expire TIMESTAMP');
  
  // profiles 表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,

      gender TEXT,
      preferred_gender TEXT,
      my_grade TEXT,
      age INTEGER,
      age_min INTEGER,
      age_max INTEGER,
      purpose TEXT,
      campus TEXT,
      accepted_campus TEXT,
      height INTEGER,
      preferred_height_min INTEGER,
      preferred_height_max INTEGER,
      hometown TEXT,
      preferred_hometown TEXT,
      core_traits TEXT,

      relationship_rhythm INTEGER,
      romantic_ritual INTEGER,
      relationship_style INTEGER,
      sleep_pattern INTEGER,
      diet_preference INTEGER,
      spice_tolerance INTEGER,
      date_preference INTEGER,
      spending_style INTEGER,
      drinking_habit INTEGER,
      partner_drinking INTEGER,
      smoking_habit INTEGER,
      partner_smoking INTEGER,
      pet_attitude INTEGER,
      sexual_timing INTEGER,
      conflict_style INTEGER,
      meeting_frequency INTEGER,

      my_traits TEXT,
      partner_traits TEXT,
      interests TEXT,
      partner_interest INTEGER,

      lovetype_answers TEXT,
      lovetype_code TEXT,
      lovetype_scores TEXT,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),

      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

// 新增字段
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_gender TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS my_grade TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_min INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_max INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purpose TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS campus TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_campus TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_height_min INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_height_max INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hometown TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_hometown TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS core_traits TEXT');

await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS relationship_rhythm INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS romantic_ritual INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS relationship_style INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sleep_pattern INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diet_preference INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spice_tolerance INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_preference INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spending_style INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drinking_habit INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_drinking INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoking_habit INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_smoking INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pet_attitude INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sexual_timing INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS conflict_style INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS meeting_frequency INTEGER');

await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS my_traits TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_traits TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT');

await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_interest INTEGER');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lovetype_answers TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lovetype_code TEXT');
await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lovetype_scores TEXT');

// matches 表
await pool.query(`
  CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    user_id_1 INTEGER NOT NULL,
    user_id_2 INTEGER NOT NULL,
    score REAL,
    matched_at TIMESTAMP DEFAULT NOW(),
    week_number INTEGER,
    match_year INTEGER,
    FOREIGN KEY (user_id_1) REFERENCES users(id),
    FOREIGN KEY (user_id_2) REFERENCES users(id)
  )
`);

// 为现有数据添加 match_year 列（迁移）
await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_year INTEGER`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_year_week ON matches (match_year, week_number)`);
// 仅在存在旧记录时回填 match_year，避免每次启动都全表 UPDATE
const missingMatchYear = await pool.query(`SELECT 1 FROM matches WHERE match_year IS NULL LIMIT 1`);
if (missingMatchYear.rowCount > 0) {
  await pool.query(`UPDATE matches SET match_year = EXTRACT(YEAR FROM matched_at) WHERE match_year IS NULL`);
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS ${SESSION_TABLE_NAME} (
    sid VARCHAR PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
  )
`);
await pool.query(`CREATE INDEX IF NOT EXISTS ${SESSION_EXPIRE_INDEX_NAME} ON ${SESSION_TABLE_NAME} (expire)`);

// 情侣匹配请求表
await pool.query(`
  CREATE TABLE IF NOT EXISTS couple_requests (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected
    match_score NUMERIC(5,2), -- 匹配得分，固定保存
    match_comment TEXT, -- 匹配评语，固定保存
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    UNIQUE(requester_id, receiver_id)
  )
`);

// 迁移：为已存在的 couple_requests 表添加新字段
await pool.query(`ALTER TABLE couple_requests ADD COLUMN IF NOT EXISTS match_score NUMERIC(5,2)`);
await pool.query(`ALTER TABLE couple_requests ADD COLUMN IF NOT EXISTS match_comment TEXT`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_couple_requests_requester_id ON couple_requests (requester_id)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_couple_requests_receiver_id ON couple_requests (receiver_id)`);

// 通知表
await pool.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- match_request, etc.
    content TEXT,
    related_user_id INTEGER,
    related_request_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (related_user_id) REFERENCES users(id),
    FOREIGN KEY (related_request_id) REFERENCES couple_requests(id)
  )
`);

await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read)`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_related_user_id ON notifications (related_user_id)`);

  isInitialized = true;
  console.log('✅ Supabase PostgreSQL 数据库初始化完成');
  return pool;
}

// 执行查询返回多行
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// 执行查询返回单行
async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0];
}

// 执行INSERT/UPDATE/DELETE
async function execute(sql, params = []) {
  const result = await pool.query(sql, params);
  return { changes: result.rowCount, lastInsertRowid: null };
}

async function getClient() {
  return pool.connect();
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Transaction rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  SESSION_TABLE_NAME,
  initDatabase,
  query,
  queryOne,
  execute,
  getClient,
  withTransaction,
  init: initDatabase,
  getPool: () => pool
};
