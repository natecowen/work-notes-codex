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
