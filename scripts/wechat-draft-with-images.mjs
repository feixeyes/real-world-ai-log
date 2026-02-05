import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

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
  // de-dup
  const seen = new Set();
  const out = [];
  for (const c of cookies) {
    const k = `${c.name}@@${c.domain}@@${c.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function mdToPlain(md) {
  let s = md;
  s = s.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.replace(/^```\w*\n?/,'').replace(/```$/,'');
    return `\n${inner}\n`;
  });
  s = s.replace(/`([^`]+)`/g, '$1');
  return s.trim();
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
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await screenshot(page, outDir, '01-home.png');
  let token = await extractToken(page);
  if (!token) {
    await page.goto('https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, outDir, '01b-home.png');
    token = await extractToken(page);
  }
  if (!token) throw new Error(`Token not found; url=${page.url()}`);
  return token;
}

async function placeCursorAfterText(page, needle) {
  await page.evaluate((needle) => {
    function findTextNode(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes(needle)) return node;
      }
      return null;
    }
    const editor = document.querySelector('[contenteditable="true"]');
    if (!editor) return false;
    const tn = findTextNode(editor);
    if (!tn) return false;
    const idx = tn.nodeValue.indexOf(needle) + needle.length;
    const range = document.createRange();
    range.setStart(tn, idx);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
    return true;
  }, needle);
}

async function openImageDialog(page, outDir, tag) {
  // Close any popovers that might block clicks
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(200);

  // Click the top menu item "图片" (prefer the header menu, not left nav)
  const imgMenu = page.locator('header, .edui-toolbar, .editor_toolbar, body').getByText('图片', { exact: true }).first();
  if (await imgMenu.count()) {
    await imgMenu.click({ timeout: 3000 });
    await page.waitForTimeout(800);

    // Choose the visible dropdown entry that opens the picker
    const pickRegexes = [/从素材库选择/, /素材库/, /图片库/];
    for (const re of pickRegexes) {
      // Filter out hidden / irrelevant links like "前往素材库查看"
      const choice = page.getByText(re, { exact: false }).filter({ hasNotText: /前往素材库查看/ });
      const n = await choice.count();
      for (let i = 0; i < n; i++) {
        const el = choice.nth(i);
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.width < 5 || box.height < 5) continue;
        await el.click({ timeout: 3000 });
        await page.waitForTimeout(1500);
        return;
      }
    }

    // Sometimes clicking 图片 directly opens the picker
    await page.waitForTimeout(1200);
    return;
  }

  await screenshot(page, outDir, `imgmenu-missing-${tag}.png`);
  throw new Error(`Could not open image dialog (${tag}): 图片 menu not found`);
}

async function selectImageByFilename(page, filename, outDir, tag, fallbackIndex = 0) {
  await page.waitForTimeout(1500);

  // Prefer tabs that show recently uploaded items.
  for (const tabRe of [/最近使用/, /我的图片/, /全部/]) {
    try {
      const tab = page.getByText(tabRe, { exact: false });
      if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(700); break; }
    } catch {}
  }

  // Strategy A: find by filename text (may be truncated)
  const tries = [filename, filename.replace(/\.png$/i, ''), filename.slice(0, 8)];
  for (const t of tries) {
    const loc = page.getByText(t, { exact: false });
    if (await loc.count()) {
      await loc.first().click();
      return await confirmImagePick(page, outDir, tag);
    }
  }

  // Strategy B: pick a visible image tile/card by index (prefer Recently Used list)
  const picked = await page.evaluate((fallbackIndex) => {
    const selectors = [
      // image picker tiles
      '.weui-desktop-media__item',
      '.weui-desktop-img-picker__item',
      // generic list items
      'li'
    ];
    function visible(el) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 40 && r.height > 40 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
    }

    const tiles = [];
    for (const sel of selectors) {
      for (const n of Array.from(document.querySelectorAll(sel))) {
        if (!(n instanceof HTMLElement)) continue;
        if (!visible(n)) continue;
        // avoid huge containers
        const txt = (n.innerText || '').trim();
        if (txt && txt.length > 300) continue;
        tiles.push(n);
      }
      if (tiles.length) break;
    }

    const idx = Number.isFinite(fallbackIndex) ? Math.max(0, Math.floor(fallbackIndex)) : 0;
    const target = tiles[idx] || tiles[0];
    if (!target) return false;
    target.click();
    return true;
  }, fallbackIndex);

  if (!picked) {
    await screenshot(page, outDir, `dlg-miss-${tag}.png`);
    throw new Error(`Image not found in dialog (no tiles clickable): ${filename}`);
  }

  await confirmImagePick(page, outDir, tag);
}

async function confirmImagePick(page, outDir, tag) {
  await page.waitForTimeout(600);
  const okCandidates = [/确定/, /确认/, /插入/, /完成/];
  for (const re of okCandidates) {
    const btn = page.getByRole('button', { name: re });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(2500);
      return;
    }
  }
  // some dialogs insert immediately
  await page.waitForTimeout(2500);
  await screenshot(page, outDir, `dlg-after-${tag}.png`);
}

async function setCoverFromMaterial(page, outDir) {
  // Best-effort: locate cover area button.
  const coverButtons = [
    /选择封面/, /封面/, /更换封面/, /设置封面/
  ];
  for (const re of coverButtons) {
    const btn = page.getByRole('button', { name: re });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(1500);
      await screenshot(page, outDir, 'cover-dialog.png');
      return true;
    }
  }
  return false;
}

