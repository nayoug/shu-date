/**
 * 匹配服务 - 完整匹配算法
 *
 * 过滤条件：
 * - 性别偏好
 * - 年级偏好
 * - 身高偏好
 * - 校区接受度
 * - 年龄差
 *
 * 相似度计算：
 * - 兴趣标签 Jaccard
 * - 生活习惯 Jaccard
 * - 恋爱观匹配度
 *
 * 综合评分：
 * - interest: 0.3
 * - lifestyle: 0.3
 * - love_values: 0.4
 */

const dbModule = require('./database');

// 学历阶段排序
const GRADE_ORDER = {
  '大一': 1, '大二': 2, '大三': 3, '大四': 4,
  '研一': 5, '研二': 6, '研三': 7,
  '博一': 8, '博二': 9, '博三': 10, '博四': 11, '博五': 12
};

// ============ 工具函数 ============

// Jaccard 相似度
function jaccardSimilarity(set1, set2) {
  if (!set1 || !set2) return 0;
  const arr1 = set1.split(',').map(s => s.trim()).filter(s => s);
  const arr2 = set2.split(',').map(s => s.trim()).filter(s => s);
  if (arr1.length === 0 || arr2.length === 0) return 0;

  const set = new Set([...arr1, ...arr2]);
  const intersection = arr1.filter(x => arr2.includes(x)).length;
  return intersection / set.size;
}

// 选项匹配度
function optionMatch(myValue, theirValue) {
  if (!myValue || !theirValue) return 0.5;
  if (myValue === theirValue) return 1;
  if (myValue === '不限') return 1;
  if (theirValue === '不限') return 1;
  return 0;
}

// 计算年级差距
function getGradeDiff(grade1, grade2) {
  const g1 = GRADE_ORDER[grade1] || 5;
  const g2 = GRADE_ORDER[grade2] || 5;
  return Math.abs(g1 - g2);
}

// ============ 过滤阶段 ============

function filterCandidates(myProfile, allProfiles) {
  return allProfiles.filter(p => {
    // 1. 性别偏好过滤
    if (myProfile.preferred_gender && myProfile.preferred_gender !== '不限') {
      if (p.gender !== myProfile.preferred_gender) return false;
    }

    // 对方也要接受我的性别
    if (p.preferred_gender && p.preferred_gender !== '不限') {
      if (myProfile.gender !== p.preferred_gender) return false;
    }

    // 2. 年级偏好过滤
    if (myProfile.preferred_grade) {
      if (!checkGradeMatch(myProfile.preferred_grade, p.my_grade)) return false;
    }
    // 对方也要接受我的年级
    if (p.preferred_grade) {
      if (!checkGradeMatch(p.preferred_grade, myProfile.my_grade)) return false;
    }

    // 3. 身高偏好过滤
    if (myProfile.preferred_height && myProfile.preferred_height !== '不限') {
      if (!checkHeightMatch(myProfile.preferred_height, p.height)) return false;
    }

    // 4. 校区接受度过滤
    if (myProfile.cross_campus === '不可以接受') {
      if (p.campus !== myProfile.campus) return false;
    }

    // 5. 年级差过滤（最多差3级）
    if (getGradeDiff(myProfile.my_grade, p.my_grade) > 3) return false;

    return true;
  });
}

function checkGradeMatch(preference, grade) {
  if (!preference || !grade) return true;
  if (preference === '不限') return true;

  if (preference === '大一-大四（本科）') {
    return ['大一', '大二', '大三', '大四'].includes(grade);
  }
  if (preference === '研一-博五（硕博）') {
    return ['研一', '研二', '研三', '博一', '博二', '博三', '博四', '博五'].includes(grade);
  }
  return true;
}

function checkHeightMatch(preference, height) {
  if (!preference || !height) return true;
  if (preference === '不限') return true;

  const heightRanges = {
    '140-150': [140, 150],
    '151-160': [151, 160],
    '161-170': [161, 170],
    '171-180': [171, 180],
    '181-210': [181, 210]
  };

  const myRange = heightRanges[preference];
  const theirRange = heightRanges[height];

  if (!myRange || !theirRange) return true;

  // 检查范围是否有交集
  return !(myRange[1] < theirRange[0] || myRange[0] > theirRange[1]);
}

// ============ 相似度计算 ============

function calculateInterestScore(myProfile, theirProfile) {
  // 兴趣爱好 Jaccard 相似度
  return jaccardSimilarity(myProfile.interests, theirProfile.interests);
}

function calculateLifestyleScore(myProfile, theirProfile) {
  // 生活习惯相关字段
  const lifestyleFields = ['sleep_schedule', 'smoke_alcohol', 'pet', 'social_boundary'];
  let score = 0;
  let count = 0;

  for (const field of lifestyleFields) {
    if (myProfile[field] && theirProfile[field]) {
      score += optionMatch(myProfile[field], theirProfile[field]);
      count++;
    }
  }

  return count > 0 ? score / count : 0.5;
}

function calculateLoveValueScore(myProfile, theirProfile) {
  // 恋爱观念相关字段
  const loveFields = ['long_distance', 'communication', 'spending', 'cohabitation', 'marriage_plan', 'relationship_style'];
  let score = 0;
  let count = 0;

  for (const field of loveFields) {
    if (myProfile[field] && theirProfile[field]) {
      score += optionMatch(myProfile[field], theirProfile[field]);
      count++;
    }
  }

  return count > 0 ? score / count : 0.5;
}

// ============ 主匹配函数 ============

function calculateMatchScore(myProfile, theirProfile) {
  const interestScore = calculateInterestScore(myProfile, theirProfile);
  const lifestyleScore = calculateLifestyleScore(myProfile, theirProfile);
  const loveValueScore = calculateLoveValueScore(myProfile, theirProfile);

  // 综合评分权重
  const finalScore =
    interestScore * 0.3 +
    lifestyleScore * 0.3 +
    loveValueScore * 0.4;

  return Math.round(finalScore * 100) / 100;
}

