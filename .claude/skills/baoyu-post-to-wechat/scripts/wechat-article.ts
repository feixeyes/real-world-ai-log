import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { launchChrome, getPageSession, waitForNewTab, clickElement, typeText, evaluate, sleep, type ChromeSession, type CdpConnection } from './cdp.ts';

const WECHAT_URL = 'https://mp.weixin.qq.com/';

interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
}

interface ArticleOptions {
  title: string;
  content?: string;
  htmlFile?: string;
  markdownFile?: string;
  theme?: string;
  author?: string;
  summary?: string;
  images?: string[];
  contentImages?: ImageInfo[];
  submit?: boolean;
  profileDir?: string;
  cookieFile?: string;
  noSummary?: boolean;
}

function parseNetscapeCookies(txt: string) {
  const lines = txt.split(/\r?\n/);
  const cookies: Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; expires?: number }> = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    let [domainRaw, , pathVal, secureRaw, expiresRaw, name, value] = parts;
    const domain = (domainRaw || '').trim();
    if (!domain || !name) continue;
    const secure = (secureRaw || '').trim().toUpperCase() === 'TRUE';
    const expires = Number(expiresRaw);
    const c: any = {
      name,
      value: value ?? '',
      domain,
      path: (pathVal && pathVal.startsWith('/')) ? pathVal : '/',
      secure,
      httpOnly: false,
    };
    if (Number.isFinite(expires) && expires > 0) c.expires = expires;
    cookies.push(c);
  }
  return cookies;
}

async function applyCookies(cdp: CdpConnection, cookies: ReturnType<typeof parseNetscapeCookies>) {
  await cdp.send('Network.enable');
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '');
    const url = `https://${host}${c.path || '/'}`;
    await cdp.send('Network.setCookie', {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expires: c.expires,
      url,
    });
  }
}

async function waitForLogin(session: ChromeSession, timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await evaluate<string>(session, 'window.location.href');
    if (url.includes('/cgi-bin/home') || url.includes('/cgi-bin/appmsg') || url.includes('appmsg_edit')) return true;
    await sleep(2000);
  }
  return false;
}

async function clickMenuByText(session: ChromeSession, text: string): Promise<void> {
  console.log(`[wechat] Clicking "${text}" menu...`);
  const posResult = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const items = document.querySelectorAll('.new-creation__menu .new-creation__menu-item');
        for (const item of items) {
          const title = item.querySelector('.new-creation__menu-title');
          if (title && title.textContent?.trim() === '${text}') {
            item.scrollIntoView({ block: 'center' });
            const rect = item.getBoundingClientRect();
            return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
          }
        }
        return 'null';
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  if (posResult.result.value === 'null') throw new Error(`Menu "${text}" not found`);
  const pos = JSON.parse(posResult.result.value);

  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  await sleep(100);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
}

