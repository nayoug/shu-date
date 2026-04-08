# 心有所SHU - 项目文档

> 上海大学校园恋爱匹配平台 | V0.2.0

## 访问地址

**快速开始**: https://shudate.xyz

---

## 一、项目概述

### 1.1 项目背景

心有所SHU 是一个面向上海大学学生的校园交友匹配平台，通过问卷分析和智能匹配算法，帮助同学找到志趣相投的朋友或恋爱对象。

### 1.2 目标用户

- 上海大学在校本科生、研究生、博士生、已毕业校友
- 拥有 @shu.edu.cn 学校邮箱

### 1.3 核心价值

- 校园邮箱验证，确保用户真实性
- 科学的匹配算法，基于多维度的匹配度计算
- 每周定期匹配，避免选择困难

### 1.4 在线地址

- **应用地址**: https://shudate.xyz

---

## 二、功能模块

### 2.1 用户认证

| 功能 | 状态 | 说明 |
|------|------|------|
| 邮箱密码注册 | ✅ 已完成 | 仅支持 @shu.edu.cn 邮箱 |
| 邮箱验证 | ✅ 已完成 | 发送验证邮件，点击链接验证 |
| 登录/登出 | ✅ 已完成 | Session 管理，7天有效期 |
| 忘记密码 | ✅ 已完成 | 邮件重置链接 |
| 修改密码 | ✅ 已完成 | 已登录用户修改密码 |
| 自动注册 | ✅ 已完成 | 新邮箱自动创建账号 |

### 2.2 问卷系统

问卷系统分为三部分：

#### 基础信息（共8题）
- 性别、期望对象性别、学历阶段
- 年龄、期望对象年龄、校区、期望对象校区
- 交友目的、身高、期望对象身高
- 家乡、期望对象家乡
- 期望对象核心特质

#### 恋爱观念问卷（共14题）
- 相处节奏、仪式感、相处模式
- 日常作息、饮食偏好、吃辣能力
- 约会选择、消费风格
- 饮酒态度、吸烟态度、动物态度
- 性观念、冲突应对、见面频率

#### 个人特征与匹配偏好（共3题）
- 自身性格特质、期望对象性格特质
- 兴趣爱好、期望对象兴趣爱好

#### LoveType16 恋爱类型测试（23题）
- 5级量表评估恋爱行为偏好
- 计算16种恋爱类型

### 2.3 匹配系统

#### 过滤条件
| 条件 | 规则 |
|------|------|
| 性别偏好 | 双方互相接受 |
| 年龄偏好 | 在对方要求范围内 |
| 身高偏好 | 在对方要求范围内 |
| 校区 | 在对方要求范围内 |
| 家乡 | 若有同家乡要求 |

#### 匹配度计算
| 维度 | 分值 | 计算方式 | 最大总分 | 
|------|------|----------|----------| 
| 交友目的 | +2分 | 是否相同 | 2分 | 
| 核心特质 | +2分/项 | 选项相同个数 | 2*3=6分 | 
| 恋爱观念 | +3分/项 | 14个维度整数距离打分 | 3*14=42分 | 
| 性格特质 | +6分/项 | 选项匹配个数 | 6*5=30分 | 
| 兴趣爱好 | +3*4分/- | Jaccard 相似度 | 3*4=12分 | 
| lovetype | +8分/+5分/-2分 | 最佳配对/良好配对/需要磨合 | 8分 | 

#### 匹配方式
- **周匹配**：管理员手动触发，为所有用户配对

- **平均值**：使用调和平均，计算A对B和B对A匹配分数的调和平均值，确保用户体验。

- **匹配算法**：按用户顺序依次为每位用户选择当前最优且未被匹配的对象（基于局部贪心策略）

- **归一化**：把分数开根号再乘10，优化分数显示

### 2.4 管理后台

| 功能 | 状态 | 说明 |
|------|------|------|
| 用户列表 | ✅ 已完成 | 查看所有注册用户 |
| 手动匹配 | ✅ 已完成 | 触发本周匹配 |
| 权限控制 | ✅ 已完成 | 仅 `ADMIN_EMAILS` 白名单中的邮箱可访问 |

### 2.5 开发者工具

开发环境下，所有页面右上角显示开发者工具按钮（🔧），点击弹出工具面板：

| 功能 | 说明 |
|------|------|
| 环境信息 | 显示当前环境（development）和端口 |
| 管理后台快捷入口 | 快速跳转到管理页面 |
| 退出登录 | 快速退出当前账号 |

