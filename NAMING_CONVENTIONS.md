# 文件命名规范 / File Naming Conventions

## 核心规则 / Core Rules

**所有生成的文件名必须使用英文。**
**All generated file names MUST use English.**

---

## 文件命名规则 / Naming Rules

### 1. 基本要求 / Basic Requirements

- ✅ **使用英文** / Use English
- ✅ **使用小写字母** / Use lowercase letters
- ✅ **使用连字符分隔单词** / Use hyphens to separate words
- ✅ **保持简洁但有意义** / Keep it concise but meaningful
- ❌ **禁止使用中文** / No Chinese characters
- ❌ **禁止使用空格** / No spaces
- ❌ **禁止使用下划线** / No underscores (use hyphens instead)

### 2. 文件命名格式 / File Naming Format

```
<topic-keywords>.md
```

**示例 / Examples:**

```
✅ good-naming-examples.md
✅ ai-coding-practices.md
✅ productivity-and-opportunities.md
✅ three-useless-projects.md

❌ 生产力大爆发-程序员的机会.md
❌ ai-coding-agent-三个没用的小项目.md
❌ My Article.md
❌ article_draft.md
```

### 3. 特定目录规则 / Directory-Specific Rules

#### content/ideas/
- 用简短关键词描述想法 / Use short keywords to describe the idea
- 例如 / Examples: `ai-tools-comparison.md`, `workflow-optimization.md`

#### content/outlines/
- 与草稿文件名保持一致 / Match the corresponding draft filename
- 例如 / Examples: `productivity-boom.md`, `learning-ai-coding.md`

#### content/drafts/
- 反映文章核心主题 / Reflect the core topic of the article
- 3-6 个单词为宜 / 3-6 words recommended
- 例如 / Examples: `programmers-in-ai-era.md`, `my-three-failed-projects.md`

#### content/published/
- 通常保持草稿文件名 / Usually keep the draft filename
- 可以根据发布标题微调 / May adjust based on final title

---

## 文件命名流程 / Naming Workflow

### 在创建文件时 / When Creating Files

1. **分析文章主题** / Analyze the article topic
2. **提取核心关键词** / Extract core keywords
3. **将关键词翻译为英文** / Translate keywords to English
4. **用连字符连接** / Connect with hyphens
5. **确保文件名语义清晰** / Ensure semantic clarity

### 示例转换 / Example Conversions

| 中文标题 / Chinese Title | 文件名 / Filename |
|------------------------|------------------|
| 生产力大爆发，程序员的机会在哪里？ | `productivity-boom-programmers-opportunity.md` |
| 我用 AI Coding Agent 做了三个"没用"的小项目 | `three-useless-ai-projects.md` |
| 我为什么开始做 AI 实践记录 | `why-ai-practice-log.md` |
| 我是如何把工作经验，沉淀成 Codex CLI Skills 的 | `work-experience-to-codex-skills.md` |

---

## Agent 执行规则 / Agent Execution Rules

### write-article skill 必须遵守 / write-article skill MUST:

1. **在 Phase 3 (Task Breakdown) 阶段提议英文文件名**
   Propose English filenames during Phase 3 (Task Breakdown)

2. **向用户说明文件命名逻辑**
   Explain the filename logic to the user

3. **等待用户确认文件名**
   Wait for user confirmation of the filename

4. **只有在用户确认后才创建文件**
   Only create files after user confirmation

### 文件命名提议格式 / Filename Proposal Format

```markdown
基于文章标题「<中文标题>」，我建议使用以下文件名：

- Outline: `content/outlines/<english-slug>.md`
- Draft: `content/drafts/<english-slug>.md`

文件命名逻辑：<解释为什么选择这个英文名称>

是否确认使用此文件名？
```

---

## 迁移已有文件 / Migrating Existing Files

### 可选操作 / Optional Action

对于已经存在的中文文件名，可以选择：

1. **保持原样** / Keep as-is (不影响已发布内容 / doesn't affect published content)
2. **逐步迁移** / Gradual migration (在编辑时重命名 / rename during editing)
3. **批量重命名** / Batch rename (需要手动执行 / requires manual execution)

**注意**：重命名已发布文件可能影响外部链接。
**Note**: Renaming published files may affect external links.

---

## 为什么使用英文文件名？ / Why English Filenames?

1. **跨平台兼容性** / Cross-platform compatibility
   - 避免编码问题 / Avoid encoding issues
   - 在所有操作系统上工作良好 / Works well on all operating systems

2. **Git 友好** / Git-friendly
   - 更好的版本控制显示 / Better version control display
   - 避免终端显示问题 / Avoid terminal display issues

3. **URL 友好** / URL-friendly
   - 如果文件名用于生成 URL / If filenames are used to generate URLs
   - 更好的 SEO / Better SEO

4. **协作友好** / Collaboration-friendly
   - 便于国际化协作 / Easier for international collaboration
   - 减少歧义 / Reduce ambiguity

---

## 总结 / Summary

**一句话原则：文件名全英文，单词用连字符分隔，保持语义清晰。**

**One-sentence rule: All filenames in English, words separated by hyphens, semantically clear.**