function parseArgs(argv) {
  // Backward compatible:
  //   node wechat-draft-with-images.mjs <markdownPath> <cookieFile> <outDir>
  const args = {
    markdownPath: argv[2] && !argv[2].startsWith('--') ? argv[2] : null,
    cookieFile: argv[3] && !argv[3].startsWith('--') ? argv[3] : null,
    outDir: argv[4] && !argv[4].startsWith('--') ? argv[4] : null,
    illus1: 'illus-1-loop.png',
    illus2: 'illus-2-memory.png',
    // Fallback selection by index under "最近使用" when filename is not visible.
    // 0 = first tile, 1 = second tile...
    illus1Index: 0,
    illus2Index: 1,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md' && argv[i + 1]) args.markdownPath = argv[++i];
    else if (a === '--cookie' && argv[i + 1]) args.cookieFile = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if (a === '--illus1' && argv[i + 1]) args.illus1 = argv[++i];
    else if (a === '--illus2' && argv[i + 1]) args.illus2 = argv[++i];
    else if (a === '--illus1-index' && argv[i + 1]) args.illus1Index = Number(argv[++i]);
    else if (a === '--illus2-index' && argv[i + 1]) args.illus2Index = Number(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Create a WeChat Official Account article draft and insert images from material library.

Usage (legacy positional):
  node scripts/wechat-draft-with-images.mjs <markdownPath> <cookieFile> <outDir>

Usage (flags):
  node scripts/wechat-draft-with-images.mjs --md content/drafts/xxx.md --cookie /path/cookies.txt --out .tmp/wechat-draft \
    --illus1 illus-1-loop.png --illus2 illus-2-memory.png \
    --illus1-index 0 --illus2-index 1

Notes:
- Images are selected from the picker dialog; prefer using Recently Used uploads.
- Screenshots are written to --out for audit.
`);
    return;
  }

  const markdownPath = args.markdownPath || '/home/fei/clawd/code/real-world-ai-log/content/drafts/five-questions-building-agents.md';
  const cookieFile = args.cookieFile || '/home/fei/.openclaw/media/inbound/114d4d1f-6ce9-4ad1-87c4-71a997a719d1.txt';
  const outDir = args.outDir || '/home/fei/clawd/.tmp/wechat-with-images';
  fs.mkdirSync(outDir, { recursive: true });

  const md = fs.readFileSync(markdownPath, 'utf8');
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : `Draft ${new Date().toISOString()}`;
  const contentPlain = mdToPlain(md.replace(/^#\s+.+\n/, ''));

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

  const editUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&lang=zh_CN&token=${token}`;
  await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await screenshot(page, outDir, '02-editor.png');

  // Fill title (WeChat editor often uses a contenteditable title block, not <input>)
  let titleFilled = false;
  const titleCandidates = [
    'input[name="title"]',
    'input[placeholder*="标题"]',
    'input[placeholder*="请输入标题"]',
    'input.js_title'
  ];
  for (const sel of titleCandidates) {
    const loc = page.locator(sel);
    if (await loc.count()) {
      await loc.first().click();
      await loc.first().fill(title.slice(0, 64));
      titleFilled = true;
      break;
    }
  }

  if (!titleFilled) {
    // Fallback: click the visible placeholder text "请在这里输入标题" then type
    const placeholder = page.getByText('请在这里输入标题', { exact: true });
    if (await placeholder.count()) {
      await placeholder.first().click();
      await page.keyboard.type(title.slice(0, 64));
      titleFilled = true;
    }
  }

  // Fill body: use the visible ProseMirror editor (main article body)
  const editable = page.locator('.ProseMirror[contenteditable="true"]').first();
  await editable.waitFor({ state: 'visible', timeout: 60000 });
  await editable.click();
  // Select-all to ensure clean slate
  await page.keyboard.press('Control+A');
  await page.keyboard.type(contentPlain.slice(0, 20000));

  await page.waitForTimeout(1500);
  await screenshot(page, outDir, '03-filled-text.png');

  // Insert illustration 1 after section about loop
  await placeCursorAfterText(page, '闭环流程');
  await page.keyboard.press('Enter');
  await openImageDialog(page, outDir, 'loop');
  await selectImageByFilename(page, args.illus1, outDir, 'loop', args.illus1Index);

  // Insert illustration 2 after section about memory
  await placeCursorAfterText(page, '上下文与记忆');
  await page.keyboard.press('Enter');
  await openImageDialog(page, outDir, 'mem');
  await selectImageByFilename(page, args.illus2, outDir, 'mem', args.illus2Index);

  await screenshot(page, outDir, '04-inserted.png');

  // Save draft
  let saved = false;
  for (const re of [/保存为草稿/, /保存/]) {
    const btn = page.getByRole('button', { name: re });
    if (await btn.count()) {
      await btn.first().click();
      saved = true;
      break;
    }
  }
  await page.waitForTimeout(4000);
  await screenshot(page, outDir, '05-after-save.png');

  // Draft list
  const draftUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&type=77&action=list_card&lang=zh_CN&token=${token}`;
  await page.goto(draftUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await screenshot(page, outDir, '06-draft-list.png');

  console.log(JSON.stringify({ outDir, token, editUrl, title, titleFilled, saved }, null, 2));

  await browser.close();
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
