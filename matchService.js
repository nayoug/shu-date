/**
 * 匹配服务 - 完整匹配算法（2026-03 新版问卷）
 *
 * 过滤条件：
 * - 性别偏好
 * - 年龄范围（age_min, age_max）
 * - 校区接受度（accepted_campus）
 * - 身高偏好范围（preferred_height_min, preferred_height_max）
 * - 家乡偏好（hometown, preferred_hometown）
 *
 * 相似度计算：
 * - 兴趣标签 Jaccard
 * - 生活方式相似度（作息、饮食、口味、约会、消费、烟酒）
 * - 恋爱观匹配度（相处节奏、仪式感、相处模式、亲密关系时机、冲突处理）
 * - 兴趣爱好相似度偏好（partner_interest）
 *
 * 综合评分：
 * - interest: 0.25
 * - lifestyle: 0.35
 * - love_values: 0.25
 * - lovetype: 0.15
 */

const dbModule = require('./database');
const lovetypeService = require('./lovetypeService');
const { getWeekNumber } = require('./weekNumber');

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

function parseNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// 整数相似度（用于-2到2的评分）
function intSimilarity(val1, val2) {
  const normalizedVal1 = parseNullableInt(val1);
  const normalizedVal2 = parseNullableInt(val2);

  if (normalizedVal1 === null || normalizedVal2 === null) return 0.5;

  const clampedVal1 = Math.max(-2, Math.min(2, normalizedVal1));
  const clampedVal2 = Math.max(-2, Math.min(2, normalizedVal2));
  const diff = Math.abs(clampedVal1 - clampedVal2);
  const similarity = 1 - (Math.min(diff, 4) / 4); // 最大差为4，转换为0-1
  return Math.max(0, Math.min(1, similarity));
}

function isHeightWithinRange(height, min, max) {
  const normalizedHeight = parseNullableInt(height);
  const normalizedMin = parseNullableInt(min);
  const normalizedMax = parseNullableInt(max);

  // 缺少任一侧的实际身高或偏好上下限时，不因缺值直接过滤掉候选人。
  if (normalizedHeight === null || normalizedMin === null || normalizedMax === null) {
    return true;
  }

  const lowerBound = Math.min(normalizedMin, normalizedMax);
  const upperBound = Math.max(normalizedMin, normalizedMax);
  return normalizedHeight >= lowerBound && normalizedHeight <= upperBound;
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

    // 2. 年龄范围过滤（使用绝对年龄范围）
    if (myProfile.age_min !== null && myProfile.age_max !== null) {
      if (p.age) {
        const theirAge = parseInt(p.age);
        if (theirAge < myProfile.age_min || theirAge > myProfile.age_max) return false;
      }
    }
    // 对方也要在我的年龄范围内
    if (p.age_min !== null && p.age_max !== null) {
      if (myProfile.age) {
        const myAge = parseInt(myProfile.age);
        if (myAge < p.age_min || myAge > p.age_max) return false;
      }
    }

    // 3. 校区接受度过滤
    if (myProfile.accepted_campus && p.campus) {
      const acceptedCampuses = myProfile.accepted_campus.split(',').map(s => s.trim());
      if (!acceptedCampuses.includes(p.campus)) return false;
    }
    // 对方也要接受我的校区
    if (p.accepted_campus && myProfile.campus) {
      const acceptedCampuses = p.accepted_campus.split(',').map(s => s.trim());
      if (!acceptedCampuses.includes(myProfile.campus)) return false;
    }

    // 4. 身高偏好过滤
    if (!isHeightWithinRange(
      p.height_min,
      myProfile.preferred_height_min,
      myProfile.preferred_height_max
    )) {
      return false;
    }
    if (!isHeightWithinRange(
      myProfile.height_min,
      p.preferred_height_min,
      p.preferred_height_max
    )) {
      return false;
    }

    // 5. 家乡偏好过滤
    if (myProfile.preferred_hometown && myProfile.preferred_hometown !== '不限') {
      if (myProfile.preferred_hometown === '同家乡') {
        if (p.hometown !== myProfile.hometown) return false;
      }
    }
    // 对方也要接受我的家乡
    if (p.preferred_hometown && p.preferred_hometown !== '不限') {
      if (p.preferred_hometown === '同家乡') {
        if (myProfile.hometown !== p.hometown) return false;
      }
    }

    return true;
  });
}

// ============ 相似度计算 ============

// 考虑用户对伴侣兴趣相似的偏好
function calculateInterestScoreWithPreference(myProfile, theirProfile) {
  const baseScore = jaccardSimilarity(myProfile.interests, theirProfile.interests);
  const preference = myProfile.partner_interest;

  // 如果用户偏好相似（partner_interest > 0），提高匹配分数要求
  // 如果用户偏好互补（partner_interest < 0），降低匹配分数要求
  if (preference === null || preference === undefined) return baseScore;

  if (preference >= 1) {
    // 希望高度相似：加分
    return Math.min(1, baseScore + 0.2);
  } else if (preference <= -1) {
    // 可以互补：保持原分数
    return baseScore;
  } else {
    // 中立：轻微加分
    return baseScore + 0.1;
  }
}

