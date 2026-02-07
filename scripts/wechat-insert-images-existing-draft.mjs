import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
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
  return cookies;
}

function parseArgs(argv) {
  const args = {
    keyword: null,
    cookieFile: null,
    outDir: null,
    cover: 'cover.png',
    coverIndex: 0,
    illus1: null,
    illus1After: null,
    illus1Index: 0,
    illus2: null,
    illus2After: null,
    illus2Index: 1,
    maxPages: 10,
    perPage: 10,
    keepOpen: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--keyword' || a === '--title') && argv[i + 1]) args.keyword = argv[++i];
    else if (a === '--cookie' && argv[i + 1]) args.cookieFile = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if (a === '--cover' && argv[i + 1]) args.cover = argv[++i];
    else if (a === '--cover-index' && argv[i + 1]) args.coverIndex = Number(argv[++i]);
    else if (a === '--illus1' && argv[i + 1]) args.illus1 = argv[++i];
    else if (a === '--illus1-after' && argv[i + 1]) args.illus1After = argv[++i];
    else if (a === '--illus1-index' && argv[i + 1]) args.illus1Index = Number(argv[++i]);
    else if (a === '--illus2' && argv[i + 1]) args.illus2 = argv[++i];
    else if (a === '--illus2-after' && argv[i + 1]) args.illus2After = argv[++i];
    else if (a === '--illus2-index' && argv[i + 1]) args.illus2Index = Number(argv[++i]);
    else if (a === '--max-pages' && argv[i + 1]) args.maxPages = Number(argv[++i]);
    else if (a === '--per-page' && argv[i + 1]) args.perPage = Number(argv[++i]);
    else if (a === '--keep-open') args.keepOpen = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
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

async function openDraftByKeyword(page, token, keyword, outDir, perPage, maxPages) {
  for (let p = 0; p < maxPages; p++) {
    const begin = p * perPage;
    const listUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=${begin}&count=${perPage}&type=77&action=list_card&lang=zh_CN&token=${token}`;
    await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const search = page.locator('input[placeholder*="标题"][placeholder*="关键词"], input[placeholder*="标题"], input[placeholder*="关键词"]').first();
    if (await search.count()) {
      await search.click().catch(() => undefined);
      await search.fill(keyword).catch(() => undefined);
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForTimeout(2500);
    }

    await screenshot(page, outDir, `drafts-${String(p).padStart(2, '0')}.png`);

    const title = page.getByText(keyword, { exact: false }).first();
    if (await title.count()) {
      await title.first().click().catch(() => undefined);
      try {
        await page.waitForURL(/appmsg.*edit/i, { timeout: 12000 });
      } catch {}
      await page.waitForTimeout(1500);
      await screenshot(page, outDir, 'draft-opened.png');
      if (/appmsg.*edit/i.test(page.url())) {
        return { ok: true, pageIndex: p, url: page.url(), method: 'click-title' };
      }
    }
  }
  return { ok: false, reason: `draft not found by keyword: ${keyword}` };
}

async function placeCursorAtStart(page) {
  return await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"]');
    if (!editor) return false;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // @ts-ignore
    editor.focus();
    return true;
  });
}

async function placeCursorAfterText(page, needle) {
  return await page.evaluate((needle) => {
    function norm(s) {
      return (s || '')
        .toLowerCase()
        .replace(/[\s\u00a0]+/g, '')
        .replace(/[“”]/g, '"')
        .replace(/[’]/g, "'");
    }
    function findTextNode(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      const nNeedle = norm(needle);
      while ((node = walker.nextNode())) {
        const v = node.nodeValue || '';
        if (!v) continue;
        if (v.includes(needle)) return { node, idx: v.indexOf(needle) + needle.length };
        const nv = norm(v);
        const k = nv.indexOf(nNeedle);
        if (k >= 0) return { node, idx: v.length };
      }
      return null;
    }
    const editor = document.querySelector('.ProseMirror[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"]');
    if (!editor) return false;
    const found = findTextNode(editor);
    if (!found) return false;
    const range = document.createRange();
    range.setStart(found.node, Math.min(found.idx, (found.node.nodeValue || '').length));
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
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(200);

  const imgMenu = page.locator('header, .edui-toolbar, .editor_toolbar, body').getByText('图片', { exact: true }).first();
  if (await imgMenu.count()) {
    await imgMenu.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    const pickRegexes = [/从素材库选择/, /素材库/, /图片库/];
    for (const re of pickRegexes) {
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
    await page.waitForTimeout(1200);
    return;
  }
  await screenshot(page, outDir, `imgmenu-missing-${tag}.png`);
  throw new Error(`Could not open image dialog (${tag}): 图片 menu not found`);
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
  await page.waitForTimeout(2500);
  await screenshot(page, outDir, `dlg-after-${tag}.png`);
}

async function selectImageByFilename(page, filename, outDir, tag, fallbackIndex = 0) {
  await page.waitForTimeout(1500);

  for (const tabRe of [/最近使用/, /我的图片/, /全部/]) {
    try {
      const tab = page.getByText(tabRe, { exact: false });
      if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(700); break; }
    } catch {}
  }

  const tries = [filename, filename.replace(/\.png$/i, ''), filename.slice(0, 10)];
  for (const t of tries) {
    const loc = page.getByText(t, { exact: false });
    if (await loc.count()) {
      await loc.first().click();
      return await confirmImagePick(page, outDir, tag);
    }
  }

  const picked = await page.evaluate((fallbackIndex) => {
    const selectors = ['.weui-desktop-media__item', '.weui-desktop-img-picker__item', 'li'];
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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.keyword) {
    console.log(`Insert images into an EXISTING WeChat draft (草稿箱) via Playwright + cookie injection.

Usage:
  node scripts/wechat-insert-images-existing-draft.mjs \
    --keyword "标题关键词" \
    --cookie /path/to/wechat-cookies.txt \
    --out .tmp/wechat-insert-images \
    --cover cover.png --cover-index 0 \
    --illus1 illus-1.png --illus1-after "..." --illus1-index 0 \
    --illus2 illus-2.png --illus2-after "..." --illus2-index 1
`);
    process.exit(args.help ? 0 : 2);
  }

  const cookieFile = args.cookieFile || '/home/fei/.openclaw/media/inbound/wechat-cookies.txt';
  const outDir = args.outDir || '/home/fei/clawd/.tmp/wechat-insert-images';
  fs.mkdirSync(outDir, { recursive: true });

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
  const openResult = await openDraftByKeyword(page, token, args.keyword, outDir, args.perPage, args.maxPages);
  if (!openResult.ok) {
    console.log(JSON.stringify({ outDir, token, openResult }, null, 2));
    await browser.close();
    process.exit(1);
  }

  // Insert cover at body start
  if (args.cover) {
    const okStart = await placeCursorAtStart(page);
    if (!okStart) {
      await screenshot(page, outDir, 'cover-body-cursor-start-missing.png');
    } else {
      await page.keyboard.press('Enter');
      await openImageDialog(page, outDir, 'cover-body');
      await selectImageByFilename(page, args.cover, outDir, 'cover-body', args.coverIndex);
      await page.waitForTimeout(1200);
      await screenshot(page, outDir, 'cover-body-inserted.png');
    }
  }

  // Insert illustration 1
  if (args.illus1 && args.illus1After) {
    const ok1 = await placeCursorAfterText(page, args.illus1After);
    if (!ok1) {
      await screenshot(page, outDir, 'illus1-anchor-missing.png');
      throw new Error(`Illustration 1 anchor not found in editor: ${args.illus1After}`);
    }
    await page.keyboard.press('Enter');
    await openImageDialog(page, outDir, 'illus1');
    await selectImageByFilename(page, args.illus1, outDir, 'illus1', args.illus1Index);
  }

  // Insert illustration 2
  if (args.illus2 && args.illus2After) {
    const ok2 = await placeCursorAfterText(page, args.illus2After);
    if (!ok2) {
      await screenshot(page, outDir, 'illus2-anchor-missing.png');
      throw new Error(`Illustration 2 anchor not found in editor: ${args.illus2After}`);
    }
    await page.keyboard.press('Enter');
    await openImageDialog(page, outDir, 'illus2');
    await selectImageByFilename(page, args.illus2, outDir, 'illus2', args.illus2Index);
  }

  await screenshot(page, outDir, 'after-inserted.png');

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
  await screenshot(page, outDir, 'after-save.png');

  console.log(JSON.stringify({ outDir, token, openResult, saved }, null, 2));

  if (!args.keepOpen) await browser.close();
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
