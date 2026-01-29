# Changelog: File Naming Conventions

**Date**: 2026-01-29
**Change Type**: Infrastructure / Workflow Enhancement
**Status**: Ready for Review

---

## Summary

添加了全项目范围的文件命名规范，要求所有生成的文件名必须使用英文。

Added project-wide file naming conventions requiring all generated filenames to use English.

---

## Changes Made

### 1. New Documentation

#### `NAMING_CONVENTIONS.md` (NEW)
- Comprehensive file naming rules
- Examples of good vs bad filenames
- Conversion examples from Chinese to English
- Rationale for English-only filenames
- Migration guidance for existing files

**Key Rules:**
- ✅ All filenames in English
- ✅ Lowercase with hyphens
- ✅ 3-6 words recommended
- ❌ No Chinese characters
- ❌ No spaces or underscores

---

### 2. Core Documentation Updates

#### `README.md`
- Added reference to `NAMING_CONVENTIONS.md` in Repository Structure section
- Bilingual note about file naming requirements

#### `AGENTS.md`
- Added Rule 4: "Follow file naming conventions"
- Updated Context Intake to include `NAMING_CONVENTIONS.md`
- Updated Execution Phase to propose English filenames

---

### 3. Skills Updates

All three article writing skills have been updated:

#### `.claude/skills/write-article/SKILL.md`

**Phase 1 (Context Intake)**:
- Added `NAMING_CONVENTIONS.md` to required reading list

**Phase 3 (Task Breakdown)**:
- Added requirement to propose English filenames
- Added filename explanation requirement
- Added confirmation step for filenames

**Guardrails**:
- Added prohibition on Chinese characters in filenames
- Added requirement to propose filenames before file creation

---

#### `.claude/skills/outline-first/SKILL.md`

**Context Intake**:
- Added `NAMING_CONVENTIONS.md` to required reading

**Outline Creation**:
- Added filename proposal step with explanation
- Added filename confirmation requirement before file creation

**Guardrails**:
- Added filename-related restrictions

---

#### `.claude/skills/draft-write/SKILL.md`

**Preconditions Check**:
- Updated to expect English filenames

**Draft Execution**:
- Added filename confirmation step
- Updated file path format to use `<english-slug>`

**Guardrails**:
- Added requirement to follow `NAMING_CONVENTIONS.md`

---

## Workflow Impact

### Before This Change
1. User requests article creation
2. Agent proposes outline
3. Agent creates files with **Chinese filenames**
4. Files written to content/outlines/ and content/drafts/

### After This Change
1. User requests article creation
2. Agent proposes outline
3. **Agent proposes English filename with explanation**
4. **User confirms filename**
5. Agent creates files with **English filenames**
6. Files written to content/outlines/ and content/drafts/

---

## Example Filename Conversions

| Original Chinese Title | Proposed English Filename |
|------------------------|---------------------------|
| 生产力大爆发，程序员的机会在哪里？ | `productivity-boom-programmers-opportunity.md` |
| 我用 AI Coding Agent 做了三个"没用"的小项目 | `three-useless-ai-projects.md` |
| 我为什么开始做 AI 实践记录 | `why-ai-practice-log.md` |
| 沉淀工作经验为 Skills | `work-experience-to-skills.md` |

---

## Benefits

### 1. Cross-Platform Compatibility
- Avoids encoding issues across different operating systems
- Better display in terminals and Git tools

### 2. Git-Friendly
- Clearer version control logs
- No terminal encoding problems

### 3. URL-Friendly
- If filenames are used in URLs
- Better SEO potential

### 4. Collaboration-Friendly
- Easier for international collaboration
- Reduces ambiguity in file references

---

## Backward Compatibility

### Existing Files
- **Current Chinese-named files remain unchanged**
- No automatic migration required
- Users can optionally rename files during future edits

### Migration Strategy
Three options for existing files:
1. **Keep as-is** (recommended for published content)
2. **Gradual migration** (rename during next edit)
3. **Batch rename** (manual operation, check for external links first)

---

## Testing Recommendations

Before committing, test the workflow:

1. Launch write-article skill with a new topic
2. Verify agent reads `NAMING_CONVENTIONS.md`
3. Verify agent proposes English filename
4. Verify agent explains filename logic
5. Verify agent waits for confirmation
6. Verify files are created with correct English names

---

## Files Modified

```
Modified:
- AGENTS.md
- README.md
- .claude/skills/write-article/SKILL.md
- .claude/skills/outline-first/SKILL.md
- .claude/skills/draft-write/SKILL.md

New:
- NAMING_CONVENTIONS.md
- .docs/CHANGELOG-naming-conventions.md (this file)
```

---

## Commit Suggestion

```bash
git add NAMING_CONVENTIONS.md AGENTS.md README.md \
  .claude/skills/write-article/SKILL.md \
  .claude/skills/outline-first/SKILL.md \
  .claude/skills/draft-write/SKILL.md

git commit -m "feat: Add English-only file naming conventions

- Add NAMING_CONVENTIONS.md with comprehensive naming rules
- Update AGENTS.md to require English filenames
- Update README.md to reference naming conventions
- Update all article writing skills (write-article, outline-first, draft-write)
- Require filename proposal and confirmation before file creation
- Ensure cross-platform compatibility and Git-friendliness

All future generated files will use English lowercase-hyphen-separated names.
Existing files remain unchanged for backward compatibility.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Next Steps

1. Review all changes
2. Test the workflow with a new article
3. Commit changes to Git
4. Update any external documentation referencing file naming
5. Optionally plan migration of existing files

---

## Questions for Review

1. Should we migrate existing Chinese-named files immediately or gradually?
2. Should we add automated validation (e.g., pre-commit hook) to enforce English filenames?
3. Should we add filename naming patterns for other directories (research/, data/, etc.)?

---

**End of Changelog**
