# 心有所SHU - 项目规格文档

## 1. 项目概述

- **项目名称**: 心有所SHU
- **项目类型**: 校园交友匹配网站 (Web应用)
- **核心功能**: 通过问卷匹配，每周通过邮件为上海大学同学推荐可能聊得来的同学
- **目标用户**: 上海大学在校学生
- **版本**: V0.1 (最小可用版本)

## 2. 技术栈

- **后端**: Node.js + Express
- **前端**: HTML + CSS + Vanilla JS (单页面应用)
- **数据库**: Supabase PostgreSQL (云数据库)
- **邮件**: Nodemailer (支持SMTP)
- **模板引擎**: EJS

## 3. 功能列表

### 3.1 用户注册与验证
- [x] 仅接受 @shu.edu.cn 邮箱注册
- [x] 发送验证邮件（含验证码）
- [x] 邮箱验证通过后激活账号

### 3.2 用户问卷
- [x] 收集：姓名、年级、专业、爱好、性格标签、理想型描述
- [x] 可编辑已填写的问卷

### 3.3 匹配算法 (V0.1简化版)
- [x] 每周随机匹配未匹配过的用户
- [x] 确保不重复匹配同一人

### 3.4 邮件通知
- [x] 验证邮件
- [x] 每周匹配结果邮件

### 3.5 管理后台 (简化)
- [x] 查看注册用户列表
- [x] 手动触发每周匹配

## 4. 数据库设计

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| email | TEXT | 学校邮箱，唯一 |
| name | TEXT | 姓名 |
| verified | INTEGER | 是否验证(0/1) |
| login_code | TEXT | 登录验证码 |
| login_code_expire | TIMESTAMP | 验证码过期时间 |
| created_at | TIMESTAMP | 注册时间 |

### profiles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 外键 |
| gender | TEXT | 性别 |
| preferred_gender | TEXT | 期望性别 |
| purpose | TEXT | 交友目的 |
| my_grade | TEXT | 我的年级 |
| preferred_grade | TEXT | 期望年级 |
| campus | TEXT | 校区 |
| cross_campus | TEXT | 跨校区态度 |
| height | TEXT | 身高 |
| preferred_height | TEXT | 期望身高 |
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
| updated_at | TIMESTAMP | 更新时间 |

### matches 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id_1 | INTEGER | 用户1 |
| user_id_2 | INTEGER | 用户2 |
| matched_at | DATETIME | 匹配时间 |
| week_number | INTEGER | 第几周 |

## 5. 页面设计

### 5.1 首页 (/)
- 简洁的欢迎语
- 登录/注册按钮
- 已登录用户显示匹配状态

### 5.2 注册页 (/register)
- 邮箱输入框（限制 @shu.edu.cn）
- 密码输入框
- 提交后发送验证邮件

### 5.3 验证页 (/verify/:code)
- 显示验证成功/失败

### 5.4 登录页 (/login)
- 邮箱 + 密码登录

### 5.5 问卷页 (/profile)
- 填写/编辑个人资料
- 年级、专业、爱好、性格标签、理想型

### 5.6 匹配结果页 (/matches)
- 查看本周匹配结果
- 显示对方部分信息（需双方都完成问卷）

### 5.7 管理页 (/admin)
- 用户列表
- 手动触发匹配按钮

## 6. 邮件配置

需要配置以下环境变量：
- SMTP_HOST: 邮件服务器地址
- SMTP_PORT: 端口
- SMTP_USER: 发件邮箱
- SMTP_PASS: 发件密码
- FROM_EMAIL: 发件人地址

## 7. 验收标准

- [ ] 可以用 @shu.edu.cn 邮箱注册
- [ ] 可以收到并完成邮箱验证
- [ ] 可以填写和修改个人问卷
- [ ] 管理后台可以看到用户列表
- [ ] 手动触发可以生成匹配结果
- [ ] 可以查看匹配结果页面

## 8. V0.1 已知限制

- 匹配算法为简化版（随机匹配，不考虑兴趣相投）
- 无前端表单验证美化
- 无响应式设计优化
- 每周匹配需要手动触发