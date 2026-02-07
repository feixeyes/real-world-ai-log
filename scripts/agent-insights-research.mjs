import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    topic: null,
    outDir: null,
    n: 5,
    days: 7,
    deep: false,
    noNews: false,
    queriesFile: null,
    section: 'all', // all|docs|arch|prompt|ops|news
    topLinks: false,
    topLinksN: 10,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--topic' || a === '--tool') && argv[i + 1]) args.topic = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if ((a === '-n' || a === '--n') && argv[i + 1]) args.n = Number(argv[++i]);
    else if (a === '--days' && argv[i + 1]) args.days = Number(argv[++i]);
    else if (a === '--deep') args.deep = true;
    else if (a === '--no-news') args.noNews = true;
    else if (a === '--queries' && argv[i + 1]) args.queriesFile = argv[++i];
    else if (a === '--section' && argv[i + 1]) args.section = argv[++i];
    else if (a === '--top-links') args.topLinks = true;
    else if (a === '--top-links-n' && argv[i + 1]) args.topLinksN = Number(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Agent Insights research helper (Tavily).

Purpose:
  Quickly gather high-signal links + snippets for a "洞察室" post.
  Uses Tavily via /home/fei/clawd/skills/tavily-search.

Usage:
  node scripts/agent-insights-research.mjs --topic openclaw

Options:
  --out <dir>        Output directory (default: research/agent-insights-room/<topic>/)
  -n, --n <count>    Results per query (default: 5, max: 20)
  --deep             Deeper search (slower)
  --days <n>         News lookback days (default: 7)
  --no-news          Disable the news query batch
  --queries <file>   Custom queries file (one query per line; supports {topic})
  --section <name>   Run subset: all|docs|arch|prompt|ops|news
  --top-links        Also generate top-links.md (curated list)
  --top-links-n <n>  Max links in top-links.md (default: 10)

Env:
  Requires TAVILY_API_KEY in environment (OpenClaw env.vars works too).
`);
}

function safeSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function runTavilySearch(query, { n, deep, news, days }) {
  const baseDir = '/home/fei/clawd/skills/tavily-search';
  const script = path.join(baseDir, 'scripts/search.mjs');

  const args = [script, query, '-n', String(n)];
  if (deep) args.push('--deep');
  if (news) {
    args.push('--topic', 'news');
    args.push('--days', String(days));
  }

  const res = spawnSync('node', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  if (res.status !== 0) {
    throw new Error(`tavily-search failed for query=${JSON.stringify(query)}: ${res.stderr || res.stdout}`);
  }

  return res.stdout;
}

function extractLinks(text) {
  // Tavily skill prints markdown-like output; we extract URLs.
  const urls = new Set();
  const re = /https?:\/\/[^\s)\]]+/g;
  let m;
  while ((m = re.exec(text))) urls.add(m[0]);
  return Array.from(urls);
}

const args = parseArgs(process.argv);
if (args.help || !args.topic) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!process.env.TAVILY_API_KEY) {
  console.error('Missing TAVILY_API_KEY in environment.');
  process.exit(2);
}

const topic = args.topic.trim();
const slug = safeSlug(topic);
const outDir = path.resolve(args.outDir || `research/agent-insights-room/${slug}`);
fs.mkdirSync(outDir, { recursive: true });

function loadCustomQueries(file, topic) {
  if (!file) return null;
  const p = path.resolve(file);
  if (!fs.existsSync(p)) throw new Error(`Queries file not found: ${p}`);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return lines.map(q => q.replace(/\{topic\}/g, topic));
}

const customQueries = loadCustomQueries(args.queriesFile, topic);

const batches = {
  docs: [`${topic} official documentation`, `${topic} docs API reference`],
  arch: [`${topic} architecture sessions tools cron memory`, `${topic} runtime gateway channels sessions`],
  prompt: [`${topic} prompt design interaction patterns`, `${topic} best practices workflows`],
  ops: [`${topic} troubleshooting common issues`, `${topic} deployment config env vars`],
  news: [`${topic} release notes`, `${topic} new features`],
};

function wantSection(name) {
  return args.section === 'all' || args.section === name;
}

const runs = [];

if (customQueries && customQueries.length) {
  for (const q of customQueries) {
    const out = runTavilySearch(q, { n: args.n, deep: args.deep, news: false, days: args.days });
    runs.push({ query: q, mode: 'custom', raw: out, links: extractLinks(out) });
  }
} else {
  if (wantSection('docs')) {
    for (const q of batches.docs) {
      const out = runTavilySearch(q, { n: args.n, deep: args.deep, news: false, days: args.days });
      runs.push({ query: q, mode: 'general', raw: out, links: extractLinks(out) });
    }
  }
  if (wantSection('arch')) {
    for (const q of batches.arch) {
      const out = runTavilySearch(q, { n: args.n, deep: args.deep, news: false, days: args.days });
      runs.push({ query: q, mode: 'general', raw: out, links: extractLinks(out) });
    }
  }
  if (wantSection('prompt')) {
    for (const q of batches.prompt) {
      const out = runTavilySearch(q, { n: args.n, deep: args.deep, news: false, days: args.days });
      runs.push({ query: q, mode: 'general', raw: out, links: extractLinks(out) });
    }
  }
  if (wantSection('ops')) {
    for (const q of batches.ops) {
      const out = runTavilySearch(q, { n: args.n, deep: args.deep, news: false, days: args.days });
      runs.push({ query: q, mode: 'general', raw: out, links: extractLinks(out) });
    }
  }

  if (!args.noNews && wantSection('news')) {
    for (const q of batches.news) {
      const out = runTavilySearch(q, { n: Math.min(args.n, 5), deep: false, news: true, days: args.days });
      runs.push({ query: q, mode: 'news', raw: out, links: extractLinks(out) });
    }
  }
}

const payload = {
  topic,
  slug,
  generatedAt: new Date().toISOString(),
  params: { n: args.n, deep: args.deep, days: args.days, section: args.section },
  runs,
};

fs.writeFileSync(path.join(outDir, 'tavily-results.json'), JSON.stringify(payload, null, 2));

// Write a readable markdown digest
let md = `# 洞察室资料抓取：${topic}\n\n`;
md += `- GeneratedAt: ${payload.generatedAt}\n`;
md += `- Queries: ${runs.length}\n`;
md += `- Section: ${args.section}\n\n`;

// Quick link index (dedup)
const allLinks = Array.from(new Set(runs.flatMap(r => r.links)));
md += `## Link index (${allLinks.length})\n\n`;
for (const u of allLinks.slice(0, 50)) md += `- ${u}\n`;
if (allLinks.length > 50) md += `- … (+${allLinks.length - 50} more)\n`;
md += `\n`;

for (const r of runs) {
  md += `## Query (${r.mode}): ${r.query}\n\n`;
  md += r.raw.trim() + '\n\n';
}

fs.writeFileSync(path.join(outDir, 'tavily-digest.md'), md);

function scoreUrl(url) {
  const u = String(url || '').toLowerCase();
  let s = 0;
  if (u.includes('docs.') || u.includes('/docs') || u.includes('documentation')) s += 3;
  if (u.includes('github.com')) s += 2;
  if (u.includes('openclaw.ai') || u.includes('tavily.com') || u.includes('anthropic.com') || u.includes('openai.com')) s += 1;
  if (u.includes('blog')) s += 0.5;
  return s;
}

if (args.topLinks) {
  // Build a curated list: unique URLs with the query context as "why".
  const seen = new Set();
  const items = [];
  for (const r of runs) {
    for (const u of r.links) {
      if (seen.has(u)) continue;
      seen.add(u);
      items.push({ url: u, why: `来自查询：${r.query}（${r.mode}）`, score: scoreUrl(u) });
    }
  }
  items.sort((a, b) => (b.score - a.score));

  const n = Number.isFinite(args.topLinksN) ? Math.max(1, Math.min(50, Math.floor(args.topLinksN))) : 10;
  const top = items.slice(0, n);

  let tmd = `# Top links: ${topic}\n\n`;
  tmd += `- GeneratedAt: ${payload.generatedAt}\n`;
  tmd += `- Picked: ${top.length}/${items.length}\n\n`;
  for (const it of top) {
    tmd += `- ${it.url}\n  - ${it.why}\n`;
  }
  fs.writeFileSync(path.join(outDir, 'top-links.md'), tmd);
}

const files = ['tavily-results.json', 'tavily-digest.md'];
if (args.topLinks) files.push('top-links.md');
console.log(JSON.stringify({ ok: true, outDir, files }, null, 2));
