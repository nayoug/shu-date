const LOVETYPE_DATA = require('./lovetypeData');

const LOVETYPE_DIMENSIONS = [
  ['L', 'F'],
  ['A', 'C'],
  ['R', 'P'],
  ['E', 'O']
];

const LOVETYPE_QUESTIONS = [
  { id: 'q1', number: 1, prompt: '我偏好比自己更成熟的人。', left: { text: '是', letter: 'C' }, right: { text: '否', letter: 'A' } },
  { id: 'q2', number: 2, prompt: '我很容易被人吸引并坠入爱河。', left: { text: '是', letter: 'P' }, right: { text: '否', letter: 'R' } },
  { id: 'q4', number: 4, prompt: '相对来说我比较倾向迎合恋人。', left: { text: '是', letter: 'F' }, right: { text: '否', letter: 'L' } },
  { id: 'q5', number: 5, prompt: '有单恋的倾向。', left: { text: '是', letter: 'F' }, right: { text: '否', letter: 'L' } },
  { id: 'q6', number: 6, prompt: '和恋人在一起时，哪种感受更强烈？', left: { text: '想撒娇，依赖对方', letter: 'C' }, right: { text: '想被依赖，被需要', letter: 'A' } },
  { id: 'q7', number: 7, prompt: '你比较想去哪里约会？', left: { text: '去我自己想去的地方', letter: 'L' }, right: { text: '去伴侣想去的地方', letter: 'F' } },
  { id: 'q8', number: 8, prompt: '如果要选的话，你更倾向于：', left: { text: '会逐渐喜欢上一个人', letter: 'R' }, right: { text: '会突然喜欢上一个人', letter: 'P' } },
  { id: 'q9', number: 9, prompt: '在恋爱中，我常常比较被动，容易被对方牵着走', left: { text: '是', letter: 'F' }, right: { text: '否', letter: 'L' } },
  { id: 'q10', number: 10, prompt: '你的伴侣是否曾说过你很粘人，或者你自己有没有觉得自己很粘人？', left: { text: '有', letter: 'C' }, right: { text: '没有', letter: 'A' } },
  { id: 'q11', number: 11, prompt: '我有时会觉得伴侣孩子气又可爱。', left: { text: '是', letter: 'A' }, right: { text: '否', letter: 'C' } },
  { id: 'q12', number: 12, prompt: '你觉得在爱情中自己哪一面更强烈？', left: { text: '自由随性', letter: 'O' }, right: { text: '认真严肃', letter: 'E' } },
  { id: 'q13', number: 13, prompt: '如果你的伴侣在约会回家的路上，提议绕道散步你会怎么做？', left: { text: '如果我很累，可能会拒绝', letter: 'L' }, right: { text: '就算有点累，我也会答应', letter: 'F' } },
  { id: 'q14', number: 14, prompt: '你在寻找伴侣时通常是什么心态？', left: { text: '我对理想型有明确的印象，而且这个想法几乎不会改变', letter: 'R' }, right: { text: '我没有明确的理想型，或者我的理想型是自己爱上的人', letter: 'P' } },
  { id: 'q15', number: 15, prompt: '你觉得自己在恋爱中属于喜欢掌握主导权的人吗？', left: { text: '是', letter: 'L' }, right: { text: '否', letter: 'F' } },
  { id: 'q16', number: 16, prompt: '对于朋友以上，恋人未满的关系：', left: { text: '我能享受它，保持现状', letter: 'O' }, right: { text: '我希望能尽快开始交往', letter: 'E' } },
  { id: 'q17', number: 17, prompt: '你能清楚、有逻辑地解释自己为什么会喜欢上一个人吗？', left: { text: '是', letter: 'R' }, right: { text: '否', letter: 'P' } },
  { id: 'q19', number: 19, prompt: '交往之后，你希望伴侣对你有多少关心或干涉？', left: { text: '希望少一点干涉，能保有自由', letter: 'O' }, right: { text: '如果对方在意我，关心我，我会觉得很开心', letter: 'E' } },
  { id: 'q20', number: 20, prompt: '你偶尔会幻想什么样的爱人？', left: { text: '能温柔接纳我的人', letter: 'C' }, right: { text: '让我想要去守护的人', letter: 'A' } },
  { id: 'q21', number: 21, prompt: '你认为自己是哪种类型？', left: { text: '会认真考虑未来的人', letter: 'R' }, right: { text: '只要当下喜欢对方就足够的人', letter: 'P' } },
  { id: 'q22', number: 22, prompt: '交往之后你的生活会有什么变化？', left: { text: '和朋友相处或投入兴趣的时间和交往前差不多', letter: 'O' }, right: { text: '恋人会成为我最优先考虑的人', letter: 'E' } },
  { id: 'q24', number: 24, prompt: '你认为自己更接近哪一种类型？', left: { text: '比起理想或条件，更重视内心的喜欢感觉。', letter: 'P' }, right: { text: '会明确思考并认真寻找符合理想的人', letter: 'R' } },
  { id: 'q25', number: 25, prompt: '你的恋爱风格是什么？', left: { text: '诚恳专注，会认真对待对方', letter: 'E' }, right: { text: '自由随性，按照自己步调去爱', letter: 'O' } },
  { id: 'q26', number: 26, prompt: '约会前对方说“还是想去别的地方”的话：', left: { text: '如果对方能开心就觉得无所谓', letter: 'F' }, right: { text: '先谈谈再说', letter: 'L' } }
];

