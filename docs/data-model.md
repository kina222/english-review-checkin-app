# 数据模型

## 设计原则

- 本地存储
- 字段少
- 易备份
- 易恢复
- 不为第一版未做功能预留复杂结构

## 核心对象

### 学习内容 `ReviewItem`

用于保存一条英语内容。

```json
{
  "id": "string",
  "english": "string",
  "chinese": "string",
  "createdAt": "string",
  "nextReviewAt": "string",
  "reviewCount": 0,
  "archived": false
}
```

字段说明：

- `id`：本地唯一 ID
- `english`：英文内容
- `chinese`：中文内容
- `createdAt`：创建时间
- `nextReviewAt`：下一次复习日期
- `reviewCount`：已完成复习次数
- `archived`：是否归档，第一版可以先不提供入口

### 复习记录 `ReviewLog`

用于保存每次复习结果。

```json
{
  "id": "string",
  "itemId": "string",
  "reviewedAt": "string",
  "promptSide": "english",
  "result": "familiar"
}
```

字段说明：

- `id`：本地唯一 ID
- `itemId`：对应的学习内容 ID
- `reviewedAt`：复习时间
- `promptSide`：本次先显示哪一侧，取值为 `english` 或 `chinese`
- `result`：用户反馈，取值为 `forgot`、`unclear`、`familiar`

### 每日打卡 `DailyCheckIn`

用于判断当天是否打卡成功。

```json
{
  "date": "string",
  "plannedCount": 0,
  "completedCount": 0,
  "forgotCount": 0,
  "unclearCount": 0,
  "familiarCount": 0,
  "completed": false
}
```

字段说明：

- `date`：日期，格式为 `YYYY-MM-DD`
- `plannedCount`：当天被选中的计划复习数量，最多 15 条
- `completedCount`：当天已完成复习数量
- `forgotCount`：忘了数量
- `unclearCount`：模糊数量
- `familiarCount`：熟了数量
- `completed`：是否完成当天被选中的复习任务

## 复习间隔

基础复习间隔使用天数表示：

```json
[3, 7, 15, 30]
```

第 30 天之后，每次间隔 30 天。

## 备份结构

一键导出的 `JSON` 建议结构：

```json
{
  "version": 1,
  "exportedAt": "string",
  "items": [],
  "reviewLogs": [],
  "dailyCheckIns": []
}
```

## 暂不加入的数据

第一版不加入以下字段：

- `tag`
- `source`
- `note`
- `audioUrl`
- `imageUrl`
- `userId`
- `cloudSyncId`
- `aiCorrection`
