import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeText } from "./files.js";
import { generateMonthlyDraft, generateWeeklyDraft, isValidMonthlyOllamaOutput, isValidWeeklyOllamaOutput } from "./generate.js";
import type { AppConfig } from "../types.js";

const weeklyTemplate = `---
week_friday: {{FRIDAY}}
approved: false
---

# Week of: {{FRIDAY}}

Task list from last Week:
{{TASKS_FROM_LAST_WEEK}}

Work (Facts Only):
Key outcomes shipped/delivered:
{{KEY_OUTCOMES}}

Problems solved / fires prevented:
{{FIRES_PREVENTED}}

Cross-team impact:
{{CROSS_TEAM_IMPACT}}

Attendance Summary:
{{ATTENDANCE_SUMMARY}}

Task list for Next Week (Max 3)
{{NEXT_WEEK_TASKS}}
`;

const monthlyTemplate = `---
month: {{MONTH}}
approved: false
---

# {{MONTH}} Monthly Recap

1. Top Outcomes:
{{TOP_OUTCOMES}}

2. Problems Solved / Fires Prevented
{{FIRES}}

3. Cross-Team Impact & Leadership
{{IMPACT}}

4. Risks & Blockers
{{RISKS}}

5. Next Month Focus
{{NEXT_FOCUS}}
`;

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
      max_tokens: 256,
      endpoint: "http://127.0.0.1:11434/api/generate"
    },
    voice: {
      mode: "facts_only",
      style_profile_from_samples: false
    },
    prompting: {
      sample_writing_limit: 2,
      remember_rules: ["Be factual."]
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

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "work-notes-codex-"));
}

async function writeDailyNote(cwd: string, date: string, attendance = "office"): Promise<void> {
  const filePath = path.join(cwd, "daily", date.slice(0, 4), `${date}.md`);
  await writeText(
    filePath,
    `---
date: ${date}
attendance: ${attendance}
approved: false
---

Meetings:
- Team sync

Work:
- Shipped the rollout
- [ ] Follow up with infra

Notes:
- Captured context
`
  );
}

test("weekly validator rejects raw template output and accepts filled output", () => {
  assert.equal(
    isValidWeeklyOllamaOutput(weeklyTemplate, weeklyTemplate, "2026-03-20", {
      carryTasks: ["Follow up with infra"],
      outcomes: ["Shipped the rollout"]
    }),
    false
  );
  assert.equal(
    isValidWeeklyOllamaOutput(
      weeklyTemplate,
      weeklyTemplate.replaceAll("{{FRIDAY}}", "2026-03-20").replaceAll("{{TASKS_FROM_LAST_WEEK}}", "- None"),
      "2026-03-20",
      { carryTasks: ["Follow up with infra"], outcomes: ["Shipped the rollout"] }
    ),
    false
  );
  assert.equal(
    isValidWeeklyOllamaOutput(
      weeklyTemplate,
      weeklyTemplate
        .replaceAll("{{FRIDAY}}", "2026-03-20")
        .replaceAll("{{TASKS_FROM_LAST_WEEK}}", "- Follow up with infra")
        .replaceAll("{{KEY_OUTCOMES}}", "- Shipped the rollout")
        .replaceAll("{{FIRES_PREVENTED}}", "-")
        .replaceAll("{{CROSS_TEAM_IMPACT}}", "-")
        .replaceAll("{{ATTENDANCE_SUMMARY}}", "- Office: 5")
        .replaceAll("{{NEXT_WEEK_TASKS}}", "- Follow up with infra"),
      "2026-03-20",
      { carryTasks: ["Follow up with infra"], outcomes: ["Shipped the rollout"] }
    ),
    true
  );
});

test("monthly validator rejects raw template output and accepts filled output", () => {
  assert.equal(isValidMonthlyOllamaOutput(monthlyTemplate, monthlyTemplate, "2026-03", { hasWeeklyInputs: true }), false);
  assert.equal(
    isValidMonthlyOllamaOutput(
      monthlyTemplate,
      monthlyTemplate
        .replaceAll("{{MONTH}}", "2026-03")
        .replaceAll("{{TOP_OUTCOMES}}", "-")
        .replaceAll("{{FIRES}}", "{{FIRES}}"),
      "2026-03",
      { hasWeeklyInputs: true }
    ),
    false
  );
  assert.equal(
    isValidMonthlyOllamaOutput(
      monthlyTemplate,
      monthlyTemplate
        .replaceAll("{{MONTH}}", "2026-03")
        .replaceAll("{{TOP_OUTCOMES}}", "- Delivered reporting")
        .replaceAll("{{FIRES}}", "- Resolved flaky deploy")
        .replaceAll("{{IMPACT}}", "- Unblocked another team")
        .replaceAll("{{RISKS}}", "-")
        .replaceAll("{{NEXT_FOCUS}}", "- Stabilize rollouts"),
      "2026-03",
      { hasWeeklyInputs: true }
    ),
    true
  );
});

