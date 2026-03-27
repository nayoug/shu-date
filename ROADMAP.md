# 心有所SHU - 项目路线图

> 文档更新时间: 2026-03-26

## 1. 项目概述

| 项目 | 内容 |
|------|------|
| **项目名称** | 心有所SHU |
| **类型** | 上海大学校园恋爱匹配平台 |
| **核心功能** | 通过24题恋爱匹配问卷，每周为同学推荐匹配的用户 |
| **目标用户** | 上海大学在校学生 (@shu.edu.cn) |
| **当前版本** | V0.1.1 |
| **在线地址** | https://xin-yousuo-shu.onrender.com |

---

## 2. 技术栈

### 2.1 后端
- **运行时**: Node.js
- **框架**: Express.js
- **模板引擎**: EJS
- **会话**: express-session

### 2.2 数据库
- **当前**: Supabase PostgreSQL (云数据库)
- **驱动**: pg
- **连接**: `DATABASE_URL` 环境变量

### 2.3 邮件服务
- **当前**: Resend (API方式)

---

## 3. 功能列表

### 3.1 已完成 ✅

#### 用户系统
- [x] 邮箱登录链接 (仅限 @shu.edu.cn)
- [x] 自动注册新用户
- [x] Session会话管理
- [x] 登出功能

#### 问卷系统
- [x] 24题恋爱匹配问卷
  - 基础信息 (9题): 性别、期望性别、交友目的、年级、期望年级、校区、跨校区态度、身高、身高偏好
  - 择偶偏好 (4题): 家乡、期望家乡、核心特质、异地恋态度
  - 恋爱观念 (5题): 沟通频率、消费观念、婚前同居态度、婚姻规划、相处模式
  - 生活习惯 (6题): 作息习惯、烟酒态度、宠物态度、社交公开度、社交边界、兴趣爱好
- [x] 问卷填写与编辑

#### 匹配系统
- [x] 智能匹配算法 (综合评分)
- [x] 匹配过滤条件 (性别、年级、身高、校区)
- [x] 相似度计算 (Jaccard + 选项匹配)
- [x] 匹配结果查看
- [x] 手动触发匹配后发送结果邮件

#### 管理后台
- [x] 查看所有用户
- [x] 查看问卷完成情况
- [x] 手动触发匹配

### 3.2 开发中 🔄

- [ ] 自动每周匹配任务
- [ ] 用户画像展示优化

### 3.3 待办 📋

- [ ] 用户头像上传
- [ ] 匹配详情页优化
- [ ] 微信小程序适配
- [ ] 数据统计后台

---

## 4. 数据库设计

### 4.1 users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| email | TEXT | 学校邮箱 (唯一) |
| name | TEXT | 姓名 |
| verified | INTEGER | 是否验证 (0/1) |
| login_code | TEXT | 一次性登录令牌 |
| login_code_expire | TIMESTAMP | 登录令牌过期时间 |
| created_at | TIMESTAMP | 创建时间 |

### 4.2 profiles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 外键 (users.id) |
| gender | TEXT | 性别 |
| preferred_gender | TEXT | 期望性别 |
| purpose | TEXT | 交友目的 |
| my_grade | TEXT | 年级 |
| preferred_grade | TEXT | 期望年级 |
| campus | TEXT | 所在校区 |
| cross_campus | TEXT | 跨校区态度 |
| height | TEXT | 身高 |
| preferred_height | TEXT | 身高偏好 |
| hometown | TEXT | 家乡 |
| preferred_hometown | TEXT | 期望家乡 |
| core_traits | TEXT | 核心特质 |
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
| interests | TEXT | 兴趣爱好 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 4.3 matches 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id_1 | INTEGER | 用户1 |
| user_id_2 | INTEGER | 用户2 |
| score | REAL | 匹配分数 |
| matched_at | TIMESTAMP | 匹配时间 |
| week_number | INTEGER | 第几周 |

---

## 5. API 路由

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 首页 | 公开 |
| GET | /login | 登录页 | 公开 |
| POST | /login | 发送登录链接 | 公开 |
| GET | /login/verify/:code | 登录链接验证 | 公开 |
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

## 6. 匹配算法

### 6.1 综合评分权重
- 兴趣爱好: 30%
- 生活习惯: 30%
- 恋爱观念: 40%

### 6.2 过滤条件
1. 性别偏好匹配
2. 年级偏好匹配 (年级差 ≤ 3)
3. 身高偏好匹配
4. 校区接受度

### 6.3 相似度计算
- **兴趣爱好**: Jaccard相似度 (交集/并集)
- **生活习惯**: 选项匹配度
- **恋爱观念**: 选项匹配度

---

## 7. 部署信息

| 环境 | 地址 | 状态 |
|------|------|------|
| 生产环境 | https://xin-yousuo-shu.onrender.com | 正常运行 |
| 数据库 | Supabase (PostgreSQL) | 正常运行 |

> ⚠️ Render 免费版会自动休眠，首次访问可能需要等待几秒启动

---

## 8. 更新日志

### 2026-03-26
- 切换数据库从 SQLite 到 Supabase PostgreSQL
- 添加 pg 依赖
- 更新 database.js 适配异步 PostgreSQL
- 管理端手动匹配改为 POST + CSRF
- 修复 matchService 与异步 PostgreSQL 封装的调用链
- 对齐文档与测试数据脚本到 PostgreSQL 方案

### 2026-03-25(历史版本)
- 初始版本 V0.1
- 实现邮箱登录流程
- 实现24题问卷
- 实现匹配算法
- 部署到 Render

---

## 9. 待完成任务

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

*此文档将持续更新*
