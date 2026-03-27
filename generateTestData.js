/**
 * 生成测试数据脚本
 * 直接写入当前 DATABASE_URL 指向的 PostgreSQL 数据库。
 */

require('dotenv').config();
const db = require('./database');

const PROFILE_FIELD_WHITELIST = [
  'gender',
  'preferred_gender',
  'purpose',
  'my_grade',
  'preferred_grade',
  'campus',
  'cross_campus',
  'height',
  'preferred_height',
  'hometown',
  'preferred_hometown',
  'core_traits',
  'long_distance',
  'communication',
  'spending',
  'cohabitation',
  'marriage_plan',
  'relationship_style',
  'sleep_schedule',
  'smoke_alcohol',
  'pet',
  'social_public',
  'social_boundary',
  'interests'
];

function assertSingleWrite(result, context) {
  if (!result || result.changes !== 1) {
    throw new Error(`${context}失败`);
  }
}

function getProfileFields(user) {
  const rawFields = Object.keys(user).filter(key => key !== 'email' && key !== 'name');
  const invalidFields = rawFields.filter(field => !PROFILE_FIELD_WHITELIST.includes(field));

  if (invalidFields.length > 0) {
    throw new Error(`测试数据包含未知字段: ${invalidFields.join(', ')}`);
  }

  return rawFields;
}

function buildProfileUpsertSql(profileFields) {
  const columns = ['user_id', ...profileFields];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updateClauses = profileFields
    .map(field => `${field} = EXCLUDED.${field}`)
    .join(', ');
  const updateSql = updateClauses
    ? `${updateClauses}, updated_at = NOW()`
    : 'updated_at = NOW()';

  return `
    INSERT INTO profiles (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (user_id) DO UPDATE SET
      ${updateSql}
  `;
}

async function upsertUser(user) {
  const existingUser = await db.queryOne('SELECT id FROM users WHERE email = $1', [user.email]);

  if (existingUser) {
    const updateResult = await db.execute(
      'UPDATE users SET name = $1, verified = 1, login_code = NULL, login_code_expire = NULL WHERE id = $2',
      [user.name, existingUser.id]
    );
    assertSingleWrite(updateResult, `更新用户 ${user.email}`);
    console.log(`更新用户: ${user.email}`);
    return { id: existingUser.id, created: false };
  }
];

  const createdUser = await db.queryOne(
    `INSERT INTO users (email, name, verified, login_code, login_code_expire)
     VALUES ($1, $2, 1, NULL, NULL)
     RETURNING id`,
    [user.email, user.name]
  );

  if (!createdUser || !createdUser.id) {
    throw new Error(`创建用户 ${user.email} 失败`);
  }

  console.log(`创建用户: ${user.email}`);
  return { id: createdUser.id, created: true };
}

async function upsertProfile(userId, user) {
  const profileFields = getProfileFields(user);

  if (profileFields.length === 0) {
    throw new Error(`测试数据 ${user.email} 缺少可写入的问卷字段`);
  }

  const sql = buildProfileUpsertSql(profileFields);
  const params = [userId, ...profileFields.map(field => user[field])];
  const result = await db.execute(sql, params);
  assertSingleWrite(result, `写入问卷 ${user.email}`);
}