test("weekly validator rejects sparse output when source outcomes exist", () => {
  const sparseOutput = `---
week_friday: 2026-03-20
approved: false
---

# Week of: 2026-03-20

Task list from last Week:

Work (Facts Only):
Key outcomes shipped/delivered:

Problems solved / fires prevented:

Cross-team impact:

Attendance Summary:
- Office: 3
- WFH: 2

Task list for Next Week (Max 3)
- Create Jira stories
`;

  assert.equal(
    isValidWeeklyOllamaOutput(weeklyTemplate, sparseOutput, "2026-03-20", {
      carryTasks: ["Create Jira stories"],
      outcomes: ["Shipped the rollout"]
    }),
    false
  );
});

test("weekly draft falls back when Ollama echoes the template", async () => {
  const cwd = await createWorkspace();
  const config = testConfig();
  await writeText(path.join(cwd, "templates", "weekly.md"), weeklyTemplate);

  for (const date of ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"]) {
    await writeText(
      path.join(cwd, "daily", date.slice(0, 4), `${date}.md`),
      `---
date: ${date}
attendance: office
approved: false
---

## Meetings:
- Team sync

## Work:
### Development/Coding:
- Shipped the rollout
- Refactored the pipeline

### DevOps:
- Fixed logging

## Notes:
- Captured context

## Task list for tomorrow:
- [ ] Follow up with infra
`
    );
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: weeklyTemplate }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const result = await generateWeeklyDraft(cwd, config, "2026-03-20", "2026-03-16");
    const output = await readFile(result.outputPath, "utf8");

    assert.match(result.warnings.join("\n"), /used deterministic fallback/i);
    assert.match(output, /week_friday: 2026-03-20/);
    assert.doesNotMatch(output, /{{FRIDAY}}/);
    assert.match(output, /Attendance Summary:/);
    assert.match(output, /\*\*Development\/Coding:\*\*/);
    assert.match(output, /\*\*DevOps:\*\*/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weekly draft preserves categorized key outcomes in final output", async () => {
  const cwd = await createWorkspace();
  const config = testConfig();
  await writeText(path.join(cwd, "templates", "weekly.md"), weeklyTemplate);
  await writeText(
    path.join(cwd, "daily", "2026", "2026-03-20.md"),
    `---
date: 2026-03-20
attendance: office
approved: false
---

## Meetings:
- Sprint

## Work:
### Development/Coding:
- Removed unused seasonal overrides from Branch consumer.
- Validated and deployed Quartz and Calc consumer changes.

### DevOps:
- Fixed app startup logging visibility.

## Notes:
- Supported the sprint.

## Task list for tomorrow:
- [ ] Create Jira stories
`
  );

  const generatedWeekly = `---
week_friday: 2026-03-20
approved: false
---

# Week of: 2026-03-20

Task list from last Week:
- Create Jira stories

Work (Facts Only):
Key outcomes shipped/delivered:
- Generic summary from model

Problems solved / fires prevented:
- Fixed app startup logging visibility.

Cross-team impact:
- Met with another team.

Attendance Summary:
- Office: 1
- WFH: 0
- Holiday: 0
- Sick: 0
- Vacation: 0

Task list for Next Week (Max 3)
- Create Jira stories
`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: generatedWeekly }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const result = await generateWeeklyDraft(cwd, config, "2026-03-20", "2026-03-16");
    const output = await readFile(result.outputPath, "utf8");

    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Missing daily files: 2026-03-16, 2026-03-17, 2026-03-18, 2026-03-19/);
    assert.match(output, /\*\*Development\/Coding:\*\*/);
    assert.match(output, /- Removed unused seasonal overrides from Branch consumer\./);
    assert.match(output, /- Validated and deployed Quartz and Calc consumer changes\./);
    assert.match(output, /\*\*DevOps:\*\*/);
    assert.match(output, /- Fixed app startup logging visibility\./);
    assert.doesNotMatch(output, /- Generic summary from model/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("monthly draft falls back when Ollama echoes the template", async () => {
  const cwd = await createWorkspace();
  const config = testConfig();
  await writeText(path.join(cwd, "templates", "monthly.md"), monthlyTemplate);
  await writeText(
    path.join(cwd, "weekly", "2026", "2026-03-20-ISOWeek.md"),
    `---
week_friday: 2026-03-20
approved: true
---

# Week of: 2026-03-20

Task list from last Week:
- Follow up with infra

Work (Facts Only):
Key outcomes shipped/delivered:
- Delivered reporting

Problems solved / fires prevented:
- Resolved flaky deploy

Cross-team impact:
- Unblocked another team

Attendance Summary:
- Office: 5

Task list for Next Week (Max 3)
- Stabilize rollouts
`
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: monthlyTemplate }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const result = await generateMonthlyDraft(cwd, config, "2026-03");
    const output = await readFile(result.outputPath, "utf8");

    assert.match(result.warnings.join("\n"), /used fallback template/i);
    assert.match(output, /month: 2026-03/);
    assert.doesNotMatch(output, /{{MONTH}}/);
    assert.match(output, /Top Outcomes/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
