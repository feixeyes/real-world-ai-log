# Claude Code advanced tips: workflow, not prompts

> Working title (CN): Claude Code 高级技巧盘点：技巧不是提示词，是工作流

## One-line pitch
把“Claude Code 高级技巧”拆成可复用的 4 类（提示词/工具/流程/验收），并用一个可复现实验（ablation）找出最值钱的 3 条。

## Target reader
- 已经在用 Claude Code（或同类 agentic coding 工具）的人
- 痛点：能用但不稳、返工多、觉得“技巧很玄学”

## The core question
所谓“高级技巧”，到底哪些在提升模型能力，哪些其实是在提升**人类的组织方式与验收方式**？

## What this article is NOT
- 不是“万能提示词大全”
- 不是主观吹捧/排名
- 不用权威口吻；用可复现的工程实践说话

---

## Outline

### 0) 开场：你以为你在学提示词，其实你在学项目管理
- 一个真实场景：同一个任务，换个“工作流姿势”成功率暴涨
- 定义本文的“技巧”：可复用、可解释、可验收

### 1) 把技巧拆成 4 类：从玄学清单到可操作系统
> 用一张表/清单（不做表格也可）把技巧归类

#### 1.1 提示词类（少而关键）
- 写清楚“验收标准”（Definition of Done）比写长背景更重要
- 明确约束：不改 API、不引入依赖、不动公共接口
- “先问 3 个澄清问题” vs “先给我方案”什么时候用

#### 1.2 工具类（让 Claude Code 真正像工程师）
- 让它先读/搜：定位文件、grep、读测试、读 CI
- 让它跑：执行测试/format/lint，再提交 patch
- 让它写：变更摘要 + 风险点 + 回滚方式

#### 1.3 流程类（最容易被误当成提示词技巧）
- 任务拆分：从大任务 → 3 个可交付子任务
- 并行与分工（如果支持）：research / implement / test / review
- Checkpoint：每 15–30 分钟必须产出可验证 artifact

#### 1.4 验收类（决定你返工次数的那部分）
- “先写测试/场景”作为契约（单测/BDD 都行）
- 用 diff review 的姿势验收：改了什么、为什么、有什么副作用
- 失败处理：如何要求它回滚、如何让它写复盘

### 2) 10 条“高级技巧”清单（按 4 类组织）
- 每条格式统一：
  - 适用场景
  - 具体怎么做（可复制的提示模板/指令）
  - 常见误区（会导致它瞎改/跑偏的点）

> 这部分可以先列 10 条（后续可扩到 20 条，但先小步可审阅）。

### 3) 一个可复现的小实验：Ablation，找出“最值钱的 3 条”
- 为什么需要 ablation：否则都是“我感觉更好用”
- 实验设计（可落地到 real-world-ai-log）：
  - 选 1 个固定任务（建议：修一个 flaky test + 补 2 个测试）
  - 设定 baseline（只给目标，不给技巧）
  - 每次只加入 1 条技巧，跑 3 轮
  - 记录指标：
    - 首轮可运行率
    - 返工次数
    - 交互轮次
    - 最终测试通过率
    - 你花在“解释需求/纠错”的时间
- 输出：边际收益排序 + 适用条件

### 4) 你可以立刻照做的“推荐工作流”（一页 SOP）
- 开始前：目标 + DoD + 约束
- 执行中：read → plan → implement → run tests → summarize
- 结束时：变更摘要 + 风险点 + 回滚

### 5) 结尾：技巧的本质是把不确定性变成可验收的步骤
- 下集预告/延伸：
  - 单 agent vs agent teams
  - BDD 作为 AI coding 的验收协议

---

## Open questions (need your input later, but not blocking outline)
- 你现在主要用 Claude Code 做什么类型任务？（维护旧代码/写新功能/读代码/重构）
- 你更想用哪个 repo/任务做 ablation 实验？（我们可以选 real-world-ai-log 或一个更“典型工程”的 repo）
