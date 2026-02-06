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
  return await page.evaluate((needle) => {
    function findTextNode(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes(needle)) return node;
      }
      return null;
    }

    // Prefer the main article body editor
    const editor = document.querySelector('.ProseMirror[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"]');
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

    // @ts-ignore
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

async function clickFirstVisibleButtonByText(page, regexes) {
  for (const re of regexes) {
    const btn = page.getByRole('button', { name: re });
    const n = await btn.count();
    for (let i = 0; i < n; i++) {
      const el = btn.nth(i);
      const box = await el.boundingBox().catch(() => null);
      if (!box || box.width < 5 || box.height < 5) continue;
      await el.click();
      return true;
    }
  }
  return false;
}

async function setCoverFromMaterial(page, outDir, coverFilename, coverIndex = 0) {
  // WeChat's cover entry varies:
  // - Sometimes a button: 选择封面/设置封面
  // - Sometimes an area: "拖拽或选择封面" (user screenshot)
  // - Sometimes clicking the left thumbnail (标题卡片) opens cover selector

  // Try A: explicit cover buttons
  let opened = await clickFirstVisibleButtonByText(page, [
    /选择封面/, /设置封面/, /更换封面/, /^封面$/
  ]);

  // Try B: cover dropzone text (commonly shown below the editor)
  if (!opened) {
    const drop = page.getByText(/拖拽.*选择封面|选择封面/, { exact: false });
    if (await drop.count()) {
      try {
        await drop.first().scrollIntoViewIfNeeded();
        await drop.first().click({ timeout: 3000 });
        opened = true;
      } catch {}
    }
  }

  // Try C: click left-side cover thumbnail/card (often needs clicking the gray cover area, not the label)
  if (!opened) {
    const titleLabel = page.getByText('标题', { exact: true }).first();
    if (await titleLabel.count()) {
      const box = await titleLabel.boundingBox().catch(() => null);
      if (box) {
        // Click above the "标题" label (inside the cover thumbnail area)
        const x = box.x + box.width / 2;
        const y = Math.max(5, box.y - 120);
        try {
          await page.mouse.click(x, y);
          opened = true;
        } catch {}
      }
    }
  }

  if (!opened) {
    await screenshot(page, outDir, 'cover-open-missing.png');
    return { ok: false, reason: 'cover entry not found' };
  }

  await page.waitForTimeout(2000);
  await screenshot(page, outDir, 'cover-01-opened.png');

  // Ensure we are really in a cover selector / picker context.
  // Wait briefly for known picker texts; if not present, we likely didn't open the cover UI.
  const pickerHint = page.getByText(/从素材库选择|素材库|图片库|选择图片|确定|完成/, { exact: false }).first();
  try {
    await pickerHint.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    await screenshot(page, outDir, 'cover-open-not-confirmed.png');
  }

  // Try enter material-library picker
  await clickFirstVisibleButtonByText(page, [
    /从素材库选择/, /素材库选择/, /素材库/, /图片库/
  ]).catch(() => false);
  await page.waitForTimeout(1500);
  await screenshot(page, outDir, 'cover-02-picker.png');

  try {
    await selectImageByFilename(page, coverFilename, outDir, 'cover', coverIndex);
  } catch (e) {
    await screenshot(page, outDir, 'cover-03-select-failed.png');
    return { ok: false, reason: `select cover failed: ${e?.message || e}` };
  }

  await clickFirstVisibleButtonByText(page, [/下一步/, /确定/, /确认/, /完成/, /使用该封面/]).catch(() => undefined);
  await page.waitForTimeout(2000);
  await screenshot(page, outDir, 'cover-04-after.png');

  return { ok: true };
}

