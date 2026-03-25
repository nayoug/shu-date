const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'shu.db');
let db = null;

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();

  let data = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }

  db = new SQL.Database(data);

  // users 表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      verified INTEGER DEFAULT 0,
      login_code TEXT,
      login_code_expire DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // profiles 表 - 完整问卷
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,

      -- 一、基础信息
      gender TEXT,                    -- 1. 性别
      preferred_gender TEXT,          -- 2. 期望对象性别
      purpose TEXT,                   -- 3. 目的
      my_grade TEXT,                 -- 4. 我的学历阶段
      preferred_grade TEXT,          -- 5. 期望对方学历阶段
      expected_graduation TEXT,      -- 6. 预计毕业阶段
      campus TEXT,                    -- 7. 常驻校区
      cross_campus TEXT,              -- 8. 跨校区态度
      height TEXT,                    -- 9. 身高
      preferred_height TEXT,         -- 10. 期望身高

      -- 二、择偶偏好
      hometown TEXT,                  -- 11. 家乡
      preferred_hometown TEXT,       -- 12. 期望家乡（新增）
      core_traits TEXT,              -- 14. 核心特质（多选，逗号分隔）
      long_distance TEXT,            -- 15. 异地恋接受程度

      -- 三、恋爱观念
      communication TEXT,            -- 16. 沟通频率
      spending TEXT,                 -- 17. 消费观念
      cohabitation TEXT,             -- 18. 婚前同居
      marriage_plan TEXT,            -- 19. 婚姻规划
     相处模式 TEXT,                  -- 20. 相处模式（需要转义）

      -- 四、生活习惯
      sleep_schedule TEXT,           -- 21. 作息习惯
      smoke_alcohol TEXT,            -- 22. 烟酒态度
      pet TEXT,                      -- 23. 宠物态度
      social公开 TEXT,               -- 24. 社交圈公开（需要转义）
      social_boundary TEXT,          -- 25. 社交边界

      -- 兴趣标签（用于相似度计算）
      interests TEXT,                -- 兴趣爱好标签

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // matches 表
  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id_1 INTEGER NOT NULL,
      user_id_2 INTEGER NOT NULL,
      score REAL,
      matched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      week_number INTEGER,
      FOREIGN KEY (user_id_1) REFERENCES users(id),
      FOREIGN KEY (user_id_2) REFERENCES users(id)
    )
  `);

  // 检查并添加缺失的列（迁移用）
  let existingColumns = [];
  try {
    const stmt = db.prepare("PRAGMA table_info(profiles)");
    while (stmt.step()) {
      const row = stmt.getAsObject();
      existingColumns.push(row.name);
    }
    stmt.free();
  } catch(e) {
    // profiles表可能不存在
  }

  const newColumns = [
    'gender', 'preferred_gender', 'purpose', 'my_grade', 'preferred_grade',
    'expected_graduation', 'campus', 'cross_campus', 'height', 'preferred_height',
    'hometown', 'preferred_hometown', 'core_traits', 'long_distance',
    'communication', 'spending', 'cohabitation', 'marriage_plan', 'sleep_schedule',
    'smoke_alcohol', 'pet', 'social_public', 'social_boundary', 'interests',
    'relationship_style'
  ];

  for (const col of newColumns) {
    if (!existingColumns.includes(col)) {
      try {
        db.run(`ALTER TABLE profiles ADD COLUMN ${col} TEXT`);
      } catch(e) {
        // 列可能已存在
      }
    }
  }

  saveDatabase();
  console.log('数据库初始化完成');
  return db;
}

// 保存数据库
function saveDatabase() {
  if (db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

function runStatement(sql, params = [], persist = true) {
  db.run(sql, params);

  if (persist) {
    saveDatabase();
  }

  return { changes: db.getRowsModified() };
}

function transaction(callback) {
  db.run('BEGIN');

  try {
    callback();
    db.run('COMMIT');
    saveDatabase();
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('事务回滚失败:', rollbackError);
    }

    throw error;
  }
}

// SQL辅助函数
function prepare(sql) {
  return {
    run: (...params) => {
      return runStatement(sql, params, true);
    },
    runWithoutSave: (...params) => {
      return runStatement(sql, params, false);
    },
    get: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    }
  };
}

module.exports = {
  initDatabase: () => initDatabase(),
  getDb: () => db,
  prepare,
  saveDatabase,
  transaction
};
