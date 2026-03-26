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
 * - 生活习惯匹配度
 * - 恋爱观匹配度
 *
 * 综合评分：
 * - interest: 0.3
 * - lifestyle: 0.3
 * - love_values: 0.4
 */

const dbModule = require('./database');

const GRADE_ORDER = {
  '大一': 1, '大二': 2, '大三': 3, '大四': 4,
  '研一': 5, '研二': 6, '研三': 7,
  '博一': 8, '博二': 9, '博三': 10, '博四': 11, '博五': 12
};
const WEEKLY_MATCH_LOCK_NAMESPACE = 9724;

function jaccardSimilarity(set1, set2) {
  if (!set1 || !set2) return 0;

  const arr1 = set1.split(',').map(s => s.trim()).filter(Boolean);
  const arr2 = set2.split(',').map(s => s.trim()).filter(Boolean);
  if (arr1.length === 0 || arr2.length === 0) return 0;

  const union = new Set([...arr1, ...arr2]);
  const intersection = arr1.filter(item => arr2.includes(item)).length;
  return intersection / union.size;
}

function optionMatch(myValue, theirValue) {
  if (!myValue || !theirValue) return 0.5;
  if (myValue === theirValue) return 1;
  if (myValue === '不限' || theirValue === '不限') return 1;
  return 0;
}

function getGradeDiff(grade1, grade2) {
  const g1 = GRADE_ORDER[grade1] || 5;
  const g2 = GRADE_ORDER[grade2] || 5;
  return Math.abs(g1 - g2);
}

function checkGradeMatch(preference, grade) {
  if (!preference || !grade || preference === '不限') return true;

  if (preference === '大一-大四（本科）') {
    return ['大一', '大二', '大三', '大四'].includes(grade);
  }

  if (preference === '研一-博五（硕博）') {
    return ['研一', '研二', '研三', '博一', '博二', '博三', '博四', '博五'].includes(grade);
  }

  return true;
}

function checkHeightMatch(preference, height) {
  if (!preference || !height || preference === '不限') return true;

  const heightRanges = {
    '140-150': [140, 150],
    '151-160': [151, 160],
    '161-170': [161, 170],
    '171-180': [171, 180],
    '181-210': [181, 210]
  };

  const preferredRange = heightRanges[preference];
  const targetRange = heightRanges[height];
  if (!preferredRange || !targetRange) return true;

  return !(preferredRange[1] < targetRange[0] || preferredRange[0] > targetRange[1]);
}

function isCandidateCompatible(myProfile, profile) {
  if (myProfile.preferred_gender && myProfile.preferred_gender !== '不限') {
    if (profile.gender !== myProfile.preferred_gender) return false;
  }

  if (profile.preferred_gender && profile.preferred_gender !== '不限') {
    if (myProfile.gender !== profile.preferred_gender) return false;
  }

  if (myProfile.preferred_grade && !checkGradeMatch(myProfile.preferred_grade, profile.my_grade)) {
    return false;
  }

  if (profile.preferred_grade && !checkGradeMatch(profile.preferred_grade, myProfile.my_grade)) {
    return false;
  }

  if (myProfile.preferred_height && myProfile.preferred_height !== '不限') {
    if (!checkHeightMatch(myProfile.preferred_height, profile.height)) return false;
  }

  if (myProfile.cross_campus === '不可以接受' && profile.campus !== myProfile.campus) {
    return false;
  }

  if (getGradeDiff(myProfile.my_grade, profile.my_grade) > 3) {
    return false;
  }

  return true;
}

function filterCandidates(myProfile, allProfiles) {
  return allProfiles.filter(profile => isCandidateCompatible(myProfile, profile));
}

function calculateInterestScore(myProfile, theirProfile) {
  return jaccardSimilarity(myProfile.interests, theirProfile.interests);
}

function calculateLifestyleScore(myProfile, theirProfile) {
  const lifestyleFields = ['sleep_schedule', 'smoke_alcohol', 'pet', 'social_boundary'];
  let score = 0;
  let count = 0;

  for (const field of lifestyleFields) {
    if (myProfile[field] && theirProfile[field]) {
      score += optionMatch(myProfile[field], theirProfile[field]);
      count += 1;
    }
  }

  return count > 0 ? score / count : 0.5;
}

function calculateLoveValueScore(myProfile, theirProfile) {
  const loveFields = ['long_distance', 'communication', 'spending', 'cohabitation', 'marriage_plan', 'relationship_style'];
  let score = 0;
  let count = 0;

  for (const field of loveFields) {
    if (myProfile[field] && theirProfile[field]) {
      score += optionMatch(myProfile[field], theirProfile[field]);
      count += 1;
    }
  }

  return count > 0 ? score / count : 0.5;
}

