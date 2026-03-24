import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AppConfig } from "../types.js";
import { parseDailyMarkdown } from "./markdown.js";
import { createDailyFile } from "./scaffold.js";
import { writeText } from "./files.js";

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

test("createDailyFile emits configured section labels so scaffolded notes remain parseable", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-scaffold-"));
  const config = testConfig();
  config.daily = {
    sections: [
      { id: "meetings", label: "Collaborators", type: "bullet_list" },
      {
        id: "work",
        label: "Delivered Work",
        type: "categorized_list",
        categories: [{ id: "platform", label: "Platform" }]
      },
      { id: "notes", label: "Scratchpad", type: "free_text" },
      { id: "tasks_tomorrow", label: "Next Actions", type: "bullet_list" }
    ]
  };

  await writeText(
    path.join(cwd, "templates", "daily.md"),
    `---
date: {{DATE}}
attendance: office
approved: false
---

# Day: {{DATE}}

{{SECTION id="meetings" label=true heading_level=2}}:
- Team sync

{{SECTION id="work" label=true heading_level=2}}:
### Platform:
- Shipped the rollout

{{SECTION id="notes" label=true heading_level=2}}:
- Captured context

{{SECTION id="tasks_tomorrow" label=true heading_level=2}}:
- [ ] Follow up with infra
`
  );

  const result = await createDailyFile(cwd, config, "2026-03-20");
  const output = await readFile(result.path, "utf8");
  const parsed = parseDailyMarkdown(result.path, output, config);

  assert.match(output, /Collaborators:/);
  assert.match(output, /Delivered Work:/);
  assert.match(output, /Scratchpad:/);
  assert.match(output, /Next Actions:/);
  assert.match(output, /## Collaborators:/);
  assert.match(output, /## Delivered Work:/);
  assert.match(output, /### Platform:/);
  assert.doesNotMatch(output, /- Platform:/);
  assert.deepEqual(parsed.meetings, ["Team sync"]);
  assert.deepEqual(parsed.workLines, ["Shipped the rollout"]);
  assert.deepEqual(parsed.notesLines, ["- Captured context"]);
  assert.deepEqual(parsed.tasksOpen, ["Follow up with infra"]);
});

test("createDailyFile leaves free-text notes sections empty by default", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-scaffold-empty-notes-"));
  const config = testConfig();

  await writeText(
    path.join(cwd, "templates", "daily.md"),
    `---
date: {{DATE}}
attendance: office
approved: false
---

# Day: {{DATE}}

{{SECTION id="meetings" label=true heading_level=2}}:
{{SECTION id="meetings"}}

{{SECTION id="notes" label=true heading_level=2}}
{{SECTION id="notes"}}
`
  );

  const result = await createDailyFile(cwd, config, "2026-03-23");
  const output = await readFile(result.path, "utf8");
  const parsed = parseDailyMarkdown(result.path, output, config);

  assert.match(output, /## Notes\n$/);
  assert.deepEqual(parsed.notesLines, []);
});

test("createDailyFile forces nested work category headings below the work heading", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-scaffold-work-headings-"));
  const config = testConfig();
  config.daily = {
    sections: [
      { id: "meetings", label: "Meetings", type: "bullet_list" },
      {
        id: "work",
        label: "Work",
        type: "categorized_list",
        categories: [{ id: "platform", label: "Platform" }]
      },
      { id: "notes", label: "Notes", type: "free_text" },
      { id: "tasks_tomorrow", label: "Task list for tomorrow", type: "bullet_list" }
    ]
  };

  await writeText(
    path.join(cwd, "templates", "daily.md"),
    `---
date: {{DATE}}
attendance: office
approved: false
---

# Day: {{DATE}}

{{SECTION id="work" label=true heading_level=3}}
{{SECTION id="work" nested=true category_level=2}}
`
  );

  const result = await createDailyFile(cwd, config, "2026-03-23");
  const output = await readFile(result.path, "utf8");
  const completedOutput = output.replace("#### Platform:\n-\n", "#### Platform:\n- Shipped the rollout\n");
  const parsed = parseDailyMarkdown(result.path, completedOutput, config);

  assert.match(output, /### Work/);
  assert.match(output, /#### Platform:/);
  assert.deepEqual(parsed.workCategories, [{ category: "Platform", items: ["Shipped the rollout"] }]);
  assert.deepEqual(parsed.workLines, ["Shipped the rollout"]);
});
