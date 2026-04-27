/**
 * 匹配服务 - 100分制匹配算法（开根号乘10版）
 *
 * 硬筛选条件（必须满足）：
 * - 性别偏好互相对应
 * - 年龄在对方要求范围内
 * - 校区在对方接受范围内
 * - 身高在对方要求范围内
 * - 家乡（同家乡要求）
 *
 * 加分项（总分上限100分）：
 * - 交友目的（purpose）相同：+2分
 * - 核心特质（core_traits）每相同一项：+2分（满分6分）
 * - 恋爱观念（14个维度）整数距离：每项3分（共42分）
 * - 性格特质（partner_traits）每命中一项：+6分（满分30分）
 * - 兴趣爱好（interests）Jaccard × partner_interest 权重（满分12分）
 * - lovetype 最佳配对+8 / 良好配对+5 / 需要磨合-2
 */

const dbModule = require('./database');
const lovetypeService = require('./lovetypeService');
const { getWeekNumber, getYear } = require('./weekNumber');

// ============ 工具函数 ============

function parseNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function clampInt(value, min, max) {
  if (value === null) return null;
  return Math.min(max, Math.max(min, value));
}

function isHeightWithinRange(myHeight, theirMin, theirMax) {
  const h = parseNullableInt(myHeight);
  const min = parseNullableInt(theirMin);
  const max = parseNullableInt(theirMax);
  if (h === null || min === null || max === null) return true;
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return h >= lower && h <= upper;
}

function parseTagsField(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(s => s);
}

// ============ 硬筛选阶段 ============

// 独立的硬筛选检查函数（备用，目前 filterCandidates 内联了相同逻辑）
function passesHardFilters(myProfile, theirProfile) {
  // 1. 性别互相对应
  if (myProfile.preferred_gender && myProfile.preferred_gender !== '不限') {
    if (theirProfile.gender !== myProfile.preferred_gender) return false;
  }
  if (theirProfile.preferred_gender && theirProfile.preferred_gender !== '不限') {
    if (myProfile.gender !== theirProfile.preferred_gender) return false;
  }

  // 2. 年龄范围互相对应
  if (myProfile.age_min !== null && myProfile.age_max !== null && theirProfile.age !== null) {
    const theirAge = parseInt(theirProfile.age);
    if (theirAge < myProfile.age_min || theirAge > myProfile.age_max) return false;
  }
  if (theirProfile.age_min !== null && theirProfile.age_max !== null && myProfile.age !== null) {
    const myAge = parseInt(myProfile.age);
    if (myAge < theirProfile.age_min || myAge > theirProfile.age_max) return false;
  }

  // 3. 校区互相对应
  if (myProfile.accepted_campus && theirProfile.campus) {
    const accepted = myProfile.accepted_campus.split(',').map(s => s.trim());
    if (!accepted.includes(theirProfile.campus)) return false;
  }
  if (theirProfile.accepted_campus && myProfile.campus) {
    const accepted = theirProfile.accepted_campus.split(',').map(s => s.trim());
    if (!accepted.includes(myProfile.campus)) return false;
  }

  // 4. 身高互相对应
  if (!isHeightWithinRange(theirProfile.height, myProfile.preferred_height_min, myProfile.preferred_height_max)) return false;
  if (!isHeightWithinRange(myProfile.height, theirProfile.preferred_height_min, theirProfile.preferred_height_max)) return false;

  // 5. 家乡（同家乡要求）
  if (myProfile.preferred_hometown === '同家乡' && myProfile.hometown) {
    if (theirProfile.hometown !== myProfile.hometown) return false;
  }
  if (theirProfile.preferred_hometown === '同家乡' && theirProfile.hometown) {
    if (myProfile.hometown !== theirProfile.hometown) return false;
  }

  return true;
}

