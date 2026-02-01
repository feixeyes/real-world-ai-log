import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  ChromeSession,
  evaluate,
  getDefaultProfileDir,
  getPageSession,
  launchChrome,
  sleep,
} from '../../baoyu-post-to-wechat/scripts/cdp.ts';

const WECHAT_URL = 'https://mp.weixin.qq.com/';
const IMAGE_INPUT_SELECTORS = [
  'input[type=file][accept*="image"]',
  'input[type=file][accept*="png"]',
  'input[type=file][accept*="jpg"]',
  '.js_upload_btn_container input[type=file]',
  'input[type=file]',
];
const MAX_IMAGES = 9;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);

interface UploadArgs {
  files: string[];
  dirs: string[];
  keepOpen: boolean;
  profileDir?: string;
}

function collectImagePaths(files: string[], dirs: string[]): string[] {
  const output = new Set<string>();

  const addIfImage = (fp: string): void => {
    const full = path.isAbsolute(fp) ? fp : path.resolve(process.cwd(), fp);
    if (!fs.existsSync(full)) throw new Error(`Path not found: ${fp}`);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(full);
      for (const entry of entries) {
        addIfImage(path.join(full, entry));
      }
      return;
    }
    if (!stat.isFile()) return;
    const ext = path.extname(full).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) output.add(full);
  };

  for (const file of files) addIfImage(file);
  for (const dir of dirs) addIfImage(dir);

  const ordered = Array.from(output).sort();
  if (ordered.length === 0) throw new Error('No image files detected.');
  if (ordered.length > MAX_IMAGES) throw new Error(`Too many images: ${ordered.length}. Max ${MAX_IMAGES}.`);
  return ordered;
}

async function getCurrentUrl(session: ChromeSession): Promise<string> {
  return evaluate<string>(session, 'window.location.href');
}

async function ensureLoggedIn(session: ChromeSession, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await getCurrentUrl(session);
    if (url.includes('/cgi-bin/home')) return;
    await sleep(2000);
  }
  throw new Error('Login timeout. Please log into WeChat in the opened browser window.');
}

async function extractToken(session: ChromeSession): Promise<string | null> {
  const url = await getCurrentUrl(session);
  const match = url.match(/token=([0-9a-zA-Z]+)/);
  return match ? match[1] : null;
}

async function waitForLocation(session: ChromeSession, keyword: string, timeoutMs = 20_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await getCurrentUrl(session);
    if (url.includes(keyword)) return true;
    await sleep(1000);
  }
  return false;
}

async function clickByText(session: ChromeSession, text: string, options?: { partial?: boolean; timeoutMs?: number }): Promise<void> {
  const { partial = false, timeoutMs = 15_000 } = options ?? {};
  const target = text.trim();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const clicked = await evaluate<boolean>(session, `
      (() => {
        const target = ${JSON.stringify(target)};
        const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
        for (const node of nodes) {
          if (!(node instanceof HTMLElement)) continue;
          const label = (node.innerText || node.textContent || '').trim();
          if (!label) continue;
          const match = ${partial ? 'label.includes(target)' : 'label === target'};
          if (match) {
            node.click();
            return true;
          }
        }
        return false;
      })()
    `);
    if (clicked) return;
    await sleep(1000);
  }

  throw new Error(`Failed to find element with text: ${text}`);
}

async function navigateToMaterialLibrary(session: ChromeSession): Promise<void> {
  const token = await extractToken(session);
  if (token) {
    const candidateUrls = [
      `https://mp.weixin.qq.com/cgi-bin/filepage?type=2&begin=0&count=24&t=media/img_list&lang=zh_CN&token=${token}`,
      `https://mp.weixin.qq.com/cgi-bin/filepage?type=2&t=media/list&token=${token}&lang=zh_CN`,
    ];
    for (const targetUrl of candidateUrls) {
      await evaluate(session, `window.location.href = ${JSON.stringify(targetUrl)};`);
      if (await waitForLocation(session, 'filepage?type=2', 10_000)) {
        // Wait for the page to fully render after navigation
        await sleep(3000);
        return;
      }
    }
  }

  await clickByText(session, '素材库', { partial: false, timeoutMs: 20_000 });
  await sleep(3000);
  await clickByText(session, '图片', { partial: false, timeoutMs: 10_000 }).catch(async () => {
    await clickByText(session, '上传图片', { partial: true, timeoutMs: 5_000 }).catch(() => undefined);
  });
  await waitForLocation(session, 'type=2', 10_000);
  // Wait for the page to fully render
  await sleep(3000);
}

async function clickUploadButton(session: ChromeSession): Promise<void> {
  // Try to click the "上传图片" button to reveal the file input
  const clicked = await evaluate<boolean>(session, `
    (() => {
      // Strategy 1: Look for a button/link with text "上传图片"
      const nodes = Array.from(document.querySelectorAll('a, button, span, div, input[type=button]'));
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const label = (node.innerText || node.textContent || '').trim();
        if (label.includes('上传图片') || label.includes('上传')) {
          node.click();
          return true;
        }
      }
      // Strategy 2: Look for elements with upload-related class names
      const uploadBtns = document.querySelectorAll('[class*="upload"], [class*="Upload"], [class*="add_img"], [class*="add-img"]');
      for (const btn of uploadBtns) {
        if (btn instanceof HTMLElement && btn.offsetParent !== null) {
          btn.click();
          return true;
        }
      }
      return false;
    })()
  `);
  if (clicked) {
    console.log('[wechat] Clicked upload button, waiting for file input...');
    await sleep(2000);
  }
}