async function generateTestData() {
  if (!process.env.DATABASE_URL) {
    throw new Error('请先配置 DATABASE_URL，再运行测试数据脚本');
  }

  await db.initDatabase();

  const testUsers = [
    {
      email: 'test1@shu.edu.cn',
      name: '测试用户1-大三男',
      gender: '男',
      preferred_gender: '女',
      purpose: '寻找长期恋爱伴侣',
      my_grade: '大三',
      preferred_grade: '不限',
      campus: '宝山',
      cross_campus: '可以接受',
      height: '171-180',
      preferred_height: '151-160',
      hometown: '上海市',
      preferred_hometown: '不限',
      core_traits: '性格三观契合,兴趣爱好相投,颜值气质',
      long_distance: '短期可以，长期不接受',
      communication: '每天保持联系',
      spending: 'AA制',
      cohabitation: '中立，看双方意愿',
      marriage_plan: '毕业3-5年内结婚',
      relationship_style: '平衡型，兼顾陪伴与自由',
      sleep_schedule: '规律作息（23-24点睡，7-8点起）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '非常喜欢，想养宠物',
      social_public: '低调公开，仅亲密好友知晓',
      social_boundary: '无特殊要求，信任为主',
      interests: '跑步,音乐,游戏,美食,电影'
    },
    {
      email: 'test2@shu.edu.cn',
      name: '测试用户2-研一女',
      gender: '女',
      preferred_gender: '男',
      purpose: '寻找长期恋爱伴侣',
      my_grade: '研一',
      preferred_grade: '大一-大四（本科）',
      campus: '宝山',
      cross_campus: '可以接受',
      height: '161-170',
      preferred_height: '171-180',
      hometown: '上海周边城市',
      preferred_hometown: '不限',
      core_traits: '性格三观契合,学历学识',
      long_distance: '完全接受',
      communication: '每周3-5次',
      spending: '按需分配，互相体谅',
      cohabitation: '支持，提前磨合',
      marriage_plan: '毕业1-2年内结婚',
      relationship_style: '独立型，保留个人空间',
      sleep_schedule: '早睡早起（23点前睡，7点前起）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '可以接受，不排斥',
      social_public: '主动公开，介绍给亲友',
      social_boundary: '避免与异性过度亲密',
      interests: '阅读,旅行,健身,摄影'
    },
    {
      email: 'test3@shu.edu.cn',
      name: '测试用户3-大四女',
      gender: '女',
      preferred_gender: '不限',
      purpose: '顺其自然，拓展社交',
      my_grade: '大四',
      preferred_grade: '不限',
      campus: '嘉定',
      cross_campus: '不可以接受',
      height: '151-160',
      preferred_height: '不限',
      hometown: '其他省份',
      preferred_hometown: '不限',
      core_traits: '兴趣爱好相投,性格三观契合',
      long_distance: '完全不接受',
      communication: '顺其自然，无固定频率',
      spending: 'AA制',
      cohabitation: '反对，保持独立',
      marriage_plan: '暂无结婚规划',
      relationship_style: '独立型，保留个人空间',
      sleep_schedule: '偶尔熬夜（0-1点睡）',
      smoke_alcohol: '偶尔社交饮酒，不抽烟',
      pet: '不喜欢，不接受养宠物',
      social_public: '不公开，保持隐私',
      social_boundary: '严格限制异性单独接触',
      interests: '游戏,音乐,电影,美食'
    },
    {
      email: 'test4@shu.edu.cn',
      name: '测试用户4-大二男',
      gender: '男',
      preferred_gender: '女',
      purpose: '寻找短期约会对象',
      my_grade: '大二',
      preferred_grade: '大一-大四（本科）',
      campus: '宝山',
      cross_campus: '可以接受',
      height: '181-210',
      preferred_height: '151-160',
      hometown: '上海市',
      preferred_hometown: '上海市',
      core_traits: '颜值气质,兴趣爱好相投',
      long_distance: '短期可以，长期不接受',
      communication: '每天保持联系',
      spending: '男方主导消费',
      cohabitation: '支持，提前磨合',
      marriage_plan: '暂无结婚规划',
      relationship_style: '黏腻型，时刻陪伴',
      sleep_schedule: '经常熬夜（1点后睡）',
      smoke_alcohol: '偶尔抽烟饮酒',
      pet: '非常喜欢，想养宠物',
      social_public: '主动公开，介绍给亲友',
      social_boundary: '无特殊要求，信任为主',
      interests: '游戏,健身,音乐,旅行'
    },
    {
      email: 'test5@shu.edu.cn',
      name: '测试用户5-研二男',
      gender: '男',
      preferred_gender: '女',
      purpose: '寻找长期恋爱伴侣',
      my_grade: '研二',
      preferred_grade: '研一-博五（硕博）',
      campus: '延长',
      cross_campus: '可以接受',
      height: '171-180',
      preferred_height: '161-170',
      hometown: '其他省份',
      preferred_hometown: '不限',
      core_traits: '性格三观契合,学历学识,家庭背景',
      long_distance: '完全接受',
      communication: '每周1-2次',
      spending: '按需分配，互相体谅',
      cohabitation: '中立，看双方意愿',
      marriage_plan: '毕业3-5年内结婚',
      relationship_style: '平衡型，兼顾陪伴与自由',
      sleep_schedule: '规律作息（23-24点睡，7-8点起）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '可以接受，不排斥',
      social_public: '低调公开，仅亲密好友知晓',
      social_boundary: '避免与异性过度亲密',
      interests: '编程,阅读,旅行,摄影'
    },
    {
      email: 'test6@shu.edu.cn',
      name: '测试用户6-大一女',
      gender: '女',
      preferred_gender: '男',
      purpose: '顺其自然，拓展社交',
      my_grade: '大一',
      preferred_grade: '不限',
      campus: '宝山',
      cross_campus: '可以接受',
      height: '161-170',
      preferred_height: '171-180',
      hometown: '上海市',
      preferred_hometown: '上海市',
      core_traits: '兴趣爱好相投,性格三观契合',
      long_distance: '完全接受',
      communication: '每天保持联系',
      spending: 'AA制',
      cohabitation: '中立，看双方意愿',
      marriage_plan: '不介意',
      relationship_style: '黏腻型，时刻陪伴',
      sleep_schedule: '偶尔熬夜（0-1点睡）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '非常喜欢，想养宠物',
      social_public: '主动公开，介绍给亲友',
      social_boundary: '无特殊要求，信任为主',
      interests: '音乐,美食,电影,旅行'
    },
    {
      email: 'test7@shu.edu.cn',
      name: '测试用户7-博一男',
      gender: '男',
      preferred_gender: '女',
      purpose: '寻找长期恋爱伴侣',
      my_grade: '博一',
      preferred_grade: '研一-博五（硕博）',
      campus: '嘉定',
      cross_campus: '可以接受',
      height: '171-180',
      preferred_height: '不限',
      hometown: '其他省份',
      preferred_hometown: '不限',
      core_traits: '性格三观契合,学历学识',
      long_distance: '短期可以，长期不接受',
      communication: '每周3-5次',
      spending: 'AA制',
      cohabitation: '反对，保持独立',
      marriage_plan: '毕业3-5年内结婚',
      relationship_style: '独立型，保留个人空间',
      sleep_schedule: '规律作息（23-24点睡，7-8点起）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '可以接受，不排斥',
      social_public: '低调公开，仅亲密好友知晓',
      social_boundary: '避免与异性过度亲密',
      interests: '阅读,编程,健身'
    },
    {
      email: 'test8@shu.edu.cn',
      name: '测试用户8-大三女',
      gender: '女',
      preferred_gender: '男',
      purpose: '寻找长期恋爱伴侣',
      my_grade: '大三',
      preferred_grade: '大一-大四（本科）',
      campus: '宝山',
      cross_campus: '不可以接受',
      height: '151-160',
      preferred_height: '171-180',
      hometown: '上海周边城市',
      preferred_hometown: '上海周边城市',
      core_traits: '性格三观契合,兴趣爱好相投',
      long_distance: '完全不接受',
      communication: '每天保持联系',
      spending: '按需分配，互相体谅',
      cohabitation: '支持，提前磨合',
      marriage_plan: '毕业1-2年内结婚',
      relationship_style: '平衡型，兼顾陪伴与自由',
      sleep_schedule: '早睡早起（23点前睡，7点前起）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '非常喜欢，想养宠物',
      social_public: '主动公开，介绍给亲友',
      social_boundary: '严格限制异性单独接触',
      interests: '跑步,音乐,阅读,美食'
    },
    {
      email: 'test9@shu.edu.cn',
      name: '测试用户9-研三男',
      gender: '男',
      preferred_gender: '不限',
      purpose: '顺其自然，拓展社交',
      my_grade: '研三',
      preferred_grade: '不限',
      campus: '延长',
      cross_campus: '可以接受',
      height: '161-170',
      preferred_height: '不限',
      hometown: '上海市',
      preferred_hometown: '不限',
      core_traits: '兴趣爱好相投,颜值气质',
      long_distance: '完全接受',
      communication: '顺其自然，无固定频率',
      spending: 'AA制',
      cohabitation: '中立，看双方意愿',
      marriage_plan: '不介意',
      relationship_style: '独立型，保留个人空间',
      sleep_schedule: '偶尔熬夜（0-1点睡）',
      smoke_alcohol: '偶尔社交饮酒，不抽烟',
      pet: '不喜欢，不接受养宠物',
      social_public: '不公开，保持隐私',
      social_boundary: '无特殊要求，信任为主',
      interests: '游戏,电影,音乐,美食'
    },
    {
      email: 'test10@shu.edu.cn',
      name: '测试用户10-大二女',
      gender: '女',
      preferred_gender: '男',
      purpose: '寻找长期恋爱伴侣',
      my_grade: '大二',
      preferred_grade: '大一-大四（本科）',
      campus: '嘉定',
      cross_campus: '可以接受',
      height: '161-170',
      preferred_height: '171-180',
      hometown: '其他省份',
      preferred_hometown: '不限',
      core_traits: '性格三观契合,家庭背景',
      long_distance: '短期可以，长期不接受',
      communication: '每周3-5次',
      spending: '按需分配，互相体谅',
      cohabitation: '中立，看双方意愿',
      marriage_plan: '暂无结婚规划',
      relationship_style: '平衡型，兼顾陪伴与自由',
      sleep_schedule: '规律作息（23-24点睡，7-8点起）',
      smoke_alcohol: '不抽烟不喝酒',
      pet: '可以接受，不排斥',
      social_public: '低调公开，仅亲密好友知晓',
      social_boundary: '避免与异性过度亲密',
      interests: '摄影,旅行,阅读,音乐'
    }
  ];

  let createdUsers = 0;
  let updatedUsers = 0;

  for (const user of testUsers) {
    const result = await upsertUser(user);
    if (result.created) {
      createdUsers += 1;
    } else {
      updatedUsers += 1;
    }

    await upsertProfile(result.id, user);
  }

  console.log('\n✅ 测试数据生成完成！');
  console.log(`共处理 ${testUsers.length} 个测试用户`);
  console.log(`新增用户: ${createdUsers}`);
  console.log(`更新用户: ${updatedUsers}`);
}

generateTestData()
  .catch(error => {
    console.error('❌ 测试数据生成失败:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.getPool().end();
  });