function filterCandidates(myProfile, allProfiles) {
  return allProfiles.filter(p => {
    // 1. 性别互相对应：我的性别必须在对方的偏好中，对方的性别也必须在我的偏好中
    if (myProfile.preferred_gender && myProfile.preferred_gender !== '不限') {
      if (p.gender !== myProfile.preferred_gender) {
        return false;
      }
    }
    if (p.preferred_gender && p.preferred_gender !== '不限') {
      if (myProfile.gender !== p.preferred_gender) {
        return false;
      }
    }
    // 如果双方都没有设置偏好（null/空），不限制

    // 2. 年龄范围互相对应
    if (myProfile.age_min !== null && myProfile.age_max !== null && p.age !== null) {
      const theirAge = parseInt(p.age);
      if (theirAge < myProfile.age_min || theirAge > myProfile.age_max) return false;
    }
    if (p.age_min !== null && p.age_max !== null && myProfile.age !== null) {
      const myAge = parseInt(myProfile.age);
      if (myAge < p.age_min || myAge > p.age_max) return false;
    }

    // 3. 校区互相对应
    if (myProfile.accepted_campus && p.campus) {
      const accepted = myProfile.accepted_campus.split(',').map(s => s.trim());
      if (!accepted.includes(p.campus)) return false;
    }
    if (p.accepted_campus && myProfile.campus) {
      const accepted = p.accepted_campus.split(',').map(s => s.trim());
      if (!accepted.includes(myProfile.campus)) return false;
    }

    // 4. 身高互相对应
    if (!isHeightWithinRange(p.height, myProfile.preferred_height_min, myProfile.preferred_height_max)) return false;
    if (!isHeightWithinRange(myProfile.height, p.preferred_height_min, p.preferred_height_max)) return false;

    // 5. 家乡（同家乡要求）
    if (myProfile.preferred_hometown === '同家乡' && myProfile.hometown) {
      if (p.hometown !== myProfile.hometown) return false;
    }
    if (p.preferred_hometown === '同家乡' && p.hometown) {
      if (myProfile.hometown !== p.hometown) return false;
    }

    return true;
  });
}

// ============ 加分项计算 ============

// purpose 相同：+2分
function scorePurpose(myProfile, theirProfile) {
  if (!myProfile.purpose || !theirProfile.purpose) return 0;
  if (myProfile.purpose.trim() === theirProfile.purpose.trim()) return 2;
  return 0;
}

// core_traits 每相同一项：+2分（最多3项，满分6分）
function scoreCoreTraits(myProfile, theirProfile) {
  const myTraits = parseTagsField(myProfile.core_traits);
  const theirTraits = parseTagsField(theirProfile.core_traits);
  if (myTraits.length === 0 || theirTraits.length === 0) return 0;

  // 按唯一值去重后计算交集数量
  const mySet = new Set(myTraits);
  const theirSet = new Set(theirTraits);

  let matchCount = 0;
  for (const trait of mySet) {
    if (theirSet.has(trait)) {
      matchCount += 1;
    }
  }

  // 最多按3项计分（每项2分，满分6分）
  const cappedMatches = Math.min(matchCount, 3);
  return cappedMatches * 2;
}

