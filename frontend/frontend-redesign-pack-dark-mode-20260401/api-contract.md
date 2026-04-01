# API Contract Draft

> 这是前端重写阶段使用的契约草案，不代表现有后端已经完整实现。

## GET /api/me
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "user@shu.edu.cn",
    "nickname": "轨霜",
    "hasProfile": true,
    "verified": true
  }
}
```

## GET /api/profile
```json
{
  "success": true,
  "data": {
    "gender": "男",
    "preferred_gender": "男",
    "my_grade": "大二",
    "campus": "宝山",
    "accepted_campus": ["宝山", "嘉定"],
    "interests": ["游戏", "电影", "AI"],
    "lovetype_code": "INFP"
  }
}
```

## POST /api/profile
```json
{
  "success": true,
  "message": "问卷已保存"
}
```

## GET /api/matches/current
```json
{
  "success": true,
  "data": {
    "weekNumber": 14,
    "score": 0.86,
    "partner": {
      "nickname": "某同学",
      "my_grade": "大三",
      "campus": "宝山",
      "interests": ["音乐", "阅读"],
      "lovetype_code": "ENFJ"
    }
  }
}
```

## GET /api/notifications
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "match",
      "title": "本周匹配已生成",
      "content": "你可以前往匹配页查看本周正式匹配对象。",
      "createdAt": "2026-04-01T10:00:00Z",
      "read": false
    },
    {
      "id": 2,
      "type": "system",
      "title": "系统维护通知",
      "content": "本周六凌晨将进行短时维护。",
      "createdAt": "2026-03-30T08:00:00Z",
      "read": true
    }
  ]
}
```

## POST /api/settings/password
Request
```json
{
  "currentPassword": "old-pass",
  "newPassword": "new-pass",
  "confirmPassword": "new-pass"
}
```

Response
```json
{
  "success": true,
  "message": "密码修改成功"
}
```

## POST /api/settings/delete
Request
```json
{
  "email": "user@shu.edu.cn",
  "password": "your-password"
}
```

Response
```json
{
  "success": true,
  "message": "账号已注销"
}
```
