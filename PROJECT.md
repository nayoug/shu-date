# 心有所SHU - 项目文档

> 上海大学校园恋爱匹配平台 | V0.1.1

## 访问地址

**后端服务**: https://xin-yousuo-shu.onrender.com

> ⚠️ 注意：Render 免费版会自动休眠，首次访问可能需要等待几秒启动

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

- **后端服务**: https://xin-yousuo-shu.onrender.com

---

## 二、功能模块

### 2.1 用户认证

| 功能 | 状态 | 说明 |
|------|------|------|
| 邮箱验证码登录 | ✅ 已完成 | 仅支持 @shu.edu.cn 邮箱 |
| 自动注册 | ✅ 已完成 | 新邮箱自动创建账号 |
| Session 管理 | ✅ 已完成 | 7天有效期 |

### 2.2 问卷系统

24道选择题，分为4个模块：

### 一、基础信息（13题）
- 性别、期望对象性别、学历阶段
- 年级、期望对象年级、交友目的
- 校区、期望对象校区、身高、期望对象身高
- 家乡、期望对象家乡
- 期望对象核心特质

### 二、恋爱观念（5题）
- 沟通频率、消费观念
- 婚前同居态度、婚姻规划、相处模式

### 三、生活习惯（6题）
- 作息习惯、烟酒态度
- 宠物态度、社交公开度
- 社交边界、兴趣爱好（多选）

### 2.3 匹配系统

#### 过滤条件（硬性门槛）
| 条件 | 规则 |
|------|------|
| 性别偏好 | 双方互相接受（我接受对方 + 对方接受我） |
| 年龄范围 | 双方年龄都在对方设定的 age_min ~ age_max 范围内 |
| 校区接受度 | 双方校区都在对方的 accepted_campus 列表中 |
| 身高偏好 | 双方身高都在对方的偏好范围内 |
| 家乡偏好 | 如果要求"同家乡"，则双方家乡必须相同 |

#### 相似度计算（软性评分）

**综合评分公式：**
```
总分 = 兴趣分数 × 0.25 + 生活习惯 × 0.35 + 恋爱观念 × 0.25 + LoveType 加成
```

| 维度 | 权重 | 计算方式 |
|------|------|----------|
| 兴趣爱好 | 25% | Jaccard 相似度 + 伴侣偏好调节 |
| 生活习惯 | 35% | 7 项整数相似度平均值（-2 到 2 量表） |
| 恋爱观念 | 25% | 4 项选项匹配度平均值 |
| LoveType | 15% | 兼容性加分/减分 |

**生活习惯评分字段：**
- 作息节律（sleep_pattern）
- 饮食偏好（diet_preference）
- 食辣能力（spice_tolerance）
- 周末约会（date_preference）
- 消费风格（spending_style）
- 吸烟习惯（smoking_habit）
- 饮酒习惯（drinking_habit）

**恋爱观念评分字段：**
- 沟通频率（communication）
- 婚前同居（cohabitation）
- 婚姻规划（marriage_plan）
- 相处模式（relationship_style）

#### LoveType 兼容性

根据 LoveType16 人格类型的兼容性表进行加分或减分：
- 最佳配对（best）：+0.15
- 良好配对（good）：+0.08
- 需要磨合（challenge）：-0.05

#### 匹配方式
- **实时匹配**：用户访问 `/matches` 页面实时计算并展示 Top 10
- **周匹配**：管理员在后台点击"触发本周匹配"，使用贪婪算法为所有用户配对
- **手动配对**：管理员在后台手动选择两个用户进行配对

#### API 接口
| 接口 | 说明 |
|------|------|
| `GET /matches` | 渲染匹配结果页面 |
| `GET /api/matches` | 返回所有匹配 JSON |
| `GET /api/match/top` | 返回 Top 5 匹配 JSON |

### 2.4 管理后台

管理后台采用 Tab 切换布局，包含仪表盘、用户管理、匹配管理三大模块。