// 14个维度整数距离打分：每题3分（共42分）
// 值域 -2 到 2，差值越大分数越低
// 12项直接配对 + 2项交叉配对（drinking_habit vs partner_drinking，smoking_habit vs partner_smoking）
function scoreLifestyleDimensions(myProfile, theirProfile) {
  let totalScore = 0;

  const directFields = [
    'relationship_rhythm',  // 恋爱节奏
    'romantic_ritual',      // 仪式感
    'relationship_style',   // 相处模式
    'sleep_pattern',        // 作息习惯
    'diet_preference',      // 饮食偏好
    'spice_tolerance',      // 辣度接受度
    'date_preference',      // 约会偏好
    'spending_style',       // 消费观念
    'pet_attitude',          // 宠物态度
    'sexual_timing',         // 性观念
    'conflict_style',        // 应对冲突
    'meeting_frequency'      // 见面频率
  ];

  for (const field of directFields) {
    const myVal = parseNullableInt(myProfile[field]);
    const theirVal = parseNullableInt(theirProfile[field]);
    totalScore += (myVal === null || theirVal === null)
      ? 1.5
      : Math.max(0, 0.75*(4 - Math.abs(myVal - theirVal)));
  }

  // 交叉配对：我的 drinking_habit vs 对方的 partner_drinking
  const myDrinking = parseNullableInt(myProfile.drinking_habit);
  const theirPartnerDrinking = parseNullableInt(theirProfile.partner_drinking);
  totalScore += (myDrinking === null || theirPartnerDrinking === null)
    ? 1.5
    : Math.max(0, 0.75*(4 - Math.abs(myDrinking - theirPartnerDrinking)));

  // 交叉配对：我的 smoking_habit vs 对方的 partner_smoking
  const mySmoking = parseNullableInt(myProfile.smoking_habit);
  const theirPartnerSmoking = parseNullableInt(theirProfile.partner_smoking);
  totalScore += (mySmoking === null || theirPartnerSmoking === null)
    ? 1.5
    : Math.max(0, 0.75*(4 - Math.abs(mySmoking - theirPartnerSmoking)));

  return totalScore; // 满分 42
}

// partner_traits 每命中一项：+6分（共30分）
function scorePartnerTraits(myProfile, theirProfile) {
  const myPreferredTraits = parseTagsField(myProfile.partner_traits);
  const theirActualTraits = parseTagsField(theirProfile.my_traits);
  if (myPreferredTraits.length === 0 || theirActualTraits.length === 0) return 0;
  const matches = myPreferredTraits.filter(t => theirActualTraits.includes(t));
  return Math.min(30, matches.length * 6);
}

// 兴趣爱好 标准 Jaccard × partner_interest 权重（满分12分）
// Jaccard = |A ∩ B| / |A ∪ B|，权重范围 0~4
function scoreInterests(myProfile, theirProfile) {
  const myInterests = parseTagsField(myProfile.interests);
  const theirInterests = parseTagsField(theirProfile.interests);

  if (myInterests.length === 0) return 0;

  const matched = myInterests.filter(i => theirInterests.includes(i));
  const union = [...new Set([...myInterests, ...theirInterests])];
  const jaccard = union.length > 0 ? matched.length / union.length : 0; // 标准 Jaccard: intersection / union

  const partnerInterest = clampInt(parseNullableInt(myProfile.partner_interest), -2, 2);
  const weight = (partnerInterest !== null ? partnerInterest + 2 : 2); // 缺值默认权重2，历史脏值裁到 0~4

  const score = 3 * jaccard * weight;
  return Math.min(12, score); // 满分12分
}

// lovetype 加分/扣分
function scoreLovetype(myProfile, theirProfile) {
  if (!myProfile.lovetype_code || !theirProfile.lovetype_code) return 0;

  const label = lovetypeService.getCompatibilityLabel(myProfile.lovetype_code, theirProfile.lovetype_code);

  if (label === '最佳配对') return 8;
  if (label === '良好配对') return 5;
  if (label === '需要磨合') return -2;
  return 0;
}

// ============ 主匹配函数 ============

// 调和平均：A对B的分数和B对A的分数，取双方共识度
// 2*s1*s2 / (s1+s2)，若任一分为0则返回0
function harmonicMean(scoreAB, scoreBA) {
  if (scoreAB <= 0 || scoreBA <= 0) return 0;
  return (2 * scoreAB * scoreBA) / (scoreAB + scoreBA);
}