async function findFileInputSelector(session: ChromeSession): Promise<string | null> {
  return evaluate<string | null>(session, `
    (() => {
      const selectors = ${JSON.stringify(IMAGE_INPUT_SELECTORS)};
      for (const sel of selectors) {
        const input = document.querySelector(sel);
        if (input) return sel;
      }
      return null;
    })()
  `);
}

async function debugPageState(session: ChromeSession): Promise<void> {
  const info = await evaluate<string>(session, `
    (() => {
      const url = window.location.href;
      const fileInputs = document.querySelectorAll('input[type=file]');
      const inputDetails = Array.from(fileInputs).map(el => ({
        accept: el.getAttribute('accept'),
        name: el.getAttribute('name'),
        id: el.id,
        className: el.className,
        parentClass: el.parentElement?.className || '',
        display: getComputedStyle(el).display,
      }));
      return JSON.stringify({ url, fileInputCount: fileInputs.length, inputs: inputDetails }, null, 2);
    })()
  `);
  console.log('[wechat] Page state:', info);
}

async function ensureUploadInput(session: ChromeSession): Promise<number> {
  // First, check if file input already exists
  let matchedSelector = await findFileInputSelector(session);

  // If not found, try clicking the upload button
  if (!matchedSelector) {
    await clickUploadButton(session);
    matchedSelector = await findFileInputSelector(session);
  }

  // Retry loop with periodic upload button clicks
  for (let attempt = 0; attempt < 15; attempt++) {
    if (matchedSelector) {
      // Make it visible and get nodeId
      await evaluate(session, `
        (() => {
          const input = document.querySelector(${JSON.stringify(matchedSelector)});
          if (input) input.style.display = 'block';
        })()
      `);
      const documentNode = await session.cdp.send<{ root: { nodeId: number } }>('DOM.getDocument', { depth: -1 }, { sessionId: session.sessionId });
      const queryResult = await session.cdp.send<{ nodeId: number }>('DOM.querySelector', {
        nodeId: documentNode.root.nodeId,
        selector: matchedSelector,
      }, { sessionId: session.sessionId });
      if (queryResult.nodeId) return queryResult.nodeId;
    }

    // Every 3 attempts, try clicking the upload button again
    if (attempt > 0 && attempt % 3 === 0) {
      console.log('[wechat] Retrying upload button click...');
      await clickUploadButton(session);
    }

    await sleep(1000);
    matchedSelector = await findFileInputSelector(session);
  }

  // Final diagnostic before failing
  await debugPageState(session);
  throw new Error('Upload input not found on the page.');
}

async function uploadImages(session: ChromeSession, images: string[]): Promise<void> {
  const nodeId = await ensureUploadInput(session);
  await session.cdp.send('DOM.setFileInputFiles', { files: images, nodeId }, { sessionId: session.sessionId });
  console.log(`[wechat] Selected ${images.length} image(s) for upload.`);
  await sleep(12_000);
  console.log('[wechat] Upload workflow complete.');
}

async function run({ files, dirs, keepOpen, profileDir }: UploadArgs): Promise<void> {
  const images = collectImagePaths(files, dirs);
  console.log('[wechat] Images:');
  images.forEach((img) => console.log(` - ${img}`));

  const resolvedProfile = profileDir ?? getDefaultProfileDir();
  const { cdp, chrome } = await launchChrome(WECHAT_URL, resolvedProfile);
  try {
    const session = await getPageSession(cdp, 'mp.weixin.qq.com');
    console.log('[wechat] Waiting for login...');
    await ensureLoggedIn(session);
    console.log('[wechat] Logged in. Navigating to 素材库 → 图片 ...');
    await navigateToMaterialLibrary(session);
    await uploadImages(session, images);
    if (!keepOpen) {
      console.log('[wechat] Closing Chrome.');
      chrome.kill();
      cdp.close();
    } else {
      console.log('[wechat] Browser left open for manual review. Close it manually when finished.');
    }
  } catch (err) {
    chrome.kill();
    cdp.close();
    throw err;
  }
}

function printHelp(): void {
  console.log(`Upload images to WeChat 素材库 (图片) using Chrome CDP automation.

Usage:
  npx -y bun scripts/wechat-material-upload.ts --image path.png [--dir ./images] [--keep-open]

Options:
  --image <path>   Add an individual image file (max ${MAX_IMAGES} total)
  --dir <path>     Recursively include images under a directory
  --keep-open      Leave Chrome open after upload (default: close)
  --help           Show this message
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const files: string[] = [];
  const dirs: string[] = [];
  let keepOpen = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--image' && args[i + 1]) {
      files.push(args[++i]!);
    } else if (arg === '--dir' && args[i + 1]) {
      dirs.push(args[++i]!);
    } else if (arg === '--keep-open') {
      keepOpen = true;
    }
  }

  if (files.length === 0 && dirs.length === 0) {
    console.error('Error: provide at least one --image or --dir.');
    process.exit(1);
  }

  await run({ files, dirs, keepOpen });
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