async function copyImageToClipboard(imagePath: string): Promise<void> {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const copyScript = path.join(scriptDir, './copy-to-clipboard.ts');
  const result = spawnSync('npx', ['-y', 'bun', copyScript, 'image', imagePath], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Failed to copy image: ${imagePath}`);
}

async function pasteInEditor(session: ChromeSession): Promise<void> {
  const modifiers = process.platform === 'darwin' ? 4 : 2;
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId: session.sessionId });
}

async function copyHtmlFromBrowser(cdp: CdpConnection, htmlFilePath: string): Promise<void> {
  const absolutePath = path.isAbsolute(htmlFilePath) ? htmlFilePath : path.resolve(process.cwd(), htmlFilePath);
  const fileUrl = `file://${absolutePath}`;

  console.log(`[wechat] Opening HTML file in new tab: ${fileUrl}`);

  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: fileUrl });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await sleep(2000);

  console.log('[wechat] Selecting #output content...');
  await cdp.send<{ result: { value: unknown } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const output = document.querySelector('#output') || document.body;
        const range = document.createRange();
        range.selectNodeContents(output);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      })()
    `,
    returnByValue: true,
  }, { sessionId });
  await sleep(300);

  console.log('[wechat] Copying with system Cmd+C...');
  if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
  } else {
    spawnSync('xdotool', ['key', 'ctrl+c']);
  }
  await sleep(1000);

  console.log('[wechat] Closing HTML tab...');
  await cdp.send('Target.closeTarget', { targetId });
}

async function pasteFromClipboardInEditor(): Promise<void> {
  if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
  } else {
    spawnSync('xdotool', ['key', 'ctrl+v']);
  }
  await sleep(1000);
}

async function parseMarkdownWithPlaceholders(markdownPath: string, theme?: string): Promise<{ title: string; author: string; summary: string; htmlPath: string; contentImages: ImageInfo[] }> {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const mdToWechatScript = path.join(scriptDir, 'md-to-wechat.ts');
  const args = ['-y', 'bun', mdToWechatScript, markdownPath];
  if (theme) args.push('--theme', theme);

  const result = spawnSync('npx', args, { stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`Failed to parse markdown: ${stderr}`);
  }

  const output = result.stdout.toString();
  return JSON.parse(output);
}

function parseHtmlMeta(htmlPath: string): { title: string; author: string; summary: string } {
  const content = fs.readFileSync(htmlPath, 'utf-8');

  let title = '';
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1]!;

  let author = '';
  const authorMatch = content.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
  if (authorMatch) author = authorMatch[1]!;

  let summary = '';
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (descMatch) summary = descMatch[1]!;

  if (!summary) {
    const pMatches = Array.from(content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/ig));
    for (const m of pMatches) {
      const text = m[1]!.replace(/<[^>]+>/g, '').trim();
      if (!text) continue;
      if (text.includes('[[IMAGE_PLACEHOLDER_')) continue;
      if (text.length > 20) {
        summary = text.length > 120 ? text.slice(0, 117) + '...' : text;
        break;
      }
    }
  }

  return { title, author, summary };
}

async function selectAndReplacePlaceholder(session: ChromeSession, placeholder: string): Promise<boolean> {
  const result = await session.cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const editor = document.querySelector('.ProseMirror');
        if (!editor) return false;

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          const idx = text.indexOf(${JSON.stringify(placeholder)});
          if (idx !== -1) {
            node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + ${placeholder.length});
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
          }
        }
        return false;
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  return result.result.value;
}

async function pressDeleteKey(session: ChromeSession): Promise<void> {
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
}

export async function postArticle(options: ArticleOptions): Promise<void> {
  const { title, content, htmlFile, markdownFile, theme, author, summary, images = [], submit = false, profileDir, cookieFile, noSummary } = options;
  let { contentImages = [] } = options;
  let effectiveTitle = title || '';
  let effectiveAuthor = author || '';
  let effectiveSummary = summary || '';
  if (noSummary) effectiveSummary = '';
  let effectiveHtmlFile = htmlFile;

  if (markdownFile) {
    console.log(`[wechat] Parsing markdown: ${markdownFile}`);
    const parsed = await parseMarkdownWithPlaceholders(markdownFile, theme);
    effectiveTitle = effectiveTitle || parsed.title;
    effectiveAuthor = effectiveAuthor || parsed.author;
    if (!noSummary) effectiveSummary = effectiveSummary || parsed.summary;
    // If htmlFile is provided, prefer it (e.g., fixed path), but keep parsed images
    effectiveHtmlFile = htmlFile && fs.existsSync(htmlFile) ? htmlFile : parsed.htmlPath;
    contentImages = parsed.contentImages;
    console.log(`[wechat] Title: ${effectiveTitle || '(empty)'}`);
    console.log(`[wechat] Author: ${effectiveAuthor || '(empty)'}`);
    console.log(`[wechat] Summary: ${effectiveSummary || '(empty)'}`);
    console.log(`[wechat] Found ${contentImages.length} images to insert`);
  } else if (htmlFile && fs.existsSync(htmlFile)) {
    console.log(`[wechat] Parsing HTML: ${htmlFile}`);
    const meta = parseHtmlMeta(htmlFile);
    effectiveTitle = effectiveTitle || meta.title;
    effectiveAuthor = effectiveAuthor || meta.author;
    if (!noSummary) effectiveSummary = effectiveSummary || meta.summary;
    effectiveHtmlFile = htmlFile;
    console.log(`[wechat] Title: ${effectiveTitle || '(empty)'}`);
    console.log(`[wechat] Author: ${effectiveAuthor || '(empty)'}`);
    console.log(`[wechat] Summary: ${effectiveSummary || '(empty)'}`);
  }

  if (effectiveTitle && effectiveTitle.length > 64) throw new Error(`Title too long: ${effectiveTitle.length} chars (max 64)`);
  if (!content && !effectiveHtmlFile) throw new Error('Either --content, --html, or --markdown is required');

  const { cdp, chrome } = await launchChrome(WECHAT_URL, profileDir);

  try {
    console.log('[wechat] Waiting for page load...');
    await sleep(3000);

    let session = await getPageSession(cdp, 'mp.weixin.qq.com');

    if (cookieFile && fs.existsSync(cookieFile)) {
      try {
        const cookies = parseNetscapeCookies(fs.readFileSync(cookieFile, 'utf-8'));
        console.log(`[wechat] Applying cookies from ${cookieFile}...`);
        await applyCookies(cdp, cookies);
        await sleep(1000);
        await cdp.send('Page.navigate', { url: 'https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN' }, { sessionId: session.sessionId });
        await sleep(3000);
      } catch (e) {
        console.error('[wechat] Failed to apply cookies, fallback to QR login.');
      }
    }

    const url = await evaluate<string>(session, 'window.location.href');
    if (!(url.includes('/cgi-bin/home') || url.includes('/cgi-bin/appmsg') || url.includes('appmsg_edit'))) {
      console.log('[wechat] Not logged in. Please scan QR code...');
      const loggedIn = await waitForLogin(session);
      if (!loggedIn) throw new Error('Login timeout');
    }
    console.log('[wechat] Logged in.');
    await sleep(2000);

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    const initialIds = new Set(targets.targetInfos.map(t => t.targetId));

    let editorTargetId: string | null = null;
    try {
      await clickMenuByText(session, '文章');
      await sleep(3000);
      editorTargetId = await waitForNewTab(cdp, initialIds, 'mp.weixin.qq.com');
      console.log('[wechat] Editor tab opened.');
    } catch (e) {
      console.warn('[wechat] Menu "文章" not found; trying existing editor tab...');
      const targetsNow = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
      const candidate = targetsNow.targetInfos.find(t => t.url.includes('appmsg_edit') || t.url.includes('cgi-bin/appmsg'));
      if (candidate) {
        editorTargetId = candidate.targetId;
        console.log('[wechat] Reusing existing editor tab.');
      } else {
        throw e;
      }
    }

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: editorTargetId, flatten: true });
    session = { cdp, sessionId, targetId: editorTargetId };

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });
    await cdp.send('DOM.enable', {}, { sessionId });

    await sleep(3000);

    try {
      const editUrl = await evaluate<string>(session, 'window.location.href');
      const outPath = '/home/fei/clawd/.tmp/wechat-edit-url.txt';
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, editUrl, 'utf8');
      console.log(`[wechat] Edit URL saved: ${outPath}`);
    } catch (e) {
      console.warn('[wechat] Failed to save edit URL.');
    }

    if (effectiveTitle) {
      console.log('[wechat] Filling title...');
      await evaluate(session, `document.querySelector('#title').value = ${JSON.stringify(effectiveTitle)}; document.querySelector('#title').dispatchEvent(new Event('input', { bubbles: true }));`);
    }

    if (effectiveAuthor) {
      console.log('[wechat] Filling author...');
      await evaluate(session, `document.querySelector('#author').value = ${JSON.stringify(effectiveAuthor)}; document.querySelector('#author').dispatchEvent(new Event('input', { bubbles: true }));`);
    }

    console.log('[wechat] Clicking on editor...');
    await clickElement(session, '.ProseMirror');
    await sleep(500);

    if (effectiveHtmlFile && fs.existsSync(effectiveHtmlFile)) {
      console.log(`[wechat] Copying HTML content from: ${effectiveHtmlFile}`);
      await copyHtmlFromBrowser(cdp, effectiveHtmlFile);
      await sleep(500);
      console.log('[wechat] Pasting into editor...');
      await pasteFromClipboardInEditor();
      await sleep(3000);

      if (contentImages.length > 0) {
        console.log(`[wechat] Inserting ${contentImages.length} images...`);
        for (let i = 0; i < contentImages.length; i++) {
          const img = contentImages[i]!;
          console.log(`[wechat] [${i + 1}/${contentImages.length}] Processing: ${img.placeholder}`);

          const found = await selectAndReplacePlaceholder(session, img.placeholder);
          if (!found) {
            console.warn(`[wechat] Placeholder not found: ${img.placeholder}`);
            continue;
          }

          await sleep(500);

          console.log(`[wechat] Copying image: ${path.basename(img.localPath)}`);
          await copyImageToClipboard(img.localPath);
          await sleep(300);

          console.log('[wechat] Deleting placeholder with Backspace...');
          await pressDeleteKey(session);
          await sleep(200);

          console.log('[wechat] Pasting image...');
          await pasteFromClipboardInEditor();
          await sleep(3000);
        }
        console.log('[wechat] All images inserted.');
      }
    } else if (content) {
      for (const img of images) {
        if (fs.existsSync(img)) {
          console.log(`[wechat] Pasting image: ${img}`);
          await copyImageToClipboard(img);
          await sleep(500);
          await pasteInEditor(session);
          await sleep(2000);
        }
      }

      console.log('[wechat] Typing content...');
      await typeText(session, content);
      await sleep(1000);
    }

    if (effectiveSummary) {
      console.log(`[wechat] Filling summary: ${effectiveSummary}`);
      await evaluate(session, `document.querySelector('#js_description').value = ${JSON.stringify(effectiveSummary)}; document.querySelector('#js_description').dispatchEvent(new Event('input', { bubbles: true }));`);
    } else {
      console.log('[wechat] Summary skipped.');
    }

    console.log('[wechat] Saving as draft...');
    await evaluate(session, `document.querySelector('#js_submit button').click()`);
    await sleep(3000);

    const saved = await evaluate<boolean>(session, `!!document.querySelector('.weui-desktop-toast')`);
    if (saved) {
      console.log('[wechat] Draft saved successfully!');
    } else {
      console.log('[wechat] Waiting for save confirmation...');
      await sleep(5000);
    }

    console.log('[wechat] Draft saved. Closing browser...');
  } finally {
    cdp.close();
    if (chrome && !chrome.killed) {
      chrome.kill();
      console.log('[wechat] Browser closed.');
    }
  }
}

function printUsage(): never {
  console.log(`Post article to WeChat Official Account