function formatMatchResult(candidate, score) {
  return {
    user_id: candidate.user_id,
    email: candidate.email,
    name: candidate.name,
    my_grade: candidate.my_grade,
    gender: candidate.gender,
    height: candidate.height,
    campus: candidate.campus,
    interests: candidate.interests,
    score
  };
}

function getCurrentWeekMatch(userId) {
  const weekNumber = getWeekNumber();

  const match = dbModule.prepare(`
    SELECT
      CASE WHEN m.user_id_1 = ? THEN u2.id ELSE u1.id END AS user_id,
      CASE WHEN m.user_id_1 = ? THEN u2.email ELSE u1.email END AS email,
      CASE WHEN m.user_id_1 = ? THEN u2.name ELSE u1.name END AS name,
      CASE WHEN m.user_id_1 = ? THEN p2.my_grade ELSE p1.my_grade END AS my_grade,
      CASE WHEN m.user_id_1 = ? THEN p2.gender ELSE p1.gender END AS gender,
      CASE WHEN m.user_id_1 = ? THEN p2.height ELSE p1.height END AS height,
      CASE WHEN m.user_id_1 = ? THEN p2.campus ELSE p1.campus END AS campus,
      CASE WHEN m.user_id_1 = ? THEN p2.interests ELSE p1.interests END AS interests,
      m.score AS score
    FROM matches m
    JOIN users u1 ON u1.id = m.user_id_1
    JOIN users u2 ON u2.id = m.user_id_2
    JOIN profiles p1 ON p1.user_id = u1.id
    JOIN profiles p2 ON p2.user_id = u2.id
    WHERE m.week_number = ? AND (m.user_id_1 = ? OR m.user_id_2 = ?)
    LIMIT 1
  `).get(
    userId, userId, userId, userId,
    userId, userId, userId, userId,
    weekNumber, userId, userId
  );

  return match || null;
}

/**
 * 为用户计算匹配列表
 * @param {number} userId - 用户ID
 * @returns {Array} 匹配结果列表
 */
function findMatches(userId) {
  const myUser = dbModule.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!myUser) return [];

  const myProfile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!myProfile) return [];

  // 获取所有其他用户资料
  const allProfiles = dbModule.prepare(`
    SELECT u.id AS user_id, u.email, u.name, p.*
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.id != ? AND u.verified = 1
  `).all(userId);

  if (allProfiles.length === 0) return [];

  // 过滤阶段
  const candidates = filterCandidates(myProfile, allProfiles);

  if (candidates.length === 0) return [];

  // 计算每个候选人的匹配分数
  const scored = candidates.map(candidate => {
    const score = calculateMatchScore(myProfile, candidate);
    return formatMatchResult(candidate, score);
  });

  // 按分数降序排序
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * 获取前N名匹配
 * @param {number} userId - 用户ID
 * @param {number} topN - 返回数量，默认5
 * @returns {Array}
 */
function getTopMatches(userId, topN = 5) {
  const matches = findMatches(userId);
  return matches.slice(0, topN);
}

function getMatchesForDisplay(userId, topN = 10) {
  const currentWeekMatch = getCurrentWeekMatch(userId);
  if (currentWeekMatch) {
    return {
      matches: [currentWeekMatch],
      source: 'weekly'
    };
  }

  return {
    matches: getTopMatches(userId, topN),
    source: 'live'
  };
}

/**
 * 保存本周匹配结果到数据库
 */
function saveWeeklyMatches() {
  const weekNumber = getWeekNumber();

  // 检查本周是否已匹配
  const existing = dbModule.prepare('SELECT id FROM matches WHERE week_number = ?').get(weekNumber);
  if (existing) {
    return { success: false, message: '本周已执行匹配' };
  }

  // 获取所有已填写问卷的用户
  const users = dbModule.prepare(`
    SELECT u.id, u.email, u.name, p.my_grade
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.verified = 1
  `).all();

  if (users.length < 2) {
    return { success: false, message: '用户数量不足' };
  }

  const insertMatch = dbModule.prepare(`
    INSERT INTO matches (user_id_1, user_id_2, score, week_number)
    VALUES (?, ?, ?, ?)
  `);

  // 为每个用户找出最佳匹配（贪婪算法）
  const matched = new Set();
  const results = [];

  try {
    dbModule.transaction(() => {
      for (const user of users) {
        if (matched.has(user.id)) continue;

        const matches = findMatches(user.id).filter(m => !matched.has(m.user_id));

        if (matches.length > 0) {
          const bestMatch = matches[0];
          insertMatch.runWithoutSave(user.id, bestMatch.user_id, bestMatch.score, weekNumber);
          matched.add(user.id);
          matched.add(bestMatch.user_id);

          results.push({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              my_grade: user.my_grade
            },
            match: {
              id: bestMatch.user_id,
              email: bestMatch.email,
              name: bestMatch.name,
              my_grade: bestMatch.my_grade
            },
            score: bestMatch.score
          });
        }
      }
    });
  } catch (error) {
    console.error('保存周匹配结果失败:', error);
    return { success: false, message: '匹配保存失败，请稍后重试', results: [] };
  }

  if (results.length === 0) {
    return { success: false, message: '暂无满足条件的匹配结果', results: [] };
  }

  return { success: true, message: `匹配完成，共 ${results.length} 对`, results };
}

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  return Math.floor(diff / 604800000);
}

module.exports = {
  findMatches,
  getTopMatches,
  getMatchesForDisplay,
  saveWeeklyMatches,
  calculateMatchScore
};
