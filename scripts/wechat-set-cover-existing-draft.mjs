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

function parseArgs(argv) {
  const args = {
    keyword: null,
    cookieFile: null,
    outDir: null,
    cover: 'cover.png',
    coverIndex: 0,
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

  // Prefer tabs that show recently uploaded items.
  for (const tabRe of [/最近使用/, /我的图片/, /全部/]) {
    try {
      const tab = page.getByText(tabRe, { exact: false });
      if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(700); break; }
    } catch {}
  }

  // Strategy A: find by filename text (may be truncated)
  const tries = [filename, filename.replace(/\.png$/i, ''), filename.slice(0, 10)];
  for (const t of tries) {
    const loc = page.getByText(t, { exact: false });
    if (await loc.count()) {
      await loc.first().click();
      return await confirmImagePick(page, outDir, tag);
    }
  }

  // Strategy B: pick a visible image tile/card by index
  const picked = await page.evaluate((fallbackIndex) => {
    const selectors = [
      '.weui-desktop-media__item',
      '.weui-desktop-img-picker__item',
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

async function setCoverFromMaterial(page, outDir, coverFilename, coverIndex = 0) {
  const opened = await clickFirstVisibleButtonByText(page, [
    /选择封面/, /设置封面/, /更换封面/, /^封面$/
  ]);
  if (!opened) {
    await screenshot(page, outDir, 'cover-open-missing.png');
    return { ok: false, reason: 'cover button not found' };
  }
  await page.waitForTimeout(2000);
  await screenshot(page, outDir, 'cover-01-opened.png');

  // try enter material library picker
  await clickFirstVisibleButtonByText(page, [/从素材库选择/, /素材库选择/, /素材库/, /图片库/]).catch(() => false);
  await page.waitForTimeout(1500);
  await screenshot(page, outDir, 'cover-02-picker.png');

  try {
    await selectImageByFilename(page, coverFilename, outDir, 'cover', coverIndex);
  } catch (e) {
    await screenshot(page, outDir, 'cover-03-select-failed.png');
    return { ok: false, reason: `select cover failed: ${e?.message || e}` };
  }

  await clickFirstVisibleButtonByText(page, [/下一步/, /确定/, /确认/, /完成/, /使用该封面/]).catch(() => false);
  await page.waitForTimeout(2000);
  await screenshot(page, outDir, 'cover-04-after.png');
  return { ok: true };
}

async function openDraftByKeyword(page, token, keyword, outDir, perPage, maxPages) {
  for (let p = 0; p < maxPages; p++) {
    const begin = p * perPage;
    const listUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=${begin}&count=${perPage}&type=77&action=list_card&lang=zh_CN&token=${token}`;
    await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Use the search box (top-right: 输入标题/关键词) to filter; reduces DOM ambiguity.
    const search = page.locator('input[placeholder*="标题"][placeholder*="关键词"], input[placeholder*="标题"], input[placeholder*="关键词"]').first();
    if (await search.count()) {
      await search.click().catch(() => undefined);
      await search.fill(keyword).catch(() => undefined);
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForTimeout(2500);
    }

    await screenshot(page, outDir, `drafts-${String(p).padStart(2, '0')}.png`);

    // In list view, click the matching title to open editor; if that fails, try the 操作 column edit button.
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

      // 操作 column (usually right side) may have an edit icon/button
      const row = page.locator('tr, li, div').filter({ hasText: keyword }).first();
      if (await row.count()) {
        await row.hover().catch(() => undefined);
        await page.waitForTimeout(500);
        const editBtn = row.getByRole('button', { name: /编辑|修改/ });
        if (await editBtn.count()) {
          await editBtn.first().click().catch(() => undefined);
          try {
            await page.waitForURL(/appmsg.*edit/i, { timeout: 12000 });
          } catch {}
          await page.waitForTimeout(1500);
          await screenshot(page, outDir, 'draft-opened.png');
          if (/appmsg.*edit/i.test(page.url())) {
            return { ok: true, pageIndex: p, url: page.url(), method: 'row-edit-button' };
          }
        }
      }
    }
  }
  return { ok: false, reason: `draft not found by keyword: ${keyword}` };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.keyword) {
    console.log(`Set cover image for an EXISTING WeChat draft (草稿箱) via Playwright + cookie injection.

Usage:
  node scripts/wechat-set-cover-existing-draft.mjs \
    --keyword "生产力大爆发" \
    --cookie /path/to/wechat-cookies.txt \
    --out .tmp/wechat-set-cover \
    --cover cover.png --cover-index 0

Options:
  --keyword <text>     substring match in draft list
  --cover <filename>   match in picker (default: cover.png)
  --cover-index <n>    fallback to Nth tile in picker when filename is truncated (default: 0)
  --max-pages <n>      pagination pages to scan (default: 10)
  --per-page <n>       drafts per page (default: 10)
  --keep-open          keep browser open for debugging
`);
    process.exit(args.help ? 0 : 2);
  }

  const cookieFile = args.cookieFile || '/home/fei/.openclaw/media/inbound/114d4d1f-6ce9-4ad1-87c4-71a997a719d1.txt';
  const outDir = args.outDir || '/home/fei/clawd/.tmp/wechat-set-cover';
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

  const coverResult = await setCoverFromMaterial(page, outDir, args.cover, args.coverIndex);

  // Save
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

  console.log(JSON.stringify({ outDir, token, openResult, coverResult, saved, url: page.url() }, null, 2));

  if (!args.keepOpen) await browser.close();
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
