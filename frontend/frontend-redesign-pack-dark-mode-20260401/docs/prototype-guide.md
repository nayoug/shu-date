# shu-date 校园恋爱平台前端原型说明

## 1. 原型包含什么

这套原型围绕校园恋爱匹配平台里优先级最高的 8 个页面展开：

- `/`
- `/login/`
- `/profile/`
- `/matches/`
- `/settings/`
- `/settings/password/`
- `/settings/delete/`
- `/notifications/`

实现形式是纯静态多页面：

- 样式入口：`/assets/styles.css`，内部拆为 `assets/css/base.css` 和 `assets/css/theme.css`
- 脚本入口：`/assets/app.js`，内部拆为 `assets/js/data.js`、`assets/js/shell.js` 和 `assets/js/pages/*`
- 视觉素材：`/assets/campus-night.svg`、`/assets/match-atlas.svg`

建议用任意静态服务器把仓库根目录作为站点根目录启动，这样可以直接访问这些路径。

## 2. 页面结构

### 首页 `/`
- 用整屏 Hero 直接说明产品和主要入口。
- 第二屏解释这次重排解决的问题。
- 第三屏讲清资料 -> 匹配 -> 通知的主路径。
- 最后一屏收口到登录和设置入口。

### 登录页 `/login/`
- 表单上方保留统一状态区。
- 用按钮切换默认、失败、未验证、重置成功四种展示状态。
- 注册和忘记密码保持文本入口，不依赖额外菜单。

### 资料页 `/profile/`
- 左侧是当前摘要和填写顺序。
- 右侧是一张连续问卷画布，包含基础信息、偏好、量表、LoveType 摘要。
- 保存时做前端校验，并在原型中直接刷新摘要。

### 匹配页 `/matches/`
- 预置四个状态：有正式结果、暂无匹配、未填问卷、未验证邮箱。
- 正式结果页重点展示匹配分数、对方信息、建议动作。
- 空态都带下一步按钮，而不是只显示一句提示。

### 设置体系 `/settings/*`
- `/settings/` 只做账户操作总入口。
- `/settings/password/` 独立承载密码校验逻辑。
- `/settings/delete/` 独立承载高风险操作和风险说明。

### 通知页 `/notifications/`
- 独立于用户菜单，保证手机端稳定可达。
- 支持按类型和未读过滤。
- 保留正常、空态、失败态三种演示场景。

## 3. 响应式策略

- `<= 480px`：移动端优先，顶部只保留品牌和菜单按钮，导航收进抽屉。
- `481px - 959px`：表单和信息区开始做双列，但仍保留轻量排版。
- `>= 960px`：显示完整主导航，首页 Hero 变成双栏，内页使用侧栏 + 主内容区。

额外处理点：

- 长邮箱和长按钮文案不会把布局撑坏。
- 所有关键入口都有明确文本，不依赖图标单独表达语义。
- 菜单按钮保留 `aria-expanded` / `aria-controls`。

## 4. 与现有 Express / EJS 的接回建议

### 最小接法
1. 把 `assets/styles.css` 和 `assets/app.js` 迁入现有静态资源目录。
2. 把现在每个页面里的主体内容拆成 EJS partial。
3. 保留当前脚本里的导航抽屉、状态切换和表单反馈逻辑。

### 数据替换顺序
1. 先用后端注入的 `window.__BOOTSTRAP__` 替换 `app.js` 里的 mock 常量。
2. 再把资料、匹配、通知分别替换为真实接口：
   - `GET /api/profile`
   - `GET /api/matches/current`
   - `GET /api/notifications`
3. 表单提交再接：
   - `POST /api/profile`
   - `POST /api/settings/password`
   - `POST /api/settings/delete`

### 推荐保留的前端约束
- 通知继续作为独立入口，不退回 hover-only 用户菜单。
- 登录、改密、资料保存继续使用统一状态区。
- 注销账号继续保留独立风险页，不和普通设置混排。
- 空态文案继续保留“原因 + 下一步”结构。

## 5. 后续可继续做的事

- 把页面公共骨架提成模板局部文件，减少重复 HTML，并继续统一平台语气。
- 给通知和匹配加入真实加载中状态。
- 给资料页量表部分换成真实问卷配置。
- 为移动端继续补一轮截图和手动验收。

