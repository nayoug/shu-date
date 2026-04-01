# Prompt for AI Frontend Rewrite

你将为一个校园匹配网站重写前端。

## 你的任务
基于本目录提供的页面清单、UI 约束、接口契约草案和 mock 数据，设计并实现一套新的前端原型。

## 重要限制
- 不要读取旧项目源码
- 不要依赖 hover-only 交互
- 不要假设后端已经具备未说明的接口能力
- 先完成静态原型 / mock 版，再给出接入真实后端的迁移建议

## 核心目标
1. 移动端优先
2. 导航结构清晰
3. 用户菜单在手机触屏可稳定使用
4. 设置页、通知页、匹配页风格统一
5. 表单、空状态、错误状态表达清晰

## 你应该输出
1. 可运行的前端原型
2. 组件/页面结构说明
3. 响应式设计说明
4. 与现有 Express/EJS 系统接回的迁移说明

## 优先页面
- /
- /login
- /profile
- /matches
- /settings
- /settings/password
- /settings/delete
- /notifications

## 设计提示
- 可以保留蓝白校园感
- 可以使用卡片布局
- 通知入口适合进入用户菜单或移动端抽屉，而不是依赖 hover 下拉
- 空通知页不能只有一句“暂无通知”，最好带解释和后续扩展位

## 输入文件
- `README.md`
- `routes.md`
- `ui-rules.md`
- `api-contract.md`
- `mock/notifications.json`
- `mock/profile.json`