const LOVETYPE_SCALE_OPTIONS = [
  { value: '2', label: '绝对A选项' },
  { value: '1', label: '略偏A选项' },
  { value: '0', label: '中间' },
  { value: '-1', label: '略偏B选项' },
  { value: '-2', label: '绝对B选项' }
];

const COMPATIBILITY_WEIGHTS = {
  best: 0.12,
  good: 0.06,
  challenge: -0.08
};

function createEmptyScores() {
  return {
    L: 0, F: 0,
    A: 0, C: 0,
    R: 0, P: 0,
    E: 0, O: 0
  };
}

function parseStoredAnswers(rawAnswers) {
  if (!rawAnswers) {
    return {};
  }

  if (typeof rawAnswers === 'object') {
    return rawAnswers;
  }

  try {
    return JSON.parse(rawAnswers);
  } catch (error) {
    return {};
  }
}

function sanitizeAnswerMap(answerMap = {}) {
  const sanitized = {};

  for (const question of LOVETYPE_QUESTIONS) {
    const rawValue = Number(answerMap[question.id] ?? 0);
    sanitized[question.id] = Number.isFinite(rawValue) && [-2, -1, 0, 1, 2].includes(rawValue)
      ? String(rawValue)
      : '0';
  }

  return sanitized;
}

function getLoveTypeProfile(code) {
  if (!code) {
    return null;
  }

  return LOVETYPE_DATA[code] || null;
}

function calculateLoveType(answerMap = {}) {
  const answers = sanitizeAnswerMap(answerMap);
  const scores = createEmptyScores();

  for (const question of LOVETYPE_QUESTIONS) {
    const value = Number(answers[question.id]);
    if (value > 0) {
      scores[question.left.letter] += value;
    } else if (value < 0) {
      scores[question.right.letter] += Math.abs(value);
    }
  }

  const code = LOVETYPE_DIMENSIONS
    .map(([leftLetter, rightLetter]) => (scores[leftLetter] >= scores[rightLetter] ? leftLetter : rightLetter))
    .join('');

  return {
    code,
    scores,
    answers,
    result: getLoveTypeProfile(code),
    dimensions: LOVETYPE_DIMENSIONS.map(([leftLetter, rightLetter]) => ({
      pair: `${leftLetter}/${rightLetter}`,
      leftLetter,
      rightLetter,
      leftScore: scores[leftLetter],
      rightScore: scores[rightLetter],
      winner: scores[leftLetter] >= scores[rightLetter] ? leftLetter : rightLetter
    }))
  };
}

function scoreCompatibilityOneWay(sourceCode, targetCode) {
  const profile = getLoveTypeProfile(sourceCode);
  if (!profile || !targetCode) {
    return 0;
  }

  const { compatibilityTypes = {} } = profile;
  if ((compatibilityTypes.best || []).includes(targetCode)) {
    return COMPATIBILITY_WEIGHTS.best;
  }
  if ((compatibilityTypes.good || []).includes(targetCode)) {
    return COMPATIBILITY_WEIGHTS.good;
  }
  if ((compatibilityTypes.challenge || []).includes(targetCode)) {
    return COMPATIBILITY_WEIGHTS.challenge;
  }

  return 0;
}

function getCompatibilityAdjustment(codeA, codeB) {
  if (!codeA || !codeB) {
    return 0;
  }

  return (scoreCompatibilityOneWay(codeA, codeB) + scoreCompatibilityOneWay(codeB, codeA)) / 2;
}

function getCompatibilityLabel(codeA, codeB) {
  const adjustment = getCompatibilityAdjustment(codeA, codeB);

  if (adjustment >= COMPATIBILITY_WEIGHTS.best) {
    return '最佳配对';
  }
  if (adjustment >= COMPATIBILITY_WEIGHTS.good / 2) {
    return '良好配对';
  }
  if (adjustment <= COMPATIBILITY_WEIGHTS.challenge / 2) {
    return '需要磨合';
  }

  return '中性';
}

module.exports = {
  LOVETYPE_QUESTIONS,
  LOVETYPE_SCALE_OPTIONS,
  calculateLoveType,
  getLoveTypeProfile,
  getCompatibilityAdjustment,
  getCompatibilityLabel,
  parseStoredAnswers
};
