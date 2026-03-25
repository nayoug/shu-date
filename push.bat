@echo off
cd /d d:\HuaweiMoveData\Users\joyce\Desktop\SHUDATE
gh auth logout
gh auth login
gh repo create xin-yousuo-shu --public --source=. --push
pause