function calculateMatchScore(myProfile, theirProfile) {
  let total = 0;

  total += scorePurpose(myProfile, theirProfile);
  total += scoreCoreTraits(myProfile, theirProfile);
  total += scoreLifestyleDimensions(myProfile, theirProfile);
  total += scorePartnerTraits(myProfile, theirProfile);
  total += scoreInterests(myProfile, theirProfile);
  total += scoreLovetype(myProfile, theirProfile);

  // 上限 100 分
  return Math.max(0, Math.min(100, total));
}

function calculateMatchDetails(myProfile, theirProfile) {
  const purposeScore = scorePurpose(myProfile, theirProfile);
  const coreTraitsScore = scoreCoreTraits(myProfile, theirProfile);
  const lifestyleScore = scoreLifestyleDimensions(myProfile, theirProfile);
  const partnerTraitsScore = scorePartnerTraits(myProfile, theirProfile);
  const interestsScore = scoreInterests(myProfile, theirProfile);
  const lovetypeScore = scoreLovetype(myProfile, theirProfile);
  const total = purposeScore + coreTraitsScore + lifestyleScore + partnerTraitsScore + interestsScore + lovetypeScore;

  return {
    total: Math.max(0, Math.min(100, total)),
    breakdown: {
      purpose: purposeScore,
      core_traits: coreTraitsScore,
      lifestyle_dimensions: lifestyleScore,
      partner_traits: partnerTraitsScore,
      interests: interestsScore,
      lovetype: lovetypeScore
    }
  };
}

// ============ 数据库查询接口 ============

