# WeChat Draftbox Automation (Playwright + Cookie Injection)

Goal: on a headless server, automate the full pipeline for WeChat Official Account:

- (A) Upload images to 素材库 → 图片
- (B) Create a new article, paste content, insert images, and save to 草稿箱

This workflow was built because the server has **no GUI desktop**, so Chrome-CDP scripts may be less reliable.

## Security

- Cookies are equivalent to login credentials.
- Treat cookie files as secrets; avoid committing them to git.
- After use, consider invalidating sessions via WeChat backend logout.

## Prerequisites

- Node.js + Playwright installed (Chromium)
- A valid WeChat Official Account cookie export (Netscape cookies.txt)
  - Domain: `mp.weixin.qq.com` (and some `.qq.com` cookies)

## Scripts

All scripts live in `scripts/`:

- `scripts/wechat-upload-images.mjs`
  - Upload 1–9 images to 素材库 → 图片
  - Uses cookie injection + Playwright (headless)

- `scripts/wechat-draft-with-images.mjs`
  - Create a new article, fill body, insert images from material library, save to draftbox
  - Uses cookie injection + Playwright (headless)

## Usage

### Upload images

```bash
node scripts/wechat-upload-images.mjs \
  --cookie /path/to/wechat-cookies.txt \
  --image /abs/path/to/cover.png \
  --image /abs/path/to/illus-1.png \
  --image /abs/path/to/illus-2.png \
  --out .tmp/wechat-upload
```

### Create draft and insert images

```bash
node scripts/wechat-draft-with-images.mjs \
  --md content/drafts/<article>.md \
  --cookie /path/to/wechat-cookies.txt \
  --out .tmp/wechat-draft \
  --illus1 illus-1-loop.png \
  --illus2 illus-2-memory.png
```

Artifacts:
- Screenshots are written into the `--out` directory for audit/debug.

## Notes / Known issues

- The editor DOM changes frequently. Prefer robust selectors:
  - Main body editor: `.ProseMirror[contenteditable=true]`
- Image insertion can be flaky (dropdown menus, dialogs, truncated filenames).
  - Prefer selecting images from "最近使用" rather than matching long filenames.
- Cover selection automation is not implemented yet; currently we insert body images and save.

## TODO

- Make cover/illustration filenames meaningful before upload (avoid generic `cover.png`).
- Promote these scripts into a stable skill (or integrate with `baoyu-post-to-wechat`).