function calculateLifestyleScore(myProfile, theirProfile) {
  // 生活方式相关字段 - 使用整数相似度（-2到2）
  const lifestyleFields = [
    'sleep_pattern',    // 作息节律
    'diet_preference',  // 饮食偏好
    'spice_tolerance',  // 食辣能力
    'date_preference',  // 周末约会
    'spending_style',   // 消费风格
    'smoking_habit',    // 吸烟习惯
    'drinking_habit'   // 饮酒习惯
  ];

  let score = 0;
  let count = 0;

  for (const field of lifestyleFields) {
    if (myProfile[field] !== null && myProfile[field] !== undefined &&
        theirProfile[field] !== null && theirProfile[field] !== undefined) {
      score += intSimilarity(myProfile[field], theirProfile[field]);
      count++;
    }
  }

  return count > 0 ? score / count : 0.5;
}

function calculateLoveValueScore(myProfile, theirProfile) {
  // 当前问卷中的恋爱观量表题
  const loveScaleFields = [
    'relationship_rhythm', // 相处节奏
    'romantic_ritual',     // 仪式感
    'relationship_style',  // 相处模式
    'sexual_timing',       // 亲密关系时机
    'conflict_style'       // 冲突处理
  ];

  let score = 0;
  let count = 0;

  for (const field of loveScaleFields) {
    if (myProfile[field] !== null && myProfile[field] !== undefined &&
        theirProfile[field] !== null && theirProfile[field] !== undefined) {
      score += intSimilarity(myProfile[field], theirProfile[field]);
      count++;
    }
  }

  return count > 0 ? score / count : 0.5;
}

// ============ 主匹配函数 ============

function calculateMatchScore(myProfile, theirProfile) {
  const interestScore = calculateInterestScoreWithPreference(myProfile, theirProfile);
  const lifestyleScore = calculateLifestyleScore(myProfile, theirProfile);
  const loveValueScore = calculateLoveValueScore(myProfile, theirProfile);
  const lovetypeAdjustment = lovetypeService.getCompatibilityAdjustment(myProfile.lovetype_code, theirProfile.lovetype_code);

  // 综合评分权重（根据新问卷调整）
  const baseScore =
    interestScore * 0.25 +
    lifestyleScore * 0.35 +
    loveValueScore * 0.25;

  // LoveType兼容性和基础分结合
  const finalScore = Math.max(0, Math.min(1, baseScore + lovetypeAdjustment));

  return Math.round(finalScore * 100) / 100;
}

/**
 * 为用户计算匹配列表
 * @param {number} userId - 用户ID
 * @returns {Array} 匹配结果列表
 */
async function findMatches(userId) {
  const myUser = await dbModule.queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!myUser) return [];

  const myProfile = await dbModule.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!myProfile) return [];

  // 获取所有其他用户资料
  const allProfiles = await dbModule.query(`
    SELECT u.id, u.email, u.nickname, u.name, p.*
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.id != $1 AND u.verified = 1
  `, [userId]);

  if (allProfiles.length === 0) return [];

  // 过滤阶段
  const candidates = filterCandidates(myProfile, allProfiles);

  if (candidates.length === 0) return [];

  // 计算每个候选人的匹配分数
  const scored = candidates.map(candidate => {
    const score = calculateMatchScore(myProfile, candidate);
    return {
      user_id: candidate.id,
      email: candidate.email,
      nickname: candidate.nickname || candidate.name,
      name: candidate.name,
      my_grade: candidate.my_grade,
      gender: candidate.gender,
      age: candidate.age,
      height_min: candidate.height_min,
      campus: candidate.campus,
      hometown: candidate.hometown,
      interests: candidate.interests,
      lovetype_code: candidate.lovetype_code,
      lovetype_match_label: lovetypeService.getCompatibilityLabel(myProfile.lovetype_code, candidate.lovetype_code),
      score: score
    };
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
async function getTopMatches(userId, topN = 5) {
  const matches = await findMatches(userId);
  return matches.slice(0, topN);
}

/**
 * 保存本周匹配结果到数据库
 */
async function saveWeeklyMatches() {
  const weekNumber = getWeekNumber();

  // 检查本周是否已匹配
  const existing = await dbModule.queryOne('SELECT id FROM matches WHERE week_number = $1', [weekNumber]);
  if (existing) {
    return { success: false, message: '本周已执行匹配' };
  }

  // 获取所有已填写问卷的用户
  const users = await dbModule.query(`
    SELECT u.id, u.email, u.nickname, u.name, p.my_grade
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.verified = 1
  `);

  if (users.length < 2) {
    return { success: false, message: '用户数量不足' };
  }

  // 为每个用户找出最佳匹配（贪婪算法）
  const matched = new Set();
  const results = [];

  for (const user of users) {
    if (matched.has(user.id)) continue;

    const matches = (await findMatches(user.id)).filter(m => !matched.has(m.user_id));

    if (matches.length > 0) {
      const bestMatch = matches[0];
      await dbModule.execute(`
        INSERT INTO matches (user_id_1, user_id_2, score, week_number)
        VALUES ($1, $2, $3, $4)
      `, [user.id, bestMatch.user_id, bestMatch.score, weekNumber]);
      matched.add(user.id);
      matched.add(bestMatch.user_id);

      results.push({
        score: bestMatch.score,
        user1: {
          id: user.id,
          email: user.email,
          nickname: user.nickname || user.name || user.email.split('@')[0],
          my_grade: user.my_grade
        },
        user2: {
          id: bestMatch.user_id,
          email: bestMatch.email,
          nickname: bestMatch.nickname || bestMatch.name || bestMatch.email.split('@')[0],
          my_grade: bestMatch.my_grade
        }
      });
    }
  }

  return { success: true, message: `匹配完成，共 ${results.length} 对`, results };
}

module.exports = {
  findMatches,
  getTopMatches,
  saveWeeklyMatches,
  calculateMatchScore
};