Usage:
  npx -y bun wechat-article.ts [options]

Options:
  --title <text>     Article title (auto-extracted from markdown)
  --content <text>   Article content (use with --image)
  --html <path>      HTML file to paste (alternative to --content)
  --markdown <path>  Markdown file to convert and post (recommended)
  --theme <name>     Theme for markdown (default, grace, simple)
  --author <name>    Author name (default: 宝玉)
  --summary <text>   Article summary
  --no-summary       Skip filling summary field
  --image <path>     Content image, can repeat (only with --content)
  --submit           Save as draft
  --profile <dir>    Chrome profile directory
  --cookie <file>    Netscape cookies.txt for login

Examples:
  npx -y bun wechat-article.ts --markdown article.md
  npx -y bun wechat-article.ts --markdown article.md --theme grace --submit
  npx -y bun wechat-article.ts --title "标题" --content "内容" --image img.png
  npx -y bun wechat-article.ts --title "标题" --html article.html --submit

Markdown mode:
  Images in markdown are converted to placeholders. After pasting HTML,
  each placeholder is selected, scrolled into view, deleted, and replaced
  with the actual image via paste.
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  const images: string[] = [];
  let title: string | undefined;
  let content: string | undefined;
  let htmlFile: string | undefined;
  let markdownFile: string | undefined;
  let theme: string | undefined;
  let author: string | undefined;
  let summary: string | undefined;
  let submit = false;
  let profileDir: string | undefined;
  let cookieFile: string | undefined;
  let noSummary = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--title' && args[i + 1]) title = args[++i];
    else if (arg === '--content' && args[i + 1]) content = args[++i];
    else if (arg === '--html' && args[i + 1]) htmlFile = args[++i];
    else if (arg === '--markdown' && args[i + 1]) markdownFile = args[++i];
    else if (arg === '--theme' && args[i + 1]) theme = args[++i];
    else if (arg === '--author' && args[i + 1]) author = args[++i];
    else if (arg === '--summary' && args[i + 1]) summary = args[++i];
    else if (arg === '--image' && args[i + 1]) images.push(args[++i]!);
    else if (arg === '--submit') submit = true;
    else if (arg === '--profile' && args[i + 1]) profileDir = args[++i];
    else if (arg === '--cookie' && args[i + 1]) cookieFile = args[++i];
    else if (arg === '--no-summary') noSummary = true;
  }

  if (!markdownFile && !htmlFile && !title) { console.error('Error: --title is required (or use --markdown/--html)'); process.exit(1); }
  if (!markdownFile && !htmlFile && !content) { console.error('Error: --content, --html, or --markdown is required'); process.exit(1); }

  await postArticle({ title: title || '', content, htmlFile, markdownFile, theme, author, summary, images, submit, profileDir, cookieFile, noSummary });
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