**设计特点：**
- 仅在开发环境（`NODE_ENV=development`）显示
- 固定在页面右上角，不干扰正常页面布局
- 点击弹窗外部自动关闭
- 生产环境完全隐藏

---

## 三、技术架构

### 3.1 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | PostgreSQL（Supabase） |
| 模板引擎 | EJS |
| 邮件服务 | Resend |
| 部署平台 | Render |

### 3.2 项目结构

```
shu-date/
├── app.js              # 主应用入口、路由定义
├── database.js         # 数据库初始化与操作
├── mailer.js           # 邮件发送服务
├── lovetypeService.js  # 恋爱类型测试服务
├── lovetypeData.js     # 恋爱类型数据
├── matchService.js     # 匹配算法（待完善）
├── package.json        # 依赖配置
├── render.yaml         # Render 部署配置
├── views/              # EJS 模板
│   ├── layout.ejs      # 布局模板
│   ├── index.ejs       # 首页
│   ├── login.ejs       # 登录页
│   ├── register.ejs    # 注册页
│   ├── verify.ejs      # 验证页
│   ├── profile.ejs     # 问卷页
│   ├── matches.ejs     # 匹配结果页
│   └── admin.ejs       # 管理后台
└── public/             # 静态资源
```

### 3.3 数据库设计

#### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| email | TEXT | 邮箱（唯一，小写存储） |
| nickname | TEXT | 昵称 |
| password_hash | TEXT | 密码哈希（bcrypt） |
| verified | INTEGER | 是否验证（0/1） |
| verification_token | TEXT | 注册验证 token |
| verification_expire | TIMESTAMP | 注册验证 token 过期时间 |
| reset_token | TEXT | 密码重置 token |
| reset_token_expire | TIMESTAMP | 密码重置 token 过期时间 |
| weekly_match_confirmed | INTEGER | 是否确认参与本周匹配（0/1） |
| created_at | TIMESTAMP | 创建时间 |

#### profiles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID（外键） |
| gender | TEXT | 性别 |
| preferred_gender | TEXT | 期望性别 |
| my_grade | TEXT | 我的年级 |
| age | INTEGER | 年龄 |
| age_min | INTEGER | 期望最小年龄 |
| age_max | INTEGER | 期望最大年龄 |
| purpose | TEXT | 交友目的 |
| campus | TEXT | 所在校区 |
| accepted_campus | TEXT | 接受跨校区（逗号分隔） |
| height | INTEGER | 我的身高 |
| preferred_height_min | INTEGER | 期望最小身高 |
| preferred_height_max | INTEGER | 期望最大身高 |
| hometown | TEXT | 家乡 |
| preferred_hometown | TEXT | 期望家乡 |
| core_traits | TEXT | 核心特质（逗号分隔） |

| relationship_rhythm | INTEGER | 恋爱节奏 |
| romantic_ritual | INTEGER | 仪式感 |
| relationship_style | INTEGER | 相处模式 |
| sleep_pattern | INTEGER | 作息习惯 |
| diet_preference | INTEGER | 饮食偏好 |
| spice_tolerance | INTEGER | 辣度接受度 |
| date_preference | INTEGER | 约会偏好 |
| spending_style | INTEGER | 消费观念 |
| drinking_habit | INTEGER | 饮酒习惯 |
| partner_drinking | INTEGER | 对伴侣饮酒态度 |
| smoking_habit | INTEGER | 吸烟习惯 |
| partner_smoking | INTEGER | 对伴侣吸烟态度 |
| pet_attitude | INTEGER | 宠物态度 |
| sexual_timing | INTEGER | 性观念 |
| conflict_style | INTEGER | 应对冲突 |
| meeting_frequency | INTEGER | 见面频率 |

| my_traits | TEXT | 性格特质（逗号分隔） |
| partner_traits | TEXT | 伴侣性格特质（逗号分隔） |
| interests | TEXT | 兴趣标签（逗号分隔） |
| partner_interest | INTEGER | 期望伴侣兴趣相似程度 |

| lovetype_answers | TEXT | 恋爱类型测试答案 |
| lovetype_code | TEXT | 恋爱类型代码 |
| lovetype_scores | TEXT | 恋爱类型分数 |

| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### couple_requests 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| requester_id | INTEGER | 发起者ID（外键） |
| receiver_id | INTEGER | 接收者ID（外键） |
| status | TEXT | 状态（pending/accepted/rejected） |
| match_score | NUMERIC(5,2) | 匹配得分（固定保存） |
| match_comment | TEXT | 匹配评语（固定保存，DeepSeek生成） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### matches 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id_1 | INTEGER | 用户1 ID |
| user_id_2 | INTEGER | 用户2 ID |
| score | REAL | 匹配分数 |
| matched_at | TIMESTAMP | 匹配时间 |
| week_number | INTEGER | 周数 |