**访问权限：** 仅 `admin@shu.edu.cn` 邮箱可访问

#### 2.4.1 仪表盘

| 统计项 | 说明 |
|--------|------|
| 总用户数 | 所有注册用户 |
| 已验证用户 | 完成邮箱验证的用户 |
| 已填问卷 | 填写完问卷的用户 |
| 本周匹配 | 当前周数的匹配对数 |

**快速操作：** 触发本周匹配、查看用户、查看匹配

#### 2.4.2 用户管理

| 功能 | 说明 |
|------|------|
| 用户列表 | 显示 ID、邮箱、昵称、年级、校区、状态、LoveType、注册时间 |
| 搜索过滤 | 按邮箱或昵称搜索 |
| 用户详情 | 点击查看完整用户信息 + 问卷数据 |
| 状态标签 | 已验证/未验证、已填问卷 |

#### 2.4.3 匹配管理

| 功能 | 说明 |
|------|------|
| 手动配对 | 搜索选择两个用户进行配对 |
| 搜索功能 | 模糊搜索邮箱、年级、校区 |
| 本周匹配记录 | 显示配对双方信息 + 匹配分 |
| 触发匹配 | 一键触发本周自动匹配 |

**手动配对搜索特点：**
- 输入关键字实时模糊匹配
- 点击输入框显示最近 20 个用户
- 选中后显示已选用户，可移除重新选择

### 2.5 开发者工具

开发环境下，所有页面右上角显示开发者工具按钮（🔧），点击弹出工具面板：

| 功能 | 说明 |
|------|------|
| 快速登录 | 输入邮箱前缀（如 test、admin），一键登录对应用户 |
| 环境信息 | 显示当前环境（development）和端口 |
| 管理后台快捷入口 | 快速跳转到管理页面 |
| 退出登录 | 快速退出当前账号 |

**快速登录 API：**
- `GET /dev/login/:prefix` - 开发环境专用，自动创建/查找用户并登录
- 示例：`/dev/login/test` → 登录 `test@shu.edu.cn`

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
├── matchService.js     # 匹配算法
├── generateTestData.js # 测试数据生成脚本
├── package.json        # 依赖配置
├── render.yaml         # Render 部署配置
├── vercel.json         # Vercel 部署配置
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
| email | TEXT | 邮箱（唯一） |
| name | TEXT | 昵称 |
| verified | INTEGER | 是否验证 |
| login_code | TEXT | 登录验证码 |
| login_code_expire | TIMESTAMP | 验证码过期时间 |
| created_at | TIMESTAMP | 创建时间 |

#### profiles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 用户ID（外键） |
| gender | TEXT | 性别 |
| preferred_gender | TEXT | 期望性别 |
| purpose | TEXT | 交友目的 |
| my_grade | TEXT | 我的年级 |
| preferred_grade | TEXT | 期望年级 |
| campus | TEXT | 所在校区 |
| cross_campus | TEXT | 跨校区态度 |
| height | TEXT | 身高 |
| preferred_height | TEXT | 身高偏好 |
| hometown | TEXT | 家乡 |
| preferred_hometown | TEXT | 期望家乡 |
| core_traits | TEXT | 核心特质（逗号分隔） |
| long_distance | TEXT | 异地恋态度 |
| communication | TEXT | 沟通频率 |
| spending | TEXT | 消费观念 |
| cohabitation | TEXT | 婚前同居态度 |
| marriage_plan | TEXT | 婚姻规划 |
| relationship_style | TEXT | 相处模式 |
| sleep_schedule | TEXT | 作息习惯 |
| smoke_alcohol | TEXT | 烟酒态度 |
| pet | TEXT | 宠物态度 |
| social_public | TEXT | 社交公开度 |
| social_boundary | TEXT | 社交边界 |
| interests | TEXT | 兴趣标签（逗号分隔） |
| lovetype_answers | TEXT | 恋爱类型测试答案 |
| lovetype_code | TEXT | 恋爱类型代码 |
| lovetype_scores | TEXT | 恋爱类型分数 |
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

