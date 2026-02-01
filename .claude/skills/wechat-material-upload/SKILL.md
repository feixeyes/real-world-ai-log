---
name: wechat-material-upload
description: Upload 1-9 images (files or directories) to the WeChat Official Account media library (素材库→图片) using the same Chrome CDP workflow as baoyu-post-to-wechat. Use when the user needs to push local images into the公众号素材库 with default watermark and close the browser afterward.
---

# WeChat Material Upload

Automate pushing image assets into the WeChat Official Account media library (素材库 → 图片). Uses the shared Chrome CDP launcher from `baoyu-post-to-wechat` (no `agent-browser` dependency needed).

## Script Directory

- Skill directory: `SKILL_DIR = <repo>/.claude/skills/wechat-material-upload`
- Main script: `${SKILL_DIR}/scripts/wechat-material-upload.ts`
- Runtime: `npx -y bun`

## Quick Start

```bash
npx -y bun ${SKILL_DIR}/scripts/wechat-material-upload.ts \
  --dir ./illustrations \
  --image cover.png
```

Behavior:
- Collects all supported images (png/jpg/jpeg/gif/bmp/webp) from `--image` paths and directories recursively (max 9 total)
- Prompts login if the WeChat session is expired
- Navigates to 素材库 → 图片 and uploads using the default watermark (WeChat setting)
- Waits for server completion and closes Chrome automatically (unless `--keep-open` is passed)

## CLI Options

| Flag | Description |
|------|-------------|
| `--image <path>` | Add a single image file (absolute or relative). Repeatable. |
| `--dir <path>` | Recursively include images under a directory. Repeatable. |
| `--keep-open` | Leave Chrome open after upload; default closes the browser. |
| `--help` | Print usage. |

Notes:
- Requires at least one `--image` or `--dir` argument.
- Total selected images must be between 1 and 9; script errors otherwise.
- Default WeChat watermark is used; no override available.
- Script closes the browser when uploads finish, satisfying the requirement to auto-close.

## Workflow

1. **Prepare assets**: Ensure target files live within the repository or accessible paths.
2. **Run script**: Use Bun via `npx` (repo already depends on Bun through other skills). Example: `npx -y bun ${SKILL_DIR}/scripts/wechat-material-upload.ts --dir cover-image/2025-02`.
3. **Login if needed**: Chrome opens; scan QR if session expired. Script waits up to ~90s.
4. **Upload confirmation**: Script logs successes; watch WeChat progress dialog for errors.
5. **Verify**: After Chrome closes, confirm in 素材库 that images exist (WeChat keeps the default watermark per account setting).

## Troubleshooting

- **Login timeout**: Script throws `Login timeout`. Re-run and scan QR quickly.
- **Upload selector missing**: The 页面 layout might change; inspect DOM and update `selector` constant within the script.
- **File limit exceeded**: Remove extra files or split into multiple runs.
- **Hidden input not clickable**: The script force-displays the input; if WeChat updates CSS, adjust the `eval` block near `selector` definition.

## Related Skills

- `baoyu-post-to-wechat`: Article posting automation. Use this current skill only for 素材库 uploads.
```
