import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AppConfig } from "../types.js";
import { writeText } from "./files.js";
import { buildStyleProfile, toStyleInstruction } from "./style.js";

function testConfig(styleExampleLimit = 2): AppConfig {
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
      style_profile_from_samples: true,
      sample_dirs: ["samples"],
      profile_path: "cache/style-profile.json",
      style_example_limit: styleExampleLimit
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

test("style profile includes compact representative bullets as voice examples", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-style-"));
  await writeText(
    path.join(cwd, "samples", "2026-03-20-W12.md"),
    `---
approved: true
---

Key outcomes shipped/delivered:
- Delivered reporting updates that clarified weekly deployment status for release owners.
- None captured
- Office: 5
- [ ] Follow up with infra

Problems solved / fires prevented:
- Resolved flaky deploy behavior by tightening startup validation and logging.
- Partnered with QA to confirm release readiness without adding process overhead.
`
  );

  const profile = await buildStyleProfile(cwd, testConfig(2));
  const cached = await readFile(path.join(cwd, "cache", "style-profile.json"), "utf8");
  const instruction = toStyleInstruction(profile);

  assert.equal(profile.representativeBullets?.length, 2);
  assert.match(instruction, /Style examples from approved summaries/);
  assert.match(instruction, /Delivered reporting updates/);
  assert.doesNotMatch(instruction, /None captured/);
  assert.doesNotMatch(instruction, /Office: 5/);
  assert.doesNotMatch(instruction, /\[ \] Follow up with infra/);
  assert.match(cached, /representativeBullets/);
});

test("style profile can disable representative voice examples", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-notes-style-"));
  await writeText(
    path.join(cwd, "samples", "2026-03-20-W12.md"),
    `---
approved: true
---

Key outcomes shipped/delivered:
- Delivered reporting updates that clarified weekly deployment status for release owners.
`
  );

  const profile = await buildStyleProfile(cwd, testConfig(0));
  const instruction = toStyleInstruction(profile);

  assert.deepEqual(profile.representativeBullets, []);
  assert.doesNotMatch(instruction, /Style examples from approved summaries/);
});
