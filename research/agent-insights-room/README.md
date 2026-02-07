# Agent Insights Room — research assets

This directory stores research artifacts for the "洞察室" series.

## Tavily quick research

```bash
# Ensure env is present
export TAVILY_API_KEY=... 

# Run research for a tool/topic
node scripts/agent-insights-research.mjs --topic openclaw

# Output:
# research/agent-insights-room/openclaw/
#   - tavily-results.json
#   - tavily-digest.md
```

Notes:
- The script uses the local skill at `/home/fei/clawd/skills/tavily-search`.
- It only collects links/snippets; writing decisions still require human judgment.
