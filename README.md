# AI 实践记录

*Real World AI Log*

**用大模型，做真实的事。**
*Using large models to do real things.*

---

这是一个把公众号写作，当作「可工程化项目」来管理的实践仓库。

这里不追热点、不讲宏大叙事，
而是记录我如何在真实工作和创作中使用 AI，
并把这些过程沉淀为可复用的方法、流程和判断。

This repository treats writing as an engineering system:
process-first, practice-first, and grounded in real constraints.

---

## 这个项目是什么｜What This Project Is

这是公众号 **「AI 实践记录」** 的本地工作区（英文名：*Real World AI Log*）。

目标不是“写得快”，而是：

* 用输出驱动学习
* 用 agent 管理复杂但重复的认知流程
* 把零散经验沉淀成系统能力
* 允许失败，但不允许模糊

This project exists to:

* Learn through output
* Use agents to manage repeatable thinking workflows
* Turn personal experience into reusable systems
* Allow failure, but not vagueness

---

## 为什么用 Agent 管理写作｜Why Agents

在这个项目里，我把写作当成一种「知识型工程」：

* 有上下文
* 有约束
* 有流程
* 有复盘

Agent 的作用不是替我写文章，而是：

* 约束流程（workflow enforcement）
* 减少重复决策（reduce cognitive overhead）
* 放大我已经形成的工作方法
* 把注意力留给关键判断

Agents are collaborators, not autonomous authors.

---

## 核心原则｜Core Principles

* **实践优先**：只写自己真正用过的东西
* **过程可见**：记录决策、犹豫和修正
* **小步迭代**：每一篇文章都是一次实验
* **人机协作**：AI 执行，人负责判断

---

## 项目结构说明｜Repository Structure

```
content/
  ideas/        灵感、碎片想法
  outlines/     文章大纲
  drafts/       初稿
  published/    已发布文章

research/
  背景资料、引用、外部材料

data/
  阅读量、反馈、复盘记录

skills/
  可复用的 agent 工作流

templates/
  文章模板、复盘模板
```

All outputs are versioned. Nothing is ephemeral.

**文件命名规范**: 所有生成的文件名必须使用英文，详见 [`NAMING_CONVENTIONS.md`](./NAMING_CONVENTIONS.md)。
**File naming**: All generated filenames MUST use English. See [`NAMING_CONVENTIONS.md`](./NAMING_CONVENTIONS.md).

---

## 写作流程（简化版）｜Writing Workflow

1. 想法进入 `content/ideas/`
2. Agent 生成多个大纲方案
3. 人确认方向
4. Agent 拆任务并生成初稿
5. 人工修改与判断
6. 发布后进入 `published/`
7. 数据进入 `data/`，用于复盘

---

## 当前重点方向｜Current Focus

* Coding Agent 实践记录
* Skills / Workflow 的持续迭代
* Agent 在真实项目中的边界
* 写作系统本身的演进

---

## 不做什么｜What This Is Not

* 不做 AI 新闻整理
* 不写“万能 Prompt”
* 不假装已经有标准答案
* 不把实验包装成结论

---

## 写给未来的自己｜Note to Future Self

如果你在未来回看这个仓库，请记住：

这个项目存在的意义，
不是证明你多懂 AI，
而是记录你如何一步步把 AI 用进真实世界。

慢一点，但是真的。
