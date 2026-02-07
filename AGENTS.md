# AGENTS.md

This document defines how agents should work in the **AI 实践记录** project.

This is a content-first project managed as an engineering system.
Agents must follow a strict workflow-first approach.

---

## Project Purpose

This repository manages the writing, iteration, and publishing workflow
for the公众号 **AI 实践记录**.

Core principles:
- Practice-first, not theory-first
- Process > polished conclusions
- Real usage, real constraints, real failures
- Output-driven learning

Agents are collaborators, not autonomous authors.

---

## Global Rules (Must Follow)

1. **Never start writing directly**
   - Always understand context first
   - Always propose a plan before execution

2. **Work in small, reviewable steps**
   - Each task must produce a concrete artifact
   - Stop after each step for review if required

3. **Respect the repository structure**
   - Do not invent new folders casually
   - Reuse existing templates and conventions

4. **Follow file naming conventions**
   - All filenames MUST use English (see `NAMING_CONVENTIONS.md`)
   - Use lowercase letters with hyphens to separate words
   - Never use Chinese characters in filenames
   - Filenames do **not** require confirmation before creating (use sensible defaults).

5. **No authoritative tone**
   - This project does NOT present the author as an expert
   - Writing must stay practical, reflective, and honest

6. **Assume the human is the final decision-maker**
   - Outline direction / topic choice requires confirmation (always).
   - For other low-stakes questions (filenames, minor wording, number of images, etc.):
     - Ask once.
     - If there is no reply within **10 minutes**, proceed with a sensible default and clearly log what was assumed.

7. **Always deliver outputs to the human**
   - Any generated file (drafts, images, summaries, etc.) must be sent to the user directly in addition to saving locally.
   - If multiple files are produced, send a compact bundle (or the key file + a list) and ask whether to send the rest.

---

## Repository Structure (High Level)

- content/
  - ideas/        Raw ideas, fragments, notes
  - outlines/     Article outlines only
  - drafts/       Full article drafts
  - published/    Final published versions
- research/       References, background material
- data/           Performance data and review notes
- skills/         Reusable agent workflows (skills)
- templates/      Writing and review templates

Agents must understand this structure before acting.

---

## Local Skills

- Project-specific skills live in `.claude/skills/`; load a skill only when the task needs it and follow its `SKILL.md`.
- Common options: `baoyu-cover-image`, `baoyu-danger-gemini-web`, `baoyu-post-to-wechat`, `draft-write`, `outline-first`, `polish-style`, `publish-pac`, `research-topic`, `write-article`.

---

## Standard Article Workflow

Agents should follow this default sequence unless instructed otherwise:

### 1. Context Intake
- Read `README.md`
- Read `NAMING_CONVENTIONS.md`
- Read latest 2–3 files in `content/published/`
- Identify target column/series if specified

### 2. Planning Phase
- Propose:
  - Target audience
  - Core question of the article
  - 2–3 outline options with tradeoffs
- WAIT for confirmation

### 3. Execution Phase
- Choose English filenames following `NAMING_CONVENTIONS.md` (no need to ask for confirmation)
- Break work into small tasks:
  - Outline file → `content/outlines/<english-slug>.md`
  - Draft file → `content/drafts/<english-slug>.md`
- After each task:
  - Summarize what was done
  - Ask whether to continue

### 4. Review & Check
- Self-check for:
  - Logical flow
  - Redundancy
  - Overconfident claims
  - Missing concrete examples

---

## Writing Style Guidelines

Agents must follow these style constraints:

- Clear, restrained, non-hype tone
- Prefer concrete experience over abstraction
- Short to medium paragraphs
- No exaggerated claims about AI capability
- Use first-person perspective when appropriate
- Avoid tutorial-style imperatives

---

## Common Failure Modes to Avoid

- Jumping straight to conclusions
- Writing as an “AI expert”
- Over-structuring too early
- Long theoretical explanations without practice

If unsure, stop and ask.

---

## Agent Success Criteria

An agent is successful when:
- The human can easily review or modify the output
- The work fits naturally into the existing project system
- The result reduces future cognitive or operational load

This project values **consistency and clarity over speed**.
