# 心有所SHU - 项目规格文档

## 1. 项目概述

- **项目名称**: 心有所SHU
- **项目类型**: 校园交友匹配网站 (Web 应用)
- **核心功能**: 通过 24 题问卷计算推荐匹配，并支持管理员手动生成当周配对与邮件通知
- **目标用户**: 上海大学在校学生
- **当前版本**: V0.1.1

## 2. 技术栈

- **后端**: Node.js + Express
- **前端**: EJS 服务端模板
- **数据库**: PostgreSQL（兼容 Supabase），通过 `pg` 和 `DATABASE_URL` 连接
- **会话**: express-session
- **邮件**: Resend

## 3. 功能列表

### 3.1 登录与会话
- [x] 仅接受 `@shu.edu.cn` 邮箱
- [x] 发送一次性登录链接
- [x] 首次登录时自动创建用户记录
- [x] 登录后建立 Session
- [x] 支持登出

### 3.2 用户问卷
- [x] 24 题恋爱匹配问卷
- [x] 支持编辑已提交问卷
- [x] 收集性别、年级、校区、家乡、兴趣爱好、恋爱观念、生活习惯等字段

### 3.3 匹配能力
- [x] 基于问卷偏好进行候选过滤
- [x] 基于兴趣爱好、生活习惯、恋爱观念进行综合评分
- [x] 用户可查看推荐匹配列表
- [x] 管理员可手动生成当周配对记录

### 3.4 邮件通知
- [x] 发送登录链接邮件
- [x] 管理员手动触发匹配后发送匹配通知

### 3.5 管理后台
- [x] 查看注册用户列表
- [x] 查看用户是否已填写问卷
- [x] 手动触发匹配

## 4. 数据库设计

### 4.1 users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| email | TEXT | 学校邮箱，唯一 |
| name | TEXT | 昵称/姓名 |
| verified | INTEGER | 是否验证（0/1） |
| login_code | TEXT | 一次性登录令牌 |
| login_code_expire | TIMESTAMP | 登录令牌过期时间 |
| created_at | TIMESTAMP | 创建时间 |

### 4.2 profiles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 外键，唯一 |
| gender | TEXT | 性别 |
| preferred_gender | TEXT | 期望性别 |
| purpose | TEXT | 交友目的 |
| my_grade | TEXT | 我的年级 |
| preferred_grade | TEXT | 期望年级范围 |
| campus | TEXT | 所在校区 |
| cross_campus | TEXT | 跨校区接受度 |
| height | TEXT | 身高范围 |
| preferred_height | TEXT | 期望身高范围 |
| hometown | TEXT | 家乡 |
| preferred_hometown | TEXT | 期望家乡 |
| core_traits | TEXT | 核心特质（多选，逗号分隔） |
| long_distance | TEXT | 异地恋接受度 |
| communication | TEXT | 沟通频率偏好 |
| spending | TEXT | 消费观念 |
| cohabitation | TEXT | 婚前同居态度 |
| marriage_plan | TEXT | 婚姻规划 |
| relationship_style | TEXT | 相处模式 |
| sleep_schedule | TEXT | 作息习惯 |
| smoke_alcohol | TEXT | 烟酒态度 |
| pet | TEXT | 宠物态度 |
| social_public | TEXT | 恋爱公开态度 |
| social_boundary | TEXT | 社交边界 |
| interests | TEXT | 兴趣爱好（逗号分隔） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.3 matches 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id_1 | INTEGER | 用户 1 |
| user_id_2 | INTEGER | 用户 2 |
| score | REAL | 匹配分数 |
| matched_at | TIMESTAMP | 匹配时间 |
| week_number | INTEGER | 周序号 |

## 5. 页面与路由

### 5.1 首页 (`/`)
- 展示项目简介
- 未登录用户可跳转登录
- 已登录用户可查看问卷与匹配入口

### 5.2 登录页 (`/login`)
- 输入 `@shu.edu.cn` 邮箱
- 发送一次性登录链接

### 5.3 登录验证 (`/login/verify/:code`)
- 校验登录令牌
- 登录成功后建立 Session

### 5.4 问卷页 (`/profile`)
- 填写或更新 24 题问卷
- 支持多选字段提交

### 5.5 匹配页 (`/matches`)
- 展示基于问卷计算的推荐列表
- 显示年级、性别、校区、兴趣爱好和匹配度

### 5.6 管理页 (`/admin`)
- 查看用户列表
- 查看用户是否已填写问卷
- 手动触发本周匹配

### 5.7 接口
- `GET /api/matches`: 返回完整匹配列表
- `GET /api/match/top`: 返回前 N 个匹配结果
- `POST /admin/match`: 管理员触发本周匹配

## 6. 环境变量

核心环境变量：
- `DATABASE_URL`: PostgreSQL 连接串
- `SESSION_SECRET`: Session 加密密钥（生产环境必填）
- `BASE_URL`: 站点基础地址

邮件相关环境变量：
- `RESEND_API_KEY`: Resend API Key
- `FROM_EMAIL`: 发件人地址

## 7. 验收标准

- [ ] 可以发送并使用 `@shu.edu.cn` 邮箱登录链接
- [ ] 首次登录用户会被自动创建
- [ ] 可以填写和修改 24 题问卷
- [ ] 可以查看匹配结果页面
- [ ] 管理后台可以查看用户和问卷完成情况
- [ ] 管理后台手动触发后可生成匹配记录并发送通知

## 8. 当前已知限制

- 每周匹配仍需管理员手动触发
- 用户端展示的是推荐列表，不是完整资料页
- 本地开发和测试数据脚本都依赖正确配置 `DATABASE_URL`
