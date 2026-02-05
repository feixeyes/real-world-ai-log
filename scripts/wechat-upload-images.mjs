import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const WECHAT_HOME = 'https://mp.weixin.qq.com/';
const MAX_IMAGES = 9;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);

function parseArgs(argv) {
  const args = { images: [], dirs: [], cookieFile: null, outDir: null, keepOpen: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--image' && argv[i + 1]) args.images.push(argv[++i]);
    else if (a === '--dir' && argv[i + 1]) args.dirs.push(argv[++i]);
    else if (a === '--cookie' && argv[i + 1]) args.cookieFile = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if (a === '--keep-open') args.keepOpen = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function collectImages(images, dirs) {
  const out = new Set();
  const add = (p) => {
    const full = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    if (!fs.existsSync(full)) throw new Error(`Path not found: ${p}`);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(full)) add(path.join(full, e));
      return;
    }
    if (!st.isFile()) return;
    const ext = path.extname(full).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) out.add(full);
  };
  for (const p of images) add(p);
  for (const d of dirs) add(d);
  const arr = Array.from(out).sort();
  if (arr.length === 0) throw new Error('No image files detected.');
  if (arr.length > MAX_IMAGES) throw new Error(`Too many images: ${arr.length}. Max ${MAX_IMAGES}.`);
  return arr;
}

function parseNetscapeCookies(txt) {
  const lines = txt.split(/\r?\n/);
  const cookies = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    let [domainRaw, , pathVal, secureRaw, expiresRaw, name, value] = parts;
    const domain = (domainRaw || '').trim().replace(/^\./, '');
    if (!domain || !name) continue;
    const secure = (secureRaw || '').trim().toUpperCase() === 'TRUE';
    const expires = Number(expiresRaw);
    const c = {
      name,
      value: value ?? '',
      domain,
      path: (pathVal && pathVal.startsWith('/')) ? pathVal : '/',
      secure,
      httpOnly: false,
      sameSite: 'Lax'
    };
    if (Number.isFinite(expires) && expires > 0) c.expires = expires;
    cookies.push(c);
  }
  return cookies;
}

async function screenshot(page, outDir, name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

async function extractToken(page) {
  const u = page.url();
  const m = u.match(/[?&]token=(\d+)/);
  return m ? m[1] : null;
}

async function ensureToken(page, outDir) {
  await page.goto(WECHAT_HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await screenshot(page, outDir, '01-home.png');
  let token = await extractToken(page);
  if (!token) {
    await page.goto('https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, outDir, '01b-home.png');
    token = await extractToken(page);
  }
  if (!token) throw new Error(`Token not found; current url=${page.url()}`);
  return token;
}

async function gotoMaterialImages(page, token, outDir) {
  const urls = [
    `https://mp.weixin.qq.com/cgi-bin/filepage?type=2&begin=0&count=24&t=media/img_list&lang=zh_CN&token=${token}`,
    `https://mp.weixin.qq.com/cgi-bin/filepage?type=2&t=media/list&token=${token}&lang=zh_CN`
  ];
  for (const u of urls) {
    await page.goto(u, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    if (page.url().includes('filepage?type=2')) {
      await screenshot(page, outDir, '02-material.png');
      return;
    }
  }
  await screenshot(page, outDir, '02-material-failed.png');
  throw new Error(`Failed to navigate to material library images. url=${page.url()}`);
}

async function upload(page, images, outDir) {
  // Click upload button if present
  const uploadText = [/上传图片/, /上传/];
  for (const re of uploadText) {
    try {
      const btn = page.getByRole('button', { name: re });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForTimeout(1200);
        break;
      }
    } catch {}
  }

  // Locate file input
  const selectors = [
    'input[type=file][accept*="image"]',
    'input[type=file][accept*="png"]',
    'input[type=file][accept*="jpg"]',
    '.js_upload_btn_container input[type=file]',
    'input[type=file]'
  ];

  let input = null;
  for (const sel of selectors) {
    const loc = page.locator(sel);
    if (await loc.count()) { input = loc.first(); break; }
  }
  if (!input) {
    await screenshot(page, outDir, '03-no-input.png');
    throw new Error('Upload input not found.');
  }

  // Force-show input if hidden
  try {
    await input.evaluate((el) => { el.style.display = 'block'; el.style.visibility = 'visible'; el.style.opacity = '1'; });
  } catch {}

  await input.setInputFiles(images);
  await page.waitForTimeout(2000);
  await screenshot(page, outDir, '03-selected.png');

  // Wait for upload to finish (best-effort)
  await page.waitForTimeout(15000);
  await screenshot(page, outDir, '04-after-upload.png');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Upload images to WeChat Official Account material library (素材库→图片) via Playwright.

Usage:
  node wechat-upload-images.mjs --image a.png --image b.png
  node wechat-upload-images.mjs --dir ./images

Options:
  --image <path>     Repeatable (max 9 total)
  --dir <path>       Recursively include images under dir
  --cookie <path>    Netscape cookies.txt (default: inbound wechat cookie)
  --out <path>       Output dir for screenshots (default: ./.tmp/wechat-upload)
  --keep-open        Keep browser open (debug)
`);
    return;
  }

  const cookieFile = args.cookieFile || '/home/fei/.openclaw/media/inbound/114d4d1f-6ce9-4ad1-87c4-71a997a719d1.txt';
  const outDir = args.outDir || '/home/fei/clawd/.tmp/wechat-upload';
  fs.mkdirSync(outDir, { recursive: true });

  const images = collectImages(args.images, args.dirs);

  const cookies = parseNetscapeCookies(fs.readFileSync(cookieFile, 'utf8'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const token = await ensureToken(page, outDir);
  await gotoMaterialImages(page, token, outDir);
  await upload(page, images, outDir);

  const result = { outDir, token, count: images.length, images };
  console.log(JSON.stringify(result, null, 2));

  if (!args.keepOpen) await browser.close();
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
