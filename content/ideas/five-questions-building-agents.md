# Idea: Five Questions for Building Agents (with a real end-to-end example)

## One-line

Build an agent end-to-end (X → summary → WeChat draft) and extract the 5 questions you must answer to make an agent reliable and shippable.

## Why this matters (pain)

Many agents “can run” but aren’t usable: unclear intent, fuzzy boundaries, brittle workflows, messy context, and no feedback loop.

## Target readers

- Builders (engineers / product) who are starting to build practical agents
- People who have tried prompts/agents and felt it was “unstable / hard to control / hard to ship”

## The 5 questions (notes)

1) **Can it ask well?**
   - intent, inputs, boundaries, responsibilities, context
   - what to ask the user vs what to infer vs what to block

2) **What is the runtime loop?**
   - intent recognition → planning → action → verification → reflection
   - where to stop for human confirmation

3) **How does it manage context & memory?**
   - layers: project / session / long-term
   - grouping, compression, hardening (write to files), retention

4) **What can the model do (and not do) operationally?**
   - dynamic planning, tool selection, (maybe) dynamic tool generation
   - constraints: observability, failure modes, latency/cost

5) **What is the product shape?**
   - what is generated vs retrieved
   - what the user sees: outputs, citations, artifacts, checkpoints

## Example we will use

- Read X “For you” latest 20
- Summarize (1-minute version + detailed list)
- Push an article draft into WeChat Official Account draft box

## Expected artifact

- A practical checklist + a reusable workflow skeleton
- A “minimum viable agent” recipe: what to decide first, what to implement next

## Notes / constraints (project)

- Practice-first, non-hype tone
- Human-in-the-loop (AI executes; human decides key points)
- Filenames in English only
