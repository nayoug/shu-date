export const profileData = {
  gender: "男",
  preferred_gender: "男",
  my_grade: "大二",
  age: 20,
  campus: "宝山",
  accepted_campus: ["宝山", "嘉定"],
  interests: ["游戏", "电影", "AI"],
  core_traits: ["温柔", "理性", "敏感"],
  lovetype_code: "INFP",
  hasProfile: true,
  verified: true,
  nickname: "轨霜",
  email: "user@shu.edu.cn",
};

export const notificationsData = [
  {
    id: 1,
    type: "match",
    title: "本周匹配已生成",
    content: "你可以前往匹配页查看本周正式匹配对象。",
    createdAt: "2026-04-01T10:00:00Z",
    read: false,
  },
  {
    id: 2,
    type: "system",
    title: "系统维护通知",
    content: "本周六凌晨将进行短时维护。",
    createdAt: "2026-03-30T08:00:00Z",
    read: true,
  },
];

export const matchData = {
  weekNumber: 14,
  score: 0.86,
  partner: {
    nickname: "某同学",
    my_grade: "大三",
    campus: "宝山",
    interests: ["音乐", "阅读"],
    lovetype_code: "ENFJ",
  },
};

export const navItems = [
  { key: "home", href: "/", label: "主页" },
  { key: "matches", href: "/matches/", label: "匹配" },
  { key: "profile", href: "/profile/", label: "资料" },
  { key: "notifications", href: "/notifications/", label: "通知", count: true },
  { key: "settings", href: "/settings/", label: "设置" },
];

export const notificationTypeMeta = {
  match: { label: "匹配", tone: "match" },
  system: { label: "系统", tone: "system" },
  announcement: { label: "公告", tone: "announcement" },
};

export const loginStates = {
  default: {
    tone: "info",
    title: "校园邮箱登录",
    body: "使用校园邮箱登录后，就可以继续填写资料并查看本周匹配。",
  },
  failure: {
    tone: "danger",
    title: "登录失败",
    body: "请检查邮箱或密码后重试。",
  },
  unverified: {
    tone: "warning",
    title: "邮箱尚未验证",
    body: "先完成校园邮箱验证，再继续后面的流程。",
  },
  reset: {
    tone: "success",
    title: "密码已重置",
    body: "密码已重置，可以直接使用新密码登录。",
  },
};

