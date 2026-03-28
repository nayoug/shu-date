# 心有所SHU - 内测版

上海大学校园恋爱匹配平台 V0.1.1

## 访问地址

**后端服务**: https://xin-yousuo-shu.onrender.com

> ⚠️ 注意：Render 免费版会自动休眠，首次访问可能需要等待几秒启动

---

## 内测功能

### 已上线
- ✅ 邮箱登录链接 (@shu.edu.cn)
- ✅ 恋爱匹配问卷
- ✅ 16种恋爱人格测试与匹配
- ✅ 智能匹配算法
- ✅ 匹配结果查看
- ✅ 管理后台

---

## 快速开始

1. 打开 https://shudate.xyz
2. 输入 @shu.edu.cn 邮箱，点击发送登录链接
> ⚠️ 注意：由于校内网关限制，邮件可能会有 1-2 分钟延迟，请耐心等待
3. 邮箱中点击登录链接完成登录
4. 填写问卷

---

## 问卷说明

**24道选择题，分为4个模块：**

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

---

## 匹配算法

综合评分 = 兴趣爱好30% + 生活习惯30% + 恋爱观念40%

### 过滤条件
- 性别偏好匹配
- 年级偏好匹配
- 身高偏好匹配
- 校区接受度

### 相似度计算
- **兴趣爱好**: Jaccard相似度
- **生活习惯**: 选项匹配度
- **恋爱观念**: 选项匹配度

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | Supabase PostgreSQL |
| 前端 | EJS模板 |
| 邮件 | Resend |

---

## 本地开发

1. 安装依赖：`npm install`
2. 配置 `.env`，至少包含：

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
SESSION_SECRET=replace-this-in-production
BASE_URL=http://localhost:3000
```

3. 启动服务：`npm start`
4. 生成演示数据：`npm run seed:test-data`

> `generateTestData.js` 会直接写入 `DATABASE_URL` 指向的 PostgreSQL 数据库，请不要对生产库执行。

---

## 注意事项

1. **数据库**: 使用 Supabase PostgreSQL，通过 `DATABASE_URL` 连接
2. **邮件**: 当前登录邮件与匹配通知均通过 Resend 发送
3. **休眠**: Render免费版30分钟无访问会休眠

---

## 反馈渠道

如有问题或建议，请联系管理员：guoy@shu.edu.cn。

---

**Made with ❤️ for SHU Students**