async function setCoverFromArticleFirstImage(page, outDir) {
  // Best-effort fallback: "从正文选择" → choose first image → confirm.
  // This is a stability fallback when material-library cover is flaky.
  let opened = await clickFirstVisibleButtonByText(page, [
    /选择封面/, /设置封面/, /更换封面/, /^封面$/
  ]);

  if (!opened) {
    const drop = page.getByText(/拖拽.*选择封面|选择封面/, { exact: false });
    if (await drop.count()) {
      try {
        await drop.first().scrollIntoViewIfNeeded();
        await drop.first().click({ timeout: 3000 });
        opened = true;
      } catch {}
    }
  }

  if (!opened) {
    await screenshot(page, outDir, 'cover-article-open-missing.png');
    return { ok: false, reason: 'cover entry not found (article fallback)' };
  }

  await page.waitForTimeout(1200);

  // Click menu item "从正文选择" (user-confirmed fallback)
  try {
    const entry = page.getByText(/从正文选择/, { exact: false }).first();
    if (await entry.count()) {
      await entry.click({ timeout: 5000 });
    } else {
      await screenshot(page, outDir, 'cover-article-entry-missing.png');
      return { ok: false, reason: '从正文选择 not found' };
    }
  } catch (e) {
    await screenshot(page, outDir, 'cover-article-entry-click-failed.png');
    return { ok: false, reason: `click 从正文选择 failed: ${e?.message || e}` };
  }

  await page.waitForTimeout(2000);
  await screenshot(page, outDir, 'cover-article-01-picker.png');

  // Pick first visible selectable tile
  const picked = await page.evaluate(() => {
    function visible(el) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 40 && r.height > 40 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
    }

    const selectors = [
      '.weui-desktop-media__item',
      '.weui-desktop-img-picker__item',
      'li'
    ];

    const tiles = [];
    for (const sel of selectors) {
      for (const n of Array.from(document.querySelectorAll(sel))) {
        if (!(n instanceof HTMLElement)) continue;
        if (!visible(n)) continue;
        const txt = (n.innerText || '').trim();
        if (txt && txt.length > 300) continue;
        tiles.push(n);
      }
      if (tiles.length) break;
    }

    const target = tiles[0];
    if (!target) return false;
    target.click();
    return true;
  });

  if (!picked) {
    await screenshot(page, outDir, 'cover-article-02-pick-missing.png');
    return { ok: false, reason: 'no selectable tiles for article cover' };
  }

  await page.waitForTimeout(600);
  await confirmImagePick(page, outDir, 'cover-article');
  await screenshot(page, outDir, 'cover-article-03-after.png');
  return { ok: true, via: 'article-first' };
}

async function fillAbstract(page, outDir, text) {
  if (!text) return { ok: true, skipped: true };

  const val = String(text).trim();
  const clipped = val.length > 120 ? val.slice(0, 120) : val;

  // Prefer textarea with placeholder containing "选填" / "摘要"
  const cand = page.locator('textarea[placeholder*="选填"], textarea[placeholder*="摘要"], textarea').first();

  try {
    if (await cand.count()) {
      await cand.first().scrollIntoViewIfNeeded();
      await cand.first().click({ timeout: 3000 });
      await cand.first().fill(clipped);
      await page.waitForTimeout(300);
      await screenshot(page, outDir, 'abstract-filled.png');
      return { ok: true, clipped: clipped.length };
    }
  } catch {}

  await screenshot(page, outDir, 'abstract-fill-failed.png');
  return { ok: false, reason: 'abstract textarea not found' };
}

