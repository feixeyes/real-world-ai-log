# Series: Agent Insights Room

Working name (CN): **Agent 洞察室**

## Purpose
Research and learn from excellent agents (open-source and commercial)—e.g. OpenClaw, OpenCode, Gemini CLI, Cursor—then turn the reusable design choices into practical guidance for our own workflow.

This series is **not** a product review column. Each post must extract design patterns we can reuse.

## What we study (repeatable checklist)
Each article should cover (as applicable):

1) **Prompt / interaction pattern**
- How users specify goals and constraints
- How the tool asks clarifying questions and presents plans

2) **Memory / context management**
- What gets stored, what does not
- Retrieval strategy, context window hygiene
- How it avoids memory pollution

3) **Agent architecture**
- Sessions, routing, sub-agents
- Tool gating / safety boundaries
- Failure handling and recovery

4) **Workflow & automation**
- Scheduling, triggers, long-running jobs
- Logging, artifacts, auditability

5) **What we can borrow**
- 3–5 reusable patterns
- A small experiment we can run inside real-world-ai-log

## Style constraints
- Practice-first; no hype, no authoritative tone.
- Use concrete examples + artifacts.
- Every claim should be backed by: docs snippet, observed behavior, or a small reproducible test.

## Output format (recommended)
- 1-page summary
- 3–5 design takeaways
- 1 reproducible mini-experiment
