# 微信公众号发布技能扩展配置

## 环境配置

- **DISPLAY**: :99 (Xvfb 虚拟显示)
- **Chrome**: `/usr/bin/chromium-browser` (snap 版本)
- **Chrome Profile**: `/home/fei/snap/chromium/common/chromium/Default`
- **调试端口**: 9222

## 使用方式

### 1. 启动 Chrome（保持登录状态）

```bash
DISPLAY=:99 /usr/bin/chromium-browser \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-test \
  --no-first-run \
  --no-default-browser-check \
  --disable-blink-features=AutomationControlled \
  --start-maximized \
  https://mp.weixin.qq.com/
```

### 2. 通过 novnc 登录

访问: http://服务器:6080/vnc.html

### 3. 发布文章

```bash
WECHAT_CDP_PORT=9222 \
DISPLAY=:99 \
WECHAT_BROWSER_CHROME_PATH=/usr/bin/chromium-browser \
npx -y bun scripts/wechat-article.ts \
  --markdown path/to/article.md \
  --theme grace
```

### 4. 跳过图片插入

图片占位符会保留在草稿中，手动替换：

```bash
# 添加 --skip-images 参数
npx -y bun scripts/wechat-article.ts \
  --markdown path/to/article.md \
  --theme grace \
  --skip-images
```

## 注意事项

1. **snap Chromium 文件访问限制**: HTML 文件需要复制到 `/home/fei/snap/chromium/common/chromium/Default/` 目录才能通过 file:// 协议访问
2. **登录状态持久化**: Chrome 使用 `--user-data-dir` 保存 cookies，下次启动使用相同目录即可保持登录
3. **图片占位符格式**: `[[IMAGE_PLACEHOLDER_1]]`, `[[IMAGE_PLACEHOLDER_2]]` 等
