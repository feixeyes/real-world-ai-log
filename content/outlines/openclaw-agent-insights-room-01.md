# OpenClaw 洞察室（1）：把个人助理做成“可编排系统”

## One-line pitch
以 OpenClaw 为例，拆解一个优秀 agent 系统如何把“聊天”变成“可编排的工作流”：通道接入、会话路由、工具权限、定时任务、记忆与可审计性。

## Reader
- 正在把 agent 用进日常工作的人
- 对“为什么它能跑得稳/能自动化”更感兴趣，而不是产品评测

## What we will deliver
- 3–5 个可复用的设计模式
- 1 个我们在 real-world-ai-log 里能复现实验的小练习

---

## Outline

### 0) 开场：为什么要做“洞察室”系列
- 不是评测：我们研究的是“可借鉴的设计”
- 观察维度：提示词/记忆/架构/安全边界/工作流自动化

### 1) OpenClaw 的核心定位：它不是一个 bot，而是一个 runtime
- 把“对话”当入口，把“工具/事件/会话”当系统边界
- 关键关键词：gateway、channels、sessions、tools、cron、memory

### 2) 交互设计：把需求说清楚的最小闭环
- system event / user message 的区别（提醒 vs 任务）
- “小步可审阅”的默认节奏：先计划、再执行、再交付 artifact
- 我们在项目里的约束如何落到系统里（比如：outline 必须确认）

### 3) 会话与路由：为什么它能同时处理 Discord/WhatsApp 而不乱
- channel → session 的映射思路
- “把回复发回原通道”的确定性
- group/dm 策略（allowlist/pairing/disabled）带来的安全性

### 4) 工具系统：能力来自工具边界，而不是模型“更聪明”
- exec / browser / web_fetch / web_search / message / cron 的角色
- 工具权限与审批（approvals）如何减少误操作
- 一个很实用的经验：把高风险动作显式标出来

### 5) 定时任务（cron）：从“提醒”到“自动交付”的关键差异
- 我们踩过的坑：07:00 只发 systemEvent ≠ 自动生成并发送内容
- 正确做法：isolated agentTurn + deliver 到目标通道
- 设计模式：
  - “生成（compute）”与“投递（deliver）”绑在同一个 job 里
  - 失败要可见（cookie 失效要明确提示）

### 6) 记忆（memory）：不是越多越好，而是“可检索 + 可控”
- 长期记忆（MEMORY.md） vs 当日记录（memory/YYYY-MM-DD.md）
- 什么时候写入、写什么、怎么避免泄漏（主会话 vs 群聊）

### 7) 我们能借鉴的 3–5 条设计模式（本篇结论）
候选：
- 模式 1：把提醒变成可执行事件（systemEvent）
- 模式 2：把自动化做成 cron job 的“自包含交付”
- 模式 3：通道/会话分离，回复路由确定
- 模式 4：工具边界 + 审批减少事故
- 模式 5：记忆分层（长期/每日）+ 明确写入规则

### 8) 一个可复现实验（real-world-ai-log）
- 做一个最小自动化：
  - 07:00 抓 X 50 条 → 生成 4–6 选题 → 自动发 WhatsApp
- 记录三项指标：
  - 准时性（是否按时到）
  - 稳定性（失败原因是否可见）
  - 可维护性（我们改一次需求需要动几处）

### 9) 结尾：下一期写什么
- Cursor / Gemini CLI / OpenCode 的“同一维度对照”

---

## Notes / TODO for draft
- 需要补：OpenClaw 的几个关键概念用最少术语解释清楚
- 需要补：一段“我们这次实际踩坑”的小故事（cron 提醒 vs 自动交付）