---

## 四、API 路由

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 首页 | 公开 |
| GET | /login | 登录页 | 公开 |
| POST | /login | 发送登录链接 | 公开 |
| GET | /login/verify/:code | 登录链接验证 | 公开 |
| GET | /register | 注册页 | 公开 |
| GET | /logout | 登出 | 已登录 |
| GET | /profile | 问卷页 | 已登录 |
| POST | /survey/submit | 提交问卷 | 已登录 |
| POST | /profile | 更新问卷 | 已登录 |
| GET | /matches | 匹配结果 | 已登录 |
| GET | /api/matches | 获取匹配列表 | 已登录 |
| GET | /api/match/top | 获取最佳匹配 | 已登录 |
| GET | /admin | 管理后台 | 管理员 |
| POST | /admin/match | 手动触发匹配 | 管理员 |

---

## 五、环境变量

### 5.1 核心环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `SESSION_SECRET` | 生产必需 | Session 加密密钥 |
| `BASE_URL` | 是 | 应用基础URL |
| `NODE_ENV` | 否 | 环境模式 |

### 5.2 邮件相关环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `RESEND_API_KEY` | 生产必需 | Resend API Key |
| `FROM_EMAIL` | 否 | 发件人邮箱 |

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
- Cookie 设置 `secure: true`
- 必须配置 `RESEND_API_KEY` 才能发送邮件

### 5.4 本地开发配置示例

```bash
# .env 文件（开发环境）
NODE_ENV=development
DATABASE_URL=postgresql://postgres.xxx:密码@xxx.supabase.com:6543/postgres
BASE_URL=http://localhost:3000
SESSION_SECRET=任意随机字符串
PORT=3000

# 邮件服务（开发环境可选，不配置会显示测试链接）
# RESEND_API_KEY=re_xxx
# FROM_EMAIL=no-reply@xxx.com
```

---

## 六、部署信息

### 6.1 线上地址

- **后端服务**: https://xin-yousuo-shu.onrender.com

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

- [x] 邮箱验证码登录
- [x] 24题恋爱匹配问卷
- [x] 智能匹配算法
- [x] 匹配结果查看
- [x] 管理后台
- [x] 部署上线
- [x] 测试模式（无需真实邮件）
- [x] 恋爱类型测试服务

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

# 启动并清空数据库（模拟线上环境）
npm run dev:clean

# 访问
http://localhost:3000
```

### 7.4 测试账号

| 角色 | 邮箱 | 说明 |
|------|------|------|
| 普通用户 | test@shu.edu.cn | 任意 @shu.edu.cn 邮箱 |
| 管理员 | admin@shu.edu.cn | 可访问管理后台 |

---

## 八、更新日志

### 2026-03-27 - V0.1.1
- 切换数据库从 SQLite 到 Supabase PostgreSQL
- 添加 pg 依赖
- 更新 database.js 适配异步 PostgreSQL
- 管理端手动匹配改为 POST + CSRF
- 修复 matchService 与异步 PostgreSQL 封装的调用链
- 添加恋爱类型测试服务（LoveType16）
- 使用签名 cookie 实现测试用户持久登录

### 2026-03-28
- **管理后台重构**：Tab 切换布局（仪表盘、用户管理、匹配管理）
- 仪表盘：统计卡片（总用户、已验证、已填问卷、本周匹配）
- 用户管理：增强版列表 + 搜索 + 用户详情弹窗
- 匹配管理：搜索式手动配对 + 本周匹配记录
- **开发者工具增强**：支持输入任意邮箱前缀快速登录
- 新增 API：`/dev/login/:prefix`（开发环境快速登录）
- 新增 API：`/admin/user/:id`（获取用户详情）
- 新增 API：`/admin/pair`（手动配对）
- 优化登录页邮箱输入（固定 @shu.edu.cn 后缀）
- 首页导航栏添加管理入口（仅管理员可见）
- 修复 PostgreSQL 字段名大小写问题

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