#### user_sessions 表
| 字段 | 类型 | 说明 |
|------|------|------|
| sid | VARCHAR | Session ID（主键） |
| sess | JSON | Session 内容 |
| expire | TIMESTAMP | 过期时间 |

> Session 通过 PostgreSQL 持久化，默认 TTL 为 7 天；应用会定期清理过期记录，进程重启后不会回退到默认 MemoryStore 行为。

---

## 四、API 路由

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 首页 | 公开 |
| GET | /login | 登录页 | 公开 |
| POST | /login | 密码登录 | 公开 |
| POST | /login/code | 验证码登录 | 公开 |
| GET | /forgot | 忘记密码页 | 公开 |
| POST | /forgot | 发送重置邮件 | 公开 |
| GET | /reset/:code | 重置密码页 | 公开 |
| POST | /reset/:code | 设置新密码 | 公开 |
| POST | /register | 注册新用户 | 公开 |
| GET | /register/verify/:token | 注册邮箱验证 | 公开 |
| GET | /logout | 登出 | 已登录 |
| GET | /profile | 问卷页 | 已登录 |
| POST | /survey/submit | 提交问卷 | 已登录 |
| POST | /profile | 更新问卷 | 已登录 |
| GET | /settings | 账户设置页 | 已登录 |
| GET | /settings/password | 修改密码页 | 已登录 |
| POST | /settings/password | 修改密码 | 已登录 |
| GET | /settings/delete | 注销账号页 | 已登录 |
| POST | /settings/delete | 注销账号 | 已登录 |
| GET | /notifications | 通知中心 | 已登录 |
| GET | /confirm-match | 确认匹配页 | 已登录，需先填写问卷 |
| GET | /matches | 查看本周正式匹配结果 | 已登录，需确认匹配 |
| GET | /couple-match | 情侣匹配页 | 已登录 |
| POST | /couple-match/request | 发送情侣匹配申请 | 已登录 |
| POST | /couple-match/accept/:id | 同意匹配申请 | 已登录 |
| POST | /couple-match/reject/:id | 拒绝匹配申请 | 已登录 |
| GET | /couple-match/result/:id | 查看匹配结果 | 已登录 |
| GET | /api/matches | 获取实时推荐列表 | 已登录 |
| GET | /api/match/top | 获取前 5 名实时推荐 | 已登录 |
| GET | /api/couple-match/comment/:id | 异步获取匹配评语 | 已登录 |
| GET | /admin | 管理后台 | 管理员 |
| POST | /admin/match | 手动触发匹配 | 管理员 |
| GET | /version | 版本信息 | 公开 |

---

## 五、环境变量

### 5.1 核心环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `SESSION_SECRET` | 生产必需 | Session 加密密钥 |
| `BASE_URL` | 是 | 应用基础URL |
| `ADMIN_EMAILS` | 管理后台必需 | 逗号分隔的管理员邮箱白名单 |
| `NODE_ENV` | 否 | 环境模式 |

### 5.2 邮件相关环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `RESEND_API_KEY` | 生产必需 | Resend API Key |
| `FROM_EMAIL` | 否 | 发件人邮箱 |

### 5.3 AI 相关环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | 生成评语必需 | DeepSeek API Key |

### 5.3 环境区分

系统根据 `NODE_ENV` 变量区分测试环境和正式环境：

| 环境 | NODE_ENV | 特性 |
|------|----------|------|
| 本地开发 | `development` 或未设置 | 显示开发者工具面板 |
| 正式部署 | `production` | 隐藏所有开发调试功能 |

**开发环境特性**：
- 页面右上角显示开发者工具按钮（🔧）
- 工具面板包含：测试用户一键登录、环境信息、快捷操作
- 问卷页显示"一键填写（测试）"按钮
- 不需要配置 RESEND_API_KEY 也可测试登录流程

**生产环境特性**：
- 完全隐藏开发者工具
- 强制要求 `SESSION_SECRET`
- Session Cookie 的 `secure` / `proxy` 会根据 `NODE_ENV` 自动切换
- 必须配置 `RESEND_API_KEY` 才能发送邮件

### 5.4 本地开发配置示例

```bash
# .env 文件（开发环境）
NODE_ENV=development
DATABASE_URL=postgresql://postgres.xxx:密码@xxx.supabase.com:6543/postgres
BASE_URL=http://localhost:3000
SESSION_SECRET=任意随机字符串
PORT=3000

```