function parseArgs(argv) {
  // Backward compatible:
  //   node wechat-draft-with-images.mjs <markdownPath> <cookieFile> <outDir>
  const args = {
    markdownPath: argv[2] && !argv[2].startsWith('--') ? argv[2] : null,
    cookieFile: argv[3] && !argv[3].startsWith('--') ? argv[3] : null,
    outDir: argv[4] && !argv[4].startsWith('--') ? argv[4] : null,

    // image filenames in material picker
    illus1: 'illus-1-loop.png',
    illus2: 'illus-2-memory.png',

    // where to insert illustrations (anchor text inside editor)
    illus1After: '## 4. 最小可用模板',
    illus2After: '## 5. 更新机制',

    // cover
    noCover: false,
    // Fallback selection by index under "最近使用" when filename is not visible.
    // 0 = first tile, 1 = second tile...
    cover: 'cover.png',
    coverIndex: 0,
    // If cover-from-library fails, try picking first image from the article.
    coverFallback: 'article-first',

    // abstract (WeChat 摘要, <=120 chars)
    abstract: null,
    abstractFile: null,

    illus1Index: 0,
    illus2Index: 1,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md' && argv[i + 1]) args.markdownPath = argv[++i];
    else if (a === '--cookie' && argv[i + 1]) args.cookieFile = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if (a === '--no-cover') args.noCover = true;
    else if (a === '--cover' && argv[i + 1]) args.cover = argv[++i];
    else if (a === '--cover-index' && argv[i + 1]) args.coverIndex = Number(argv[++i]);
    else if (a === '--cover-fallback' && argv[i + 1]) args.coverFallback = argv[++i];
    else if (a === '--abstract' && argv[i + 1]) args.abstract = argv[++i];
    else if (a === '--abstract-file' && argv[i + 1]) args.abstractFile = argv[++i];
    else if (a === '--illus1' && argv[i + 1]) args.illus1 = argv[++i];
    else if (a === '--illus2' && argv[i + 1]) args.illus2 = argv[++i];
    else if (a === '--illus1-after' && argv[i + 1]) args.illus1After = argv[++i];
    else if (a === '--illus2-after' && argv[i + 1]) args.illus2After = argv[++i];
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
    --no-cover \
    --illus1 illus-1.png --illus1-after "..." --illus1-index 0 \
    --illus2 illus-2.png --illus2-after "..." --illus2-index 1

  # or enable cover (best-effort) + optional abstract:
  node scripts/wechat-draft-with-images.mjs --md content/drafts/xxx.md --cookie /path/cookies.txt --out .tmp/wechat-draft \
    --cover cover.png --cover-index 0 --cover-fallback article-first \
    --abstract "<=120字摘要" \
    --illus1 illus-1.png --illus1-after "..." --illus1-index 0 \
    --illus2 illus-2.png --illus2-after "..." --illus2-index 1

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
    // Fallback A: try to fill hidden #title input/textarea via DOM (Playwright can't click invisible placeholders)
    const ok = await page.evaluate((t) => {
      const el = document.querySelector('#title, input#title, textarea#title');
      if (!el) return false;
      // @ts-ignore
      el.value = t;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      // try focus related editable area
      const label = document.querySelector('label[for="title"]');
      if (label && typeof label.click === 'function') label.click();
      return true;
    }, title.slice(0, 64));
    if (ok) titleFilled = true;
  }

  if (!titleFilled) {
    // Fallback B: click the placeholder text (best-effort) then type
    const placeholder = page.getByText('请在这里输入标题', { exact: true });
    if (await placeholder.count()) {
      try {
        await placeholder.first().click({ timeout: 3000 });
        await page.keyboard.type(title.slice(0, 64));
        titleFilled = true;
      } catch {}
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

  // Set cover (best-effort)
  let coverResult = args.noCover
    ? { ok: false, skipped: true }
    : await setCoverFromMaterial(page, outDir, args.cover, args.coverIndex);

  // Fallback: from-article-first-image (user-approved)
  if (!args.noCover && (!coverResult || coverResult.ok !== true) && args.coverFallback === 'article-first') {
    const fallback = await setCoverFromArticleFirstImage(page, outDir);
    coverResult = fallback.ok ? { ok: true, via: 'article-first' } : { ...coverResult, fallback };
  }

  // Fill abstract (WeChat 摘要)
  let abstractText = args.abstract;
  if (!abstractText && args.abstractFile && fs.existsSync(args.abstractFile)) {
    abstractText = fs.readFileSync(args.abstractFile, 'utf8');
  }
  const abstractResult = await fillAbstract(page, outDir, abstractText);

  // Insert illustration 1
  {
    const ok = await placeCursorAfterText(page, args.illus1After);
    if (!ok) {
      await screenshot(page, outDir, 'illus1-anchor-missing.png');
      throw new Error(`Illustration 1 anchor not found in editor: ${args.illus1After}`);
    }
    await page.keyboard.press('Enter');
    await openImageDialog(page, outDir, 'illus1');
    await selectImageByFilename(page, args.illus1, outDir, 'illus1', args.illus1Index);
  }

  // Insert illustration 2
  {
    const ok = await placeCursorAfterText(page, args.illus2After);
    if (!ok) {
      await screenshot(page, outDir, 'illus2-anchor-missing.png');
      throw new Error(`Illustration 2 anchor not found in editor: ${args.illus2After}`);
    }
    await page.keyboard.press('Enter');
    await openImageDialog(page, outDir, 'illus2');
    await selectImageByFilename(page, args.illus2, outDir, 'illus2', args.illus2Index);
  }

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

  console.log(JSON.stringify({ outDir, token, editUrl, title, titleFilled, coverResult, abstractResult, saved }, null, 2));

  await browser.close();
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
