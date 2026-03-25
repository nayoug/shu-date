# 上传GitHub指南

## 方法1：使用GitHub CLI（推荐）

1. **安装 GitHub CLI**
   下载: https://github.com/cli/cli/releases

2. **登录GitHub**
   ```bash
   gh auth login
   ```
   按照提示完成登录

3. **创建仓库并推送**
   ```bash
   cd SHUDATE
   gh repo create xin-yousuo-shu --public --source=. --push
   ```

---

## 方法2：手动操作

1. 打开 https://github.com/new
2. 创建新仓库，命名为 `xin-yousuo-shu`
3. 不勾选 "Add a README file"
4. 点击 "Create repository"
5. 运行以下命令：

```bash
cd SHUDATE
git remote add origin https://github.com/你的用户名/xin-yousuo-shu.git
git branch -M main
git push -u origin main
```

---

## 仓库已初始化

本地Git仓库已创建，commit已完成。你只需要选择上述方法之一上传即可。