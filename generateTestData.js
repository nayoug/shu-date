/**
 * 生成测试数据脚本
 * 用于测试匹配算法 - Supabase PostgreSQL版本
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

async function generateTestData() {
  // 1. 在这里定义并连接 client
  const client = await pool.connect();

  try {
    console.log('连接成功，正在准备生成测试数据...');

    // 检查表是否存在
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('users', 'profiles')
    `);
    console.log('现有表:', tableCheck.rows.map(r => r.table_name).join(', '));

    for (const user of testUsers) {
      // 检查用户是否存在
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1::text',
        [user.email]
      );

      let userId;
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        console.log(`用户 ${user.email} 已存在 (ID: ${userId})`);
      } else {
        // 创建用户
        const loginCode = 'test' + Math.random().toString(36).substring(2, 8);
        const expireTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // 修正：显式添加类型转换
        const result = await client.query(
          'INSERT INTO users (email, name, verified, login_code, login_code_expire, created_at) VALUES ($1::text, $2::text, 1, $3::text, $4::timestamp, NOW()) RETURNING id',
          [user.email, user.name, loginCode, expireTime]
        );
        userId = result.rows[0].id;
        console.log(`创建用户: ${user.email} (ID: ${userId})`);
      }

      // 准备问卷数据
      const profileData = {
        user_id: userId,
        gender: user.gender,
        preferred_gender: user.preferred_gender,
        purpose: user.purpose,
        my_grade: user.my_grade,
        preferred_grade: user.preferred_grade,
        campus: user.campus,
        cross_campus: user.cross_campus,
        height: user.height,
        preferred_height: user.preferred_height,
        hometown: user.hometown,
        preferred_hometown: user.preferred_hometown,
        core_traits: user.core_traits,
        long_distance: user.long_distance,
        communication: user.communication,
        spending: user.spending,
        cohabitation: user.cohabitation,
        marriage_plan: user.marriage_plan,
        relationship_style: user.relationship_style,
        sleep_schedule: user.sleep_schedule,
        smoke_alcohol: user.smoke_alcohol,
        pet: user.pet,
        social_public: user.social_public,
        social_boundary: user.social_boundary,
        interests: user.interests
      };

      const existingProfile = await client.query(
        'SELECT id FROM profiles WHERE user_id = $1',
        [userId]
      );

      const keys = Object.keys(profileData);
      const values = Object.values(profileData);

      if (existingProfile.rows.length > 0) {
        // 修正：UPDATE 占位符从 $1 开始，并将 WHERE 条件放在最后
        const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const updateValues = [...values, userId]; 
        await client.query(
          `UPDATE profiles SET ${setClauses}, updated_at = NOW() WHERE user_id = $${keys.length + 1}`,
          updateValues
        );
        console.log(`更新问卷: ${user.email}`);
      } else {
        // 修正：INSERT 占位符从 $1 开始
        const fields = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO profiles (${fields}) VALUES (${placeholders})`,
          values
        );
        console.log(`创建问卷: ${user.email}`);
      }
    }

    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const profileCount = await client.query('SELECT COUNT(*) FROM profiles');

    console.log('\n✅ 测试数据生成完成！');
    console.log(`用户总数: ${userCount.rows[0].count}`);
    console.log(`问卷总数: ${profileCount.rows[0].count}`);

  } catch (err) {
    console.error('❌ 发生错误:', err.message);
    console.error(err.stack); // 打印错误堆栈方便定位
  } finally {
    client.release();
    await pool.end();
  }
}

generateTestData();