async function findMatches(userId, targetYear = null, targetWeek = null) {
  const userIdInt = parseInt(userId, 10);
  const myUser = await dbModule.queryOne('SELECT * FROM users WHERE id = $1', [userIdInt]);
  if (!myUser) return [];

  const myProfile = await dbModule.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userIdInt]);
  if (!myProfile) return [];

  const filters = ['u.id != $1', 'u.verified = 1'];
  const params = [userIdInt];

  if (targetYear !== null && targetWeek !== null) {
    params.push(targetYear, targetWeek);
    filters.push(`u.weekly_match_year = $${params.length - 1}`);
    filters.push(`u.weekly_match_week = $${params.length}`);
  }

  const allProfiles = await dbModule.query(`
    SELECT u.id as user_id, u.email, u.nickname, u.name, p.*
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE ${filters.join(' AND ')}
  `, params);

  if (allProfiles.length === 0) return [];

  const candidates = filterCandidates(myProfile, allProfiles);
  if (candidates.length === 0) return [];

  const scored = candidates.map(candidate => {
    const scoreAB = calculateMatchScore(myProfile, candidate);
    const scoreBA = calculateMatchScore(candidate, myProfile);
    const scoreRaw = harmonicMean(scoreAB, scoreBA);
    // 归一化：开根号乘10，始终百分制
    const score = Math.round(Math.sqrt(scoreRaw) * 10);
    const detailsA = calculateMatchDetails(myProfile, candidate);

    return {
      user_id: candidate.user_id,
      email: candidate.email,
      nickname: candidate.nickname || candidate.name,
      name: candidate.name,
      my_grade: candidate.my_grade,
      gender: candidate.gender,
      preferred_gender: candidate.preferred_gender,
      age: candidate.age,
      height: candidate.height,
      campus: candidate.campus,
      hometown: candidate.hometown,
      interests: candidate.interests,
      lovetype_code: candidate.lovetype_code,
      lovetype_label: lovetypeService.getCompatibilityLabel(myProfile.lovetype_code, candidate.lovetype_code),
      score: score,
      score_ab: scoreAB,
      score_ba: scoreBA,
      score_breakdown: detailsA.breakdown
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function getTopMatches(userId, topN = 5, targetYear = null, targetWeek = null) {
  const matches = await findMatches(userId, targetYear, targetWeek);
  return matches.slice(0, topN);
}

async function saveWeeklyMatches(targetYear = null, targetWeek = null) {
  const year = targetYear !== null ? targetYear : getYear();
  const weekNumber = targetWeek !== null ? targetWeek : getWeekNumber();

  const users = await dbModule.query(`
    SELECT u.id as user_id, u.email, u.nickname, u.name, p.my_grade
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.verified = 1
      AND u.weekly_match_year = $1
      AND u.weekly_match_week = $2
  `, [year, weekNumber]);

  if (users.length < 2) {
    return { success: false, message: '用户数量不足' };
  }

  const matched = new Set();
  const results = [];

  for (const user of users) {
    if (matched.has(user.user_id)) continue;

    const allMatches = await findMatches(user.user_id, year, weekNumber);
    const matches = allMatches.filter(m => !matched.has(m.user_id));

    if (matches.length > 0) {
      const bestMatch = matches[0];
      // score 已在 findMatches 中完成归一化（开根号乘10），直接使用
      const normalizedScore = bestMatch.score;
      const userId1 = parseInt(user.user_id, 10);
      const userId2 = parseInt(bestMatch.user_id, 10);

      // 跳过无效用户ID
      if (isNaN(userId1) || isNaN(userId2)) {
        continue;
      }

      await dbModule.execute(`
        INSERT INTO matches (user_id_1, user_id_2, score, week_number, match_year)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId1, userId2, normalizedScore, weekNumber, year]);
      matched.add(userId1);
      matched.add(userId2);

      results.push({
        score: bestMatch.score,
        user1: {
          id: user.user_id,
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

  try {
    await dbModule.withTransaction(async (client) => {
      await client.query('LOCK TABLE matches IN SHARE ROW EXCLUSIVE MODE');

      const existing = await client.query(
        'SELECT id FROM matches WHERE match_year = $1 AND week_number = $2 LIMIT 1',
        [year, weekNumber]
      );
      if (existing.rowCount > 0) {
        throw new Error('WEEKLY_MATCH_ALREADY_EXISTS');
      }

      for (const pair of results) {
        await client.query(`
          INSERT INTO matches (user_id_1, user_id_2, score, week_number, match_year)
          VALUES ($1, $2, $3, $4, $5)
        `, [pair.user1.id, pair.user2.id, pair.score, weekNumber, year]);
      }
    });
  } catch (error) {
    if (error.message === 'WEEKLY_MATCH_ALREADY_EXISTS') {
      return { success: false, message: '本周已执行匹配' };
    }
    throw error;
  }

  return { success: true, message: `匹配完成，共 ${results.length} 对`, results };
}

// 获取情侣匹配得分（不进行硬筛选，已在一起的用户不受约束限制）
async function getCoupleMatch(userAId, userBId) {
  const profileA = await dbModule.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userAId]);
  const profileB = await dbModule.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userBId]);

  if (!profileA || !profileB) {
    return null;
  }

  const scoreAB = calculateMatchScore(profileA, profileB);
  const scoreBA = calculateMatchScore(profileB, profileA);
  const scoreRaw = harmonicMean(scoreAB, scoreBA);

  // 归一化：开根号乘10
  const score = Math.sqrt(scoreRaw) * 10;

  // 计算双方各自的 breakdown
  const detailsA = calculateMatchDetails(profileA, profileB);
  const detailsB = calculateMatchDetails(profileB, profileA);

  // 调和平均 breakdown
  const breakdown = {};
  for (const key in detailsA.breakdown) {
    const vA = detailsA.breakdown[key];
    const vB = detailsB.breakdown[key];
    breakdown[key] = vA > 0 && vB > 0 ? (2 * vA * vB) / (vA + vB) : 0;
  }

  return {
    score: Math.round(score * 100) / 100,
    breakdown: breakdown,
    total: Math.round(score * 100) / 100
  };
}

module.exports = {
  findMatches,
  getTopMatches,
  saveWeeklyMatches,
  calculateMatchScore,
  calculateMatchDetails,
  filterCandidates,
  getCoupleMatch
};
