import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function mdToPlain(md) {
  let s = md;
  s = s.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.replace(/^```\w*\n?/,'').replace(/```$/,'');
    return `\n${inner}\n`;
  });
  s = s.replace(/`([^`]+)`/g, '$1');
  // remove images/links but keep text
  s = s.replace(/!\[[^\]]*\]\([^\)]*\)/g, '');
  s = s.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1');
  return s.trim();
}

function clipByChars(s, max) {
  const t = (s || '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function clipAtPunctuation(s, max) {
  const t = (s || '').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);

  // Prefer sentence-ending punctuation first.
  const strong = /[。！？!?；;\.]/g;
  let m;
  let lastStrong = -1;
  while ((m = strong.exec(head))) lastStrong = m.index;
  if (lastStrong >= 12) {
    return head.slice(0, lastStrong + 1).trim();
  }

  // Fallback to weaker boundary (comma)
  const weak = /[，,]/g;
  let lastWeak = -1;
  while ((m = weak.exec(head))) lastWeak = m.index;
  let out = lastWeak >= 12 ? head.slice(0, lastWeak + 1).trim() : head.trim();
  out = out.replace(/[，,]\s*$/g, '').trim();
  return out;
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch {}
  // try extract first JSON block
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function parseArgs(argv) {
  const args = { md: null, out: null, model: 'gemini-2.5-pro' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--md' || a === '--markdown') && argv[i + 1]) args.md = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--model' && argv[i + 1]) args.model = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Generate WeChat cover summary JSON from a draft markdown.

Usage:
  node scripts/generate-cover-summary.mjs --md content/drafts/<slug>.md

Options:
  --out <path>    Output JSON path (default: cover-image/<slug>/cover-summary.json)
  --model <id>    Gemini model (default: gemini-2.5-pro)
`);
}

const args = parseArgs(process.argv);
if (args.help || !args.md) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const mdPath = path.resolve(args.md);
if (!fs.existsSync(mdPath)) throw new Error(`Markdown not found: ${mdPath}`);

const slug = path.basename(mdPath).replace(/\.md$/i, '');
const defaultOut = path.resolve(`cover-image/${slug}/cover-summary.json`);
const outPath = path.resolve(args.out || defaultOut);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const raw = fs.readFileSync(mdPath, 'utf8');
const titleMatch = raw.match(/^#\s+(.+)$/m);
const title = titleMatch ? titleMatch[1].trim() : slug;
const bodyPlain = mdToPlain(raw.replace(/^#\s+.+\n/, ''));

// Keep prompt compact for stability
const excerpt = clipByChars(bodyPlain, 8000);

const repoRoot = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const skillDir = path.resolve(repoRoot, '.claude/skills/baoyu-danger-gemini-web');
const promptTemplate = path.resolve(repoRoot, 'templates/cover-summary-prompt.md');

if (!fs.existsSync(promptTemplate)) throw new Error(`Prompt template missing: ${promptTemplate}`);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-summary-'));
const contentFile = path.join(tmpDir, 'content.md');
fs.writeFileSync(contentFile, `文章标题：${title}\n\n正文（节选）：\n${excerpt}\n`, 'utf8');

const cmd = 'npx';
const cmdArgs = [
  '-y',
  'bun',
  path.join(skillDir, 'scripts/main.ts'),
  '--promptfiles',
  promptTemplate,
  contentFile,
  '--json',
  '--model',
  args.model,
];

const res = spawnSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (res.status !== 0) {
  throw new Error(`Gemini generation failed (code=${res.status}): ${res.stderr || res.stdout}`);
}

let parsed = safeJsonParse(res.stdout || '');
if (!parsed || typeof parsed !== 'object') {
  throw new Error(`Model output is not valid JSON. Raw output:\n${res.stdout}`);
}

// baoyu-danger-gemini-web --json returns {text, thoughts, ...}; the actual JSON may be inside text.
if (typeof parsed.text === 'string') {
  const inner = safeJsonParse(parsed.text);
  if (inner && typeof inner === 'object') parsed = inner;
}

const wechatAbstract = clipAtPunctuation(String(parsed.wechatAbstract || ''), 120);
const oneLiner = clipAtPunctuation(String(parsed.oneLiner || ''), 45);
const bulletsRaw = Array.isArray(parsed.bullets) ? parsed.bullets : [];
const bullets = bulletsRaw
  .map(x => clipAtPunctuation(String(x || ''), 24))
  .filter(Boolean)
  .slice(0, 3);

while (bullets.length < 3) bullets.push('');

// If bullets got clipped into awkward English fragments, do a best-effort rewrite.
for (let i = 0; i < bullets.length; i++) {
  bullets[i] = bullets[i]
    .replace(/\bruntime\b/gi, '运行时')
    .replace(/\brunt\b/gi, '运行时')
    .replace(/\bcron\b/gi, '定时')
    .replace(/\btools\b/gi, '工具')
    .replace(/\bsessions\b/gi, '会话')
    .replace(/\bchannels\b/gi, '通道');
}

const keywordsRaw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
const keywords = keywordsRaw.map(x => String(x || '').trim()).filter(Boolean).slice(0, 8);

const out = {
  slug,
  title,
  wechatAbstract,
  oneLiner,
  bullets,
  keywords,
  generatedAt: new Date().toISOString(),
  model: args.model,
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, outPath }, null, 2));
