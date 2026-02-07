import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    topic: null,
    outDir: null,
    n: 5,
    news: false,
    days: 7,
    deep: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--topic' || a === '--tool') && argv[i + 1]) args.topic = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if ((a === '-n' || a === '--n') && argv[i + 1]) args.n = Number(argv[++i]);
    else if (a === '--news') args.news = true;
    else if (a === '--days' && argv[i + 1]) args.days = Number(argv[++i]);
    else if (a === '--deep') args.deep = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Agent Insights research helper (Tavily).

Purpose:
  Quickly gather high-signal links + snippets for an "洞察室" post.
  Uses Tavily via /home/fei/clawd/skills/tavily-search.

Usage:
  node scripts/agent-insights-research.mjs --topic openclaw

Options:
  --out <dir>   Output directory (default: research/agent-insights-room/<topic>/)
  -n <count>    Results per query (default: 5, max: 20)
  --deep        Deeper search (slower)
  --news        Use news topic for the last query batch
  --days <n>    News lookback days (default: 7)

Env:
  Requires TAVILY_API_KEY in environment.
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

const queries = [
  `${topic} official documentation`,
  `${topic} architecture sessions tools cron memory`,
  `${topic} prompt design interaction patterns`,
  `${topic} troubleshooting common issues`,
];

// Optional news batch to capture recent signals.
const newsQueries = [
  `${topic} release notes`,
  `${topic} new features`,
];

const runs = [];
for (const q of queries) {
  const out = runTavilySearch(q, { n: args.n, deep: args.deep, news: false, days: args.days });
  runs.push({ query: q, mode: 'general', raw: out, links: extractLinks(out) });
}

for (const q of newsQueries) {
  const out = runTavilySearch(q, { n: Math.min(args.n, 5), deep: false, news: true, days: args.days });
  runs.push({ query: q, mode: 'news', raw: out, links: extractLinks(out) });
}

const payload = {
  topic,
  slug,
  generatedAt: new Date().toISOString(),
  params: { n: args.n, deep: args.deep, days: args.days },
  runs,
};

fs.writeFileSync(path.join(outDir, 'tavily-results.json'), JSON.stringify(payload, null, 2));

// Write a readable markdown digest
let md = `# 洞察室资料抓取：${topic}\n\n`;
md += `- GeneratedAt: ${payload.generatedAt}\n`;
md += `- Queries: ${runs.length}\n\n`;

for (const r of runs) {
  md += `## Query (${r.mode}): ${r.query}\n\n`;
  md += r.raw.trim() + '\n\n';
}

fs.writeFileSync(path.join(outDir, 'tavily-digest.md'), md);

console.log(JSON.stringify({ ok: true, outDir, files: ['tavily-results.json', 'tavily-digest.md'] }, null, 2));
