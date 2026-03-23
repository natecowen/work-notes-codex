import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./config.js";
import { writeText } from "./files.js";

test("loadConfig accepts section metadata and normalizes structures", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-config-"));
  await writeText(
    path.join(cwd, "config", "config.yaml"),
    `version: 1
paths:
  daily_notes_dir: notes/daily
  weekly_notes_dir: notes/weekly
  monthly_notes_dir: notes/monthly
  templates_dir: templates
  drafts_dir: drafts
  reports_dir: reports
  cache_dir: cache
llm:
  provider: ollama
  model: llama3.1:8b
  temperature: 0.1
  max_tokens: 1600
voice:
  mode: facts_only
  style_profile_from_samples: false
categories:
  - Top Outcomes
attendance:
  workdays_only: true
  values: [office, wfh, holiday, sick, vacation]
  missing_policy: warn
tasks:
  carry_forward_enabled: true
  open_marker: "[ ]"
  done_marker: "[x]"
tags:
  enabled: true
  input_mode: frontmatter_or_inline
weekly:
  sections:
    - id: tasks_last_week
      label: Carry Forward
      type: bullet_list
      placeholder: "{{TASKS_FROM_LAST_WEEK}}"
      source: carry_forward_tasks
      required: true
`
  );

  const config = await loadConfig(cwd);
  assert.equal(config.weekly?.sections[0].label, "Carry Forward");
  assert.ok((config.daily?.sections.length ?? 0) > 0);
  assert.ok((config.monthly?.sections.length ?? 0) > 0);
});

test("loadConfig rejects duplicate placeholders in managed sections", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-config-"));
  await writeText(
    path.join(cwd, "config", "config.yaml"),
    `version: 1
paths:
  daily_notes_dir: notes/daily
  weekly_notes_dir: notes/weekly
  monthly_notes_dir: notes/monthly
  templates_dir: templates
  drafts_dir: drafts
  reports_dir: reports
  cache_dir: cache
llm:
  provider: ollama
  model: llama3.1:8b
  temperature: 0.1
  max_tokens: 1600
voice:
  mode: facts_only
  style_profile_from_samples: false
categories:
  - Top Outcomes
attendance:
  workdays_only: true
  values: [office, wfh, holiday, sick, vacation]
  missing_policy: warn
tasks:
  carry_forward_enabled: true
  open_marker: "[ ]"
  done_marker: "[x]"
tags:
  enabled: true
  input_mode: frontmatter_or_inline
weekly:
  sections:
    - id: a
      label: A
      type: bullet_list
      placeholder: "{{DUPLICATE}}"
      source: one
    - id: b
      label: B
      type: bullet_list
      placeholder: "{{DUPLICATE}}"
      source: two
`
  );

  await assert.rejects(() => loadConfig(cwd), /duplicate placeholder/i);
});