function calculateMatchScore(myProfile, theirProfile) {
  const interestScore = calculateInterestScore(myProfile, theirProfile);
  const lifestyleScore = calculateLifestyleScore(myProfile, theirProfile);
  const loveValueScore = calculateLoveValueScore(myProfile, theirProfile);

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

function formatWeeklyMatchUser(participant) {
  return {
    id: participant.user_id,
    email: participant.email,
    name: participant.name,
    my_grade: participant.my_grade
  };
}

async function loadVerifiedParticipants(client = null) {
  const sql = `
    SELECT u.id AS user_id, u.email, u.name, p.*
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.verified = 1
    ORDER BY u.id ASC
  `;

  if (client) {
    const result = await client.query(sql);
    return result.rows;
  }

  return await dbModule.query(sql);
}

function buildCandidateMap(participants) {
  const candidateMap = new Map();

  for (const participant of participants) {
    candidateMap.set(participant.user_id, []);
  }

  for (let i = 0; i < participants.length; i += 1) {
    const current = participants[i];

    for (let j = 0; j < participants.length; j += 1) {
      if (i === j) continue;

      const candidate = participants[j];
      if (!isCandidateCompatible(current, candidate)) continue;

      candidateMap.get(current.user_id).push(
        formatMatchResult(candidate, calculateMatchScore(current, candidate))
      );
    }
  }

  for (const matches of candidateMap.values()) {
    matches.sort((a, b) => b.score - a.score || a.user_id - b.user_id);
  }

  return candidateMap;
}

async function getCurrentWeekMatch(userId) {
  const weekNumber = getWeekNumber();

  return await dbModule.queryOne(`
    SELECT
      CASE WHEN m.user_id_1 = $1 THEN u2.id ELSE u1.id END AS user_id,
      CASE WHEN m.user_id_1 = $1 THEN u2.email ELSE u1.email END AS email,
      CASE WHEN m.user_id_1 = $1 THEN u2.name ELSE u1.name END AS name,
      CASE WHEN m.user_id_1 = $1 THEN p2.my_grade ELSE p1.my_grade END AS my_grade,
      CASE WHEN m.user_id_1 = $1 THEN p2.gender ELSE p1.gender END AS gender,
      CASE WHEN m.user_id_1 = $1 THEN p2.height ELSE p1.height END AS height,
      CASE WHEN m.user_id_1 = $1 THEN p2.campus ELSE p1.campus END AS campus,
      CASE WHEN m.user_id_1 = $1 THEN p2.interests ELSE p1.interests END AS interests,
      COALESCE(m.score, 0) AS score
    FROM matches m
    JOIN users u1 ON u1.id = m.user_id_1
    JOIN users u2 ON u2.id = m.user_id_2
    JOIN profiles p1 ON p1.user_id = u1.id
    JOIN profiles p2 ON p2.user_id = u2.id
    WHERE m.week_number = $2 AND (m.user_id_1 = $1 OR m.user_id_2 = $1)
    ORDER BY m.matched_at DESC, m.id DESC
    LIMIT 1
  `, [userId, weekNumber]);
}

async function findMatches(userId) {
  const participants = await loadVerifiedParticipants();
  const myProfile = participants.find(participant => participant.user_id === userId);
  if (!myProfile) return [];

  const candidateMap = buildCandidateMap(participants);
  return candidateMap.get(userId) || [];
}

async function getTopMatches(userId, topN = 5) {
  const matches = await findMatches(userId);
  return matches.slice(0, topN);
}

async function getMatchesForDisplay(userId, topN = 10) {
  const currentWeekMatch = await getCurrentWeekMatch(userId);
  if (currentWeekMatch) {
    return {
      matches: [currentWeekMatch],
      source: 'weekly'
    };
  }

  return {
    matches: await getTopMatches(userId, topN),
    source: 'live'
  };
}

async function saveWeeklyMatches() {
  const weekNumber = getWeekNumber();
  const client = await dbModule.pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const lockResult = await client.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS locked',
      [WEEKLY_MATCH_LOCK_NAMESPACE, weekNumber]
    );

    if (!lockResult.rows[0]?.locked) {
      await client.query('ROLLBACK');
      return { success: false, message: '本周匹配正在执行，请稍后刷新', results: [] };
    }

    const existing = await client.query(
      'SELECT id FROM matches WHERE week_number = $1 ORDER BY matched_at DESC, id DESC LIMIT 1',
      [weekNumber]
    );
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, message: '本周已执行匹配', results: [] };
    }

    const participants = await loadVerifiedParticipants(client);
    if (participants.length < 2) {
      await client.query('ROLLBACK');
      return { success: false, message: '用户数量不足', results: [] };
    }

    const participantsById = new Map(participants.map(participant => [participant.user_id, participant]));
    const candidateMap = buildCandidateMap(participants);
    const matched = new Set();
    const results = [];
    const rowsToInsert = [];

    for (const participant of participants) {
      if (matched.has(participant.user_id)) continue;

      const bestMatch = (candidateMap.get(participant.user_id) || [])
        .find(match => !matched.has(match.user_id));
      if (!bestMatch) continue;

      const matchedParticipant = participantsById.get(bestMatch.user_id);
      if (!matchedParticipant) continue;

      rowsToInsert.push([
        participant.user_id,
        matchedParticipant.user_id,
        bestMatch.score,
        weekNumber
      ]);

      matched.add(participant.user_id);
      matched.add(matchedParticipant.user_id);

      results.push({
        user: formatWeeklyMatchUser(participant),
        match: formatWeeklyMatchUser(matchedParticipant),
        score: bestMatch.score
      });
    }

    if (results.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '暂无满足条件的匹配结果', results: [] };
    }

    const insertSql = rowsToInsert.map((_, index) => {
      const offset = index * 4;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    }).join(', ');
    const insertParams = rowsToInsert.flat();

    await client.query(
      `INSERT INTO matches (user_id_1, user_id_2, score, week_number) VALUES ${insertSql}`,
      insertParams
    );

    await client.query('COMMIT');
    return { success: true, message: `匹配完成，共 ${results.length} 对`, results };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('周匹配事务回滚失败:', rollbackError);
    }

    console.error('保存周匹配结果失败:', error);
    return { success: false, message: '匹配保存失败，请稍后重试', results: [] };
  } finally {
    client.release();
  }
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
