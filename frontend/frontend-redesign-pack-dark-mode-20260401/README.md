# shu-date Frontend Redesign Pack

目标：为 `shu-date` 重写一套**移动端优先**的新前端原型，**不要读取旧项目源码**，也**不要假设后端内部实现**。

这个包只提供：
- 页面清单
- 交互/设计约束
- 接口契约草案
- mock 数据
- 给 AI 的任务说明

## 设计原则

1. 只重写前端，不碰数据库和后端逻辑
2. 不依赖 hover 才能完成关键操作
3. 移动端优先，再兼容平板/桌面端
4. 允许先使用 mock data 做静态原型
5. 前端结构要能后续接回现有 Express/EJS 或单独 SPA

## 优先解决的问题

- 导航信息架构混乱
- 用户菜单在手机触屏场景下可达性差
- 设置页、通知页、匹配页风格不统一
- 旧模板内联样式过多，难维护
- 页面间状态和空态表达不一致

## 建议输出物

1. 一套可运行前端原型（HTML/CSS/JS、React、Vue 均可）
2. 页面/组件说明文档
3. 响应式说明（手机 / 平板 / 桌面）
4. 如何接入现有后端的迁移建议

## 当前结构

- 样式入口仍是 `/assets/styles.css`，内部拆为 `assets/css/base.css` 和 `assets/css/theme.css`
- 脚本入口仍是 `/assets/app.js`，内部拆为 `assets/js/data.js`、`assets/js/shell.js` 和 `assets/js/pages/*`

## 输入文件说明

- `routes.md`：页面和模块说明
- `ui-rules.md`：视觉与交互约束
- `api-contract.md`：后端接口契约草案
- `mock/*.json`：假数据
- `prompt.md`：喂给 AI 的主提示词

## 禁止事项

- 不要读取旧仓库源码后直接“修修补补”
- 不要假设不存在的后台能力
- 不要把 hover-only 菜单继续保留为核心导航方案
- 不要在没有必要的情况下引入重型状态管理或复杂动画

