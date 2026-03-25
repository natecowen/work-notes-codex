import assert from "node:assert/strict";
import test from "node:test";
import { parseDailyMarkdown } from "./markdown.js";
import type { AppConfig } from "../types.js";

function testConfig(): AppConfig {
  return {
    version: 1,
    paths: {
      daily_notes_dir: "daily",
      weekly_notes_dir: "weekly",
      monthly_notes_dir: "monthly",
      templates_dir: "templates",
      drafts_dir: "drafts",
      reports_dir: "reports",
      cache_dir: "cache"
    },
    llm: {
      provider: "ollama",
      model: "test-model",
      temperature: 0,
      max_tokens: 256
    },
    voice: {
      mode: "facts_only",
      style_profile_from_samples: false
    },
    categories: ["Development"],
    attendance: {
      workdays_only: true,
      values: ["office", "wfh", "holiday", "sick", "vacation"],
      missing_policy: "warn"
    },
    tasks: {
      carry_forward_enabled: true,
      open_marker: "[ ]",
      done_marker: "[x]"
    },
    tags: {
      enabled: false,
      input_mode: "frontmatter"
    },
    daily: {
      sections: [
        { id: "meetings", label: "Meetings", type: "bullet_list" },
        {
          id: "work",
          label: "Work",
          type: "categorized_list",
          categories: [
            { id: "development_coding", label: "Development/Coding" },
            { id: "architecture", label: "Architecture" },
            { id: "leadership_mentoring", label: "Leadership/Mentoring" },
            { id: "training_learning", label: "Training/Learning" },
            { id: "devops", label: "DevOps" },
            { id: "architecture_devops", label: "Architecture/Devops" },
            { id: "leadership_training", label: "Leadership/Training" },
            { id: "personal", label: "Personal" }
          ]
        },
        { id: "notes", label: "Notes", type: "free_text" },
        { id: "tasks_tomorrow", label: "Task list for tomorrow", type: "bullet_list" }
      ]
    }
  };
}

test("parseDailyMarkdown groups bullet-prefixed work categories from the daily template", () => {
  const parsed = parseDailyMarkdown(
    "/tmp/2026-03-20.md",
    `---
date: 2026-03-20
attendance: office
approved: false
---

# Day: 2026-03-20

Meetings:
- Standup

Work:
- Architecture/Devops:
  - Validated Quartz deployment.
  - Removed unused seasonal overrides from Branch consumer.
- Leadership/Training:
  - Helped Ben with Jira and GitHub integration.
- Personal:
  - Reviewed MISO resource rating documentation.

Notes:
Task list for tomorrow:
- [ ] Create Jira stories
`,
    testConfig()
  );

  assert.deepEqual(parsed.workLines, [
    "Validated Quartz deployment.",
    "Removed unused seasonal overrides from Branch consumer.",
    "Helped Ben with Jira and GitHub integration.",
    "Reviewed MISO resource rating documentation."
  ]);
  assert.deepEqual(parsed.workCategories, [
    {
      category: "Architecture/Devops",
      items: ["Validated Quartz deployment.", "Removed unused seasonal overrides from Branch consumer."]
    },
    {
      category: "Leadership/Training",
      items: ["Helped Ben with Jira and GitHub integration."]
    },
    {
      category: "Personal",
      items: ["Reviewed MISO resource rating documentation."]
    }
  ]);
});

test("parseDailyMarkdown treats markdown work headings without trailing colons as category boundaries", () => {
  const parsed = parseDailyMarkdown(
    "/tmp/2026-03-20.md",
    `---
date: 2026-03-20
attendance: office
approved: false
---

# Day: 2026-03-20

## Meetings:
- Standup

## Work:
### Development/Coding
- Cleaned and removed old unused logic in Branch consumer.

### Architecture
- Planned work and story creation for AAR pipeline changes.

### Leadership/Mentoring
- Met with Paul and Bryan to discuss open AAR questions.

## Notes:
- Captured context

## Task list for tomorrow:
- [ ] Create Jira stories
`,
    testConfig()
  );

  assert.deepEqual(parsed.workLines, [
    "Cleaned and removed old unused logic in Branch consumer.",
    "Planned work and story creation for AAR pipeline changes.",
    "Met with Paul and Bryan to discuss open AAR questions."
  ]);
  assert.deepEqual(parsed.workCategories, [
    {
      category: "Development/Coding",
      items: ["Cleaned and removed old unused logic in Branch consumer."]
    },
    {
      category: "Architecture",
      items: ["Planned work and story creation for AAR pipeline changes."]
    },
    {
      category: "Leadership/Mentoring",
      items: ["Met with Paul and Bryan to discuss open AAR questions."]
    }
  ]);
});

test("parseDailyMarkdown keeps bullets under unconfigured markdown work headings", () => {
  const parsed = parseDailyMarkdown(
    "/tmp/2026-03-20.md",
    `---
date: 2026-03-20
attendance: office
approved: false
---

# Day: 2026-03-20

## Meetings:
- Standup

## Work:
### Misc
- Investigated staging issue.

### Development/Coding
- Shipped the rollout.

## Notes:
- Captured context

## Task list for tomorrow:
- [ ] Create Jira stories
`,
    testConfig()
  );

  assert.deepEqual(parsed.workLines, ["Investigated staging issue.", "Shipped the rollout."]);
  assert.deepEqual(parsed.workCategories, [
    {
      category: "General",
      items: ["Investigated staging issue."]
    },
    {
      category: "Development/Coding",
      items: ["Shipped the rollout."]
    }
  ]);
});