---

## 六、部署信息

### 6.1 线上地址

- **应用地址**: https://shudate.xyz

### 6.2 Render 配置方法

1. 登录 Render 后台
2. 选择服务 → Environment
3. 添加以下变量：
   ```
   NODE_ENV=production
   DATABASE_URL=你的Supabase连接字符串
   RESEND_API_KEY=re_xxx
   FROM_EMAIL=no-reply@你的域名
   SESSION_SECRET=32位以上随机字符串
   BASE_URL=https://你的域名
   ```
4. 保存后自动重新部署

### 6.3 已知限制

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 服务休眠 | 30分钟无访问自动休眠 | 升级付费版或定时唤醒 |

---

## 七、开发进展

### 7.1 已完成功能

- [x] 邮箱密码注册登录
- [x] 邮箱验证功能
- [x] 忘记密码/重置密码
- [x] 修改密码功能
- [x] 24题恋爱匹配问卷
- [x] 智能匹配算法
- [x] 匹配结果查看
- [x] 管理后台
- [x] 部署上线
- [x] 测试模式（无需真实邮件）
- [x] 恋爱类型测试服务
- [x] 统一导航栏
- [x] 确认匹配功能（需手动确认参与本周匹配）

### 7.2 待优化事项

- [ ] 自动每周匹配任务
- [ ] 完善错误处理和提示
- [ ] 添加用户昵称/头像功能
- [ ] 匹配结果展示优化
- [ ] 移动端适配优化

### 7.3 开发环境启动

```bash
# 安装依赖
npm install

# 启动开发服务
npm run dev

# 访问
http://localhost:3000
```

### 7.4 测试账号

| 角色 | 邮箱 | 说明 |
|------|------|------|
| 普通用户 | test@shu.edu.cn | 任意 @shu.edu.cn 邮箱 |
| 管理员 | 任意配置进 `ADMIN_EMAILS` 的邮箱 | 可访问管理后台 |

---

## 八、更新日志

### 2026-03-30 - V0.2.0
- 更新部分问卷题目与顺序
- 重构匹配度评分系统
- 用ADMIN_EMAILS代替管理员硬编码邮箱
- 为认证和管理写入口增加基础限流
- 补齐稳定的 HTML 版 404/500 错误页与 API 版 JSON 兜底响应
- 收拢正式匹配与实时推荐的边界
- 优化移动端适配

### 2026-03-28 - V0.1.2
- 新增密码注册功能（邮箱+昵称+密码）
- 新增邮箱验证流程（验证邮件+验证链接）
- 新增忘记密码/重置密码功能
- 新增统一导航栏 navbar.ejs（下拉菜单）
- 新增修改密码功能
- 代码优化：database.js 简化为直接使用 pg pool
- 移除重复的旧路由代码
- 新增开发者工具面板（右上角🔧按钮）
- 开发环境一键测试用户登录
- 开发者工具包含：环境信息、管理后台快捷入口
- 优化所有页面布局，开发者工具统一在右上角显示

### 2026-03-27 - V0.1.1
- 切换数据库从 SQLite 到 Supabase PostgreSQL
- 添加 pg 依赖
- 更新 database.js 适配异步 PostgreSQL
- 管理端手动匹配改为 POST + CSRF
- 修复 matchService 与异步 PostgreSQL 封装的调用链
- 添加恋爱类型测试服务（LoveType16）
- 使用签名 cookie 实现测试用户持久登录

### 2026-03-26
- 修复登录测试模式显示问题
- 修复 BASE_URL 未设置导致的链接错误
- 添加问卷一键填写按钮（开发模式）
- 添加导航栏和退出按钮到所有页面
- 管理员登录自动跳转到管理页面
- 添加环境区分逻辑（NODE_ENV）
- 完善产品文档

### 2026-03-25 - V0.1
- 初始版本
- 实现邮箱登录流程
- 实现24题问卷
- 实现匹配算法
- 部署到 Render

---

## 九、待完成任务

### 高优先级
1. [ ] 配置自动每周匹配任务 (Cron job)
2. [ ] 将匹配任务与邮件通知接入自动调度
3. [ ] 优化用户画像展示

### 中优先级
4. [ ] 添加用户头像功能
5. [ ] 优化匹配详情页UI
6. [ ] 添加数据统计功能

### 低优先级
7. [ ] 微信小程序版本
8. [ ] iOS/Android App

---

**Made with ❤️ for SHU Students**
