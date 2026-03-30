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
    FOREIGN KEY (user_id_1) REFERENCES users(id),
    FOREIGN KEY (user_id_2) REFERENCES users(id)
  )
`);

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

module.exports = {
  initDatabase,
  query,
  queryOne,
  execute,
  init: initDatabase,
  getPool: () => pool
};
