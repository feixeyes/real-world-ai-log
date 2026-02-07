# WeChat Publishing Checklist (Current)

> This is the fixed, agreed workflow. Update only when the user confirms a change.

## 0) Guardrails
- **Outline requires explicit confirmation.**
- **All generated files** (drafts/images/summaries/etc.) **must be sent to the user**.
- Filenames: **English, lowercase, hyphenated**.
- Tone: practice‑first, non‑authoritative, iterative.
- **Do not fill the WeChat summary field** (摘要字段留空).
- Current scope: **save article + upload images to material library** (no body image insertion unless user asks).

---

## 1) Writing Pipeline
1. **Idea** → `content/ideas/`
2. **Outline** → `content/outlines/` (wait for user confirmation)
3. **Draft** → `content/drafts/`
4. **Publish** → `content/published/`

---

## 2) Image Pipeline
1. Generate **cover + illustrations** (store prompts alongside images)
2. Upload to **WeChat material library**
3. **Do not insert into body** unless the user explicitly requests

---

## 3) WeChat Draft (Format‑First)
- Use **CDP** to paste HTML (Markdown → themed HTML → paste)
- Save as draft
- Skip summary field
- Record the **editor URL** to `/home/fei/clawd/.tmp/wechat-edit-url.txt` for follow‑ups

---

## 4) Automation Notes
- Headless server uses **Xvfb + noVNC** for login/clipboard needs
- Login may expire; manual scan may be required
- Prefer **stability over full automation**

---

## 5) When User Asks to Insert Images
- Use Playwright material‑library picker
- If needed, use the editor URL saved at:
  - `/home/fei/clawd/.tmp/wechat-edit-url.txt`
