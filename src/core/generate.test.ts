import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { writeText } from "./files.js";
import { generateMonthlyDraft, generateWeeklyDraft, isValidMonthlyOllamaOutput, isValidWeeklyOllamaOutput } from "./generate.js";
import type { AppConfig } from "../types.js";

const execFileAsync = promisify(execFile);

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

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "work-notes-codex-"));
}

async function writeCliFixtureConfig(cwd: string): Promise<void> {
  await writeText(
    path.join(cwd, "config", "config.yaml"),
    `version: 1
paths:
  daily_notes_dir: daily
  weekly_notes_dir: weekly
  monthly_notes_dir: monthly
  templates_dir: templates
  drafts_dir: drafts
  reports_dir: reports
  cache_dir: cache
llm:
  provider: ollama
  model: test-model
  temperature: 0
  max_tokens: 256
  endpoint: http://127.0.0.1:11434/api/generate
voice:
  mode: facts_only
  style_profile_from_samples: false
prompting:
  sample_writing_limit: 2
  remember_rules:
    - Be factual.
categories:
  - Development
attendance:
  workdays_only: true
  values:
    - office
    - wfh
    - holiday
    - sick
    - vacation
  missing_policy: warn
tasks:
  carry_forward_enabled: true
  open_marker: "[ ]"
  done_marker: "[x]"
tags:
  enabled: false
  input_mode: frontmatter
daily:
  sections:
    - id: meetings
      label: Meetings
      type: bullet_list
    - id: work
      label: Work
      type: categorized_list
      categories:
        - id: development_coding
          label: Development/Coding
        - id: devops
          label: DevOps
        - id: personal
          label: Personal
    - id: notes
      label: Notes
      type: free_text
    - id: tasks_tomorrow
      label: Task list for tomorrow
      type: bullet_list
weekly:
  sections:
    - id: tasks_last_week
      label: Task list from last Week
      type: bullet_list
      placeholder: "{{TASKS_FROM_LAST_WEEK}}"
      source: carry_forward_tasks
      required: true
    - id: key_outcomes
      label: Key outcomes shipped/delivered
      type: bullet_list
      placeholder: "{{KEY_OUTCOMES}}"
      source: weekly_work_rollup
      required: true
    - id: fires_prevented
      label: Problems solved / fires prevented
      type: bullet_list
      placeholder: "{{FIRES_PREVENTED}}"
      source: notes_and_work
      required: true
    - id: cross_team_impact
      label: Cross-team impact
      type: bullet_list
      placeholder: "{{CROSS_TEAM_IMPACT}}"
      source: meetings_and_notes
      required: true
    - id: attendance_summary
      label: Attendance Summary
      type: kv_list
      placeholder: "{{ATTENDANCE_SUMMARY}}"
      source: attendance_rollup
      required: true
    - id: next_week_tasks
      label: Task list for Next Week (Max 3)
      type: bullet_list
      placeholder: "{{NEXT_WEEK_TASKS}}"
      source: upcoming_tasks
      required: true
monthly:
  sections:
    - id: top_outcomes
      label: "1. Top Outcomes"
      type: bullet_list
      placeholder: "{{TOP_OUTCOMES}}"
      source: weekly_key_outcomes
      required: true
    - id: fires
      label: "2. Problems Solved / Fires Prevented"
      type: bullet_list
      placeholder: "{{FIRES}}"
      source: weekly_fires
      required: true
    - id: impact
      label: "3. Cross-Team Impact & Leadership"
      type: bullet_list
      placeholder: "{{IMPACT}}"
      source: weekly_impact
      required: true
    - id: risks
      label: "4. Risks & Blockers"
      type: bullet_list
      placeholder: "{{RISKS}}"
      source: monthly_risks
      required: true
    - id: next_focus
      label: "5. Next Month Focus"
      type: bullet_list
      placeholder: "{{NEXT_FOCUS}}"
      source: next_month_focus
      required: true
`
  );

  await writeText(path.join(cwd, "templates", "weekly.md"), weeklyTemplate);
  await writeText(path.join(cwd, "templates", "monthly.md"), monthlyTemplate);
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

function expectedWeeklyContent(
  overrides: Partial<{
    carryInTasks: string[];
    nextWeekTasks: string[];
    outcomes: string[];
    meetings: string[];
    notes: string[];
    fireLines: string[];
    fireExcludedLines: string[];
    impactLines: string[];
  }> = {}
) {
  return {
    carryInTasks: [],
    nextWeekTasks: [],
    outcomes: [],
    weeklyWorkCategories: [],
    meetings: [],
    notes: [],
    fireLines: [],
    fireExcludedLines: [],
    impactLines: [],
    ...overrides
  };
}

test("weekly validator rejects raw template output and accepts filled output", () => {
  const config = testConfig();
  assert.equal(
    isValidWeeklyOllamaOutput(
      config,
      weeklyTemplate,
      weeklyTemplate,
      "2026-03-20",
      expectedWeeklyContent({ carryInTasks: ["Follow up with infra"], outcomes: ["Shipped the rollout"] })
    ),
    false
  );
  assert.equal(
    isValidWeeklyOllamaOutput(
      config,
      weeklyTemplate,
      weeklyTemplate.replaceAll("{{FRIDAY}}", "2026-03-20").replaceAll("{{TASKS_FROM_LAST_WEEK}}", "- None"),
      "2026-03-20",
      expectedWeeklyContent({ carryInTasks: ["Follow up with infra"], outcomes: ["Shipped the rollout"] })
    ),
    false
  );
  assert.equal(
    isValidWeeklyOllamaOutput(
      config,
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
      expectedWeeklyContent({
        carryInTasks: ["Follow up with infra"],
        nextWeekTasks: ["Follow up with infra"],
        outcomes: ["Shipped the rollout"]
      })
    ),
    true
  );
});

test("monthly validator rejects raw template output and accepts filled output", () => {
  const config = testConfig();
  assert.equal(
    isValidMonthlyOllamaOutput(config, monthlyTemplate, monthlyTemplate, "2026-03", { hasWeeklyInputs: true }),
    false
  );
  assert.equal(
    isValidMonthlyOllamaOutput(
      config,
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
      config,
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
  const config = testConfig();
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
    isValidWeeklyOllamaOutput(config, weeklyTemplate, sparseOutput, "2026-03-20", {
      ...expectedWeeklyContent(),
      carryInTasks: ["Create Jira stories"],
      nextWeekTasks: ["Create Jira stories"],
      outcomes: ["Shipped the rollout"]
    }),
    false
  );
});

test("weekly validator accepts configured section labels instead of hard-coded defaults", () => {
  const config = testConfig();
  config.weekly = {
    sections: [
      {
        id: "tasks_last_week",
        label: "Carry Forward Items",
        type: "bullet_list",
        placeholder: "{{TASKS_FROM_LAST_WEEK}}",
        source: "carry_forward_tasks",
        required: true
      },
      {
        id: "key_outcomes",
        label: "Delivered Work",
        type: "bullet_list",
        placeholder: "{{KEY_OUTCOMES}}",
        source: "weekly_work_rollup",
        required: true
      },
      {
        id: "fires_prevented",
        label: "Problems Solved",
        type: "bullet_list",
        placeholder: "{{FIRES_PREVENTED}}",
        source: "notes_and_work",
        required: true
      },
      {
        id: "cross_team_impact",
        label: "Cross-Team Impact",
        type: "bullet_list",
        placeholder: "{{CROSS_TEAM_IMPACT}}",
        source: "meetings_and_notes",
        required: true
      },
      {
        id: "attendance_summary",
        label: "Attendance Snapshot",
        type: "kv_list",
        placeholder: "{{ATTENDANCE_SUMMARY}}",
        source: "attendance_rollup",
        required: true
      },
      {
        id: "next_week_tasks",
        label: "Next Week Focus",
        type: "bullet_list",
        placeholder: "{{NEXT_WEEK_TASKS}}",
        source: "upcoming_tasks",
        required: true
      }
    ]
  };

  const generated = `---
week_friday: 2026-03-20
approved: false
---

# Week of: 2026-03-20

Carry Forward Items:
- Follow up with infra

Work (Facts Only):
Delivered Work:
- Shipped the rollout

Problems Solved:
- Fixed logging

Cross-Team Impact:
- Partnered with another team

Attendance Snapshot:
- Office: 5
- WFH: 0

Next Week Focus
- Follow up with infra
`;

  assert.equal(
    isValidWeeklyOllamaOutput(config, weeklyTemplate, generated, "2026-03-20", {
      ...expectedWeeklyContent(),
      carryInTasks: ["Follow up with infra"],
      nextWeekTasks: ["Follow up with infra"],
      outcomes: ["Shipped the rollout"]
    }),
    true
  );
});

test("weekly validator rejects rewritten meeting bullets in cross-team impact", () => {
  const config = testConfig();
  const generated = `---
week_friday: 2026-03-20
approved: false
---

# Week of: 2026-03-20

Task list from last Week:
- Follow up with infra

Work (Facts Only):
Key outcomes shipped/delivered:
- Shipped the rollout

Problems solved / fires prevented:
- Fixed logging

Cross-team impact:
- Met with Sprint planning with app team for weekly release targets.

Attendance Summary:
- Office: 5

Task list for Next Week (Max 3)
- Follow up with infra
`;

  assert.equal(
    isValidWeeklyOllamaOutput(
      config,
      weeklyTemplate,
      generated,
      "2026-03-20",
      expectedWeeklyContent({
        carryInTasks: ["Follow up with infra"],
        nextWeekTasks: ["Follow up with infra"],
        outcomes: ["Shipped the rollout"],
        meetings: ["Sprint planning with app team for weekly release targets"]
      })
    ),
    false
  );
});

test("weekly validator rejects personal or admin-only fires when stronger fire lines exist", () => {
  const config = testConfig();
  const generated = `---
week_friday: 2026-03-20
approved: false
---

# Week of: 2026-03-20

Task list from last Week:
- Follow up with infra

Work (Facts Only):
Key outcomes shipped/delivered:
- Shipped the rollout

Problems solved / fires prevented:
- Cleaned up my shell aliases for release support tasks.

Cross-team impact:
- Coordinated release owners with QA.

Attendance Summary:
- Office: 5

Task list for Next Week (Max 3)
- Follow up with infra
`;

  assert.equal(
    isValidWeeklyOllamaOutput(
      config,
      weeklyTemplate,
      generated,
      "2026-03-20",
      expectedWeeklyContent({
        carryInTasks: ["Follow up with infra"],
        nextWeekTasks: ["Follow up with infra"],
        outcomes: ["Shipped the rollout"],
        fireLines: ["Validated that the rollout checklist catches missing environment variables before deploy time."],
        fireExcludedLines: ["Cleaned up my shell aliases for release support tasks."]
      })
    ),
    false
  );
});

test("weekly draft separates carry-forward tasks from next-week tasks in fallback content", async () => {
  const cwd = await createWorkspace();
  const config = testConfig();
  await writeText(path.join(cwd, "templates", "weekly.md"), weeklyTemplate);

  await writeText(
    path.join(cwd, "daily", "2026", "2026-03-16.md"),
    `---
date: 2026-03-16
attendance: office
approved: false
---

## Meetings:
- Platform sync with SRE on alert fatigue reduction.

## Work:
### DevOps:
- Fixed a noisy deploy alert in staging.

## Notes:
- Restored missing environment variable validation.

## Task list for tomorrow:
- [ ] Finish CI runner cleanup steps
- [ ] Draft summary of alert tuning changes
`
  );

  await writeText(
    path.join(cwd, "daily", "2026", "2026-03-20.md"),
    `---
date: 2026-03-20
attendance: office
approved: false
---

## Meetings:
- Friday release go/no-go with engineering leadership

## Work:
### DevOps:
- Confirmed the secret mapping fix and closed the startup incident follow-up.

### Personal:
- Cleaned up my shell aliases for release support tasks.

## Notes:
- Release completed without the earlier migration delay.

## Task list for tomorrow:
- [ ] Expand config validation to more shared services
- [ ] Revisit alert thresholds after one week of signal data
`
  );

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
    assert.match(output, /Task list from last Week:\n- Finish CI runner cleanup steps\n- Draft summary of alert tuning changes/);
    assert.match(
      output,
      /Task list for Next Week \(Max 3\)\n- Expand config validation to more shared services\n- Revisit alert thresholds after one week of signal data/
    );
    assert.doesNotMatch(output, /Task list from last Week:\n- Expand config validation to more shared services/);
    assert.match(output, /Cross-team impact:\n- Platform sync with SRE on alert fatigue reduction\./);
    assert.doesNotMatch(output, /Cross-team impact:\n- Met with Platform sync/);
    assert.match(output, /Problems solved \/ fires prevented:/);
    assert.match(output, /- Fixed a noisy deploy alert in staging\./);
    assert.match(output, /- Confirmed the secret mapping fix and closed the startup incident follow-up\./);
    assert.doesNotMatch(
      output,
      /Problems solved \/ fires prevented:\n(?:.*\n)*- Cleaned up my shell aliases for release support tasks\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("weekly draft does not carry markdown category headings through as outcome bullets", async () => {
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
### Development/Coding
- Cleaned and removed old unused logic in Branch consumer.

### Architecture
- Planned work and story creation for AAR pipeline changes.

### Leadership/Mentoring
- Met with Paul and Bryan to discuss open AAR questions.

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
- Placeholder from model

Problems solved / fires prevented:
- Supported the sprint.

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
    assert.match(output, /\*\*Development\/Coding:\*\*/);
    assert.match(output, /\*\*Architecture:\*\*/);
    assert.match(output, /\*\*Leadership\/Mentoring:\*\*/);
    assert.doesNotMatch(output, /^### /m);
    assert.doesNotMatch(output, /- ### /);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weekly draft preserves non-managed template headings after successful Ollama output", async () => {
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
### Development/Coding
- Removed unused seasonal overrides from Branch consumer.

### DevOps
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
Key outcomes shipped/delivered:
- Placeholder from model
Problems solved / fires prevented:
- Supported the sprint.
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
    assert.match(result.warnings[0], /Missing daily files:/);
    assert.match(output, /Work \(Facts Only\):\nKey outcomes shipped\/delivered:/);
    assert.match(output, /\n\nProblems solved \/ fires prevented:/);
    assert.match(output, /\n\nCross-team impact:/);
    assert.match(output, /\n\nAttendance Summary:/);
    assert.match(output, /\n\nTask list for Next Week \(Max 3\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weekly debug appends accepted validation details and raw response", async () => {
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
- Placeholder from model

Problems solved / fires prevented:
- Fixed app startup logging visibility.

Cross-team impact:
- Partnered with another team.

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
    const result = await generateWeeklyDraft(cwd, config, "2026-03-20", "2026-03-16", { debug: true });
    const output = await readFile(result.outputPath, "utf8");

    assert.match(output, /# Debug/);
    assert.match(output, /## Validation\n- Accepted: yes\n- Used fallback: no\n- Reason: Output passed weekly validation\./);
    assert.match(output, /## System Prompt\n```text\nYou are a strict formatter\./);
    assert.match(output, /## Prompt\n```text\nUse the weekly template exactly\./);
    assert.match(output, /## Raw Ollama Response\n```text\n---\nweek_friday: 2026-03-20/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weekly debug appends rejection reason when fallback is used", async () => {
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

## Notes:
- Supported the sprint.

## Task list for tomorrow:
- [ ] Create Jira stories
`
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: weeklyTemplate }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const result = await generateWeeklyDraft(cwd, config, "2026-03-20", "2026-03-16", { debug: true });
    const output = await readFile(result.outputPath, "utf8");

    assert.match(result.warnings.join("\n"), /used deterministic fallback/i);
    assert.match(output, /## Validation\n- Accepted: no\n- Used fallback: yes\n- Reason: Ollama output matched the weekly template without filling it in\./);
    assert.match(output, /## Raw Ollama Response\n```text\n---\nweek_friday: {{FRIDAY}}/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weekly debug appends Ollama error details when generation throws", async () => {
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

## Notes:
- Supported the sprint.

## Task list for tomorrow:
- [ ] Create Jira stories
`
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connection refused");
  };

  try {
    const result = await generateWeeklyDraft(cwd, config, "2026-03-20", "2026-03-16", { debug: true });
    const output = await readFile(result.outputPath, "utf8");

    assert.match(result.warnings.join("\n"), /connection refused/);
    assert.match(output, /## Validation\n- Accepted: no\n- Used fallback: yes\n- Reason: Ollama generation failed before validation\.\n- Error: Error: connection refused/);
    assert.match(output, /## Raw Ollama Response\n```text\n\[unavailable\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("monthly debug appends accepted validation details and raw response", async () => {
  const cwd = await createWorkspace();
  const config = testConfig();
  await writeText(path.join(cwd, "templates", "monthly.md"), monthlyTemplate);
  await writeText(
    path.join(cwd, "weekly", "2026", "2026-03-06-ISOWeek.md"),
    `---
week_friday: 2026-03-06
approved: true
---

# Week of: 2026-03-06

Task list from last Week:
- Finish rollout

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

  const generatedMonthly = `---
month: 2026-03
approved: false
---

# 2026-03 Monthly Recap

1. Top Outcomes:
- Delivered reporting

2. Problems Solved / Fires Prevented
- Resolved flaky deploy

3. Cross-Team Impact & Leadership
- Unblocked another team

4. Risks & Blockers
- None captured

5. Next Month Focus
- Stabilize rollouts
`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: generatedMonthly }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const result = await generateMonthlyDraft(cwd, config, "2026-03", { debug: true });
    const output = await readFile(result.outputPath, "utf8");

    assert.match(output, /# Debug/);
    assert.match(output, /## Validation\n- Accepted: yes\n- Used fallback: no\n- Reason: Output passed monthly validation\./);
    assert.match(output, /## Raw Ollama Response\n```text\n---\nmonth: 2026-03/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("monthly debug appends rejection reason when fallback is used", async () => {
  const cwd = await createWorkspace();
  const config = testConfig();
  await writeText(path.join(cwd, "templates", "monthly.md"), monthlyTemplate);
  await writeText(
    path.join(cwd, "weekly", "2026", "2026-03-06-ISOWeek.md"),
    `---
week_friday: 2026-03-06
approved: true
---

# Week of: 2026-03-06

Task list from last Week:
- Finish rollout

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
    const result = await generateMonthlyDraft(cwd, config, "2026-03", { debug: true });
    const output = await readFile(result.outputPath, "utf8");

    assert.match(result.warnings.join("\n"), /used fallback template/i);
    assert.match(output, /## Validation\n- Accepted: no\n- Used fallback: yes\n- Reason: Ollama output matched the monthly template without filling it in\./);
    assert.match(output, /## Raw Ollama Response\n```text\n---\nmonth: {{MONTH}}/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cli weekly --debug appends debug details to the generated draft", async () => {
  const cwd = await createWorkspace();
  await writeCliFixtureConfig(cwd);
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

## Notes:
- Supported the sprint.

## Task list for tomorrow:
- [ ] Create Jira stories
`
  );

  await execFileAsync(
    process.execPath,
    [
      "--import",
      path.resolve(process.cwd(), "node_modules", "tsx", "dist", "loader.mjs"),
      path.resolve(process.cwd(), "src/cli.ts"),
      "generate",
      "weekly",
      "--friday",
      "2026-03-20",
      "--debug"
    ],
    {
      cwd,
      env: {
        ...process.env,
        WORKLOG_OLLAMA_ENDPOINT: "http://127.0.0.1:1/api/generate"
      }
    }
  );

  const output = await readFile(path.join(cwd, "drafts", "weekly", "2026-03-20-ISOWeek.md"), "utf8");
  assert.match(output, /# Debug/);
  assert.match(output, /## Validation\n- Accepted: no\n- Used fallback: yes/);
});

test("weekly draft overwrites the final managed section with deterministic content", async () => {
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
- Shipped the rollout

## Notes:
- Captured context

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
- Placeholder from model

Problems solved / fires prevented:
- Captured context

Cross-team impact:
- Met with Sprint.

Attendance Summary:
- Office: 1
- WFH: 0
- Holiday: 0
- Sick: 0
- Vacation: 0

Task list for Next Week (Max 3)
- Hallucinated last section item
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

    assert.match(output, /Task list for Next Week \(Max 3\)\n- Create Jira stories/);
    assert.doesNotMatch(output, /Hallucinated last section item/);
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

test("monthly draft flattens weekly categorized outcomes into clean bullets", async () => {
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
**Development/Coding:**
- Removed unused seasonal overrides from Branch consumer.
- Validated and deployed Quartz and Calc consumer changes.

**DevOps:**
- Fixed app startup logging visibility.

Problems solved / fires prevented:
- Resolved flaky deploy.

Cross-team impact:
- Unblocked another team.

Attendance Summary:
- Office: 5
- WFH: 0

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
    assert.match(output, /1\. Top Outcomes:\n- Removed unused seasonal overrides from Branch consumer\./);
    assert.match(output, /- Validated and deployed Quartz and Calc consumer changes\./);
    assert.match(output, /- Fixed app startup logging visibility\./);
    assert.match(output, /2\. Problems Solved \/ Fires Prevented\n- Resolved flaky deploy\./);
    assert.match(output, /3\. Cross-Team Impact & Leadership\n- Unblocked another team\./);
    assert.match(output, /5\. Next Month Focus\n- Stabilize rollouts/);
    assert.doesNotMatch(output, /- \*\*/);
    assert.doesNotMatch(output, /- - /);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("monthly draft preserves template spacing after successful Ollama output", async () => {
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
**Development/Coding:**
- Delivered reporting updates.

Problems solved / fires prevented:
- Resolved flaky deploy.

Cross-team impact:
- Unblocked another team.

Attendance Summary:
- Office: 5

Task list for Next Week (Max 3)
- Stabilize rollouts
`
  );

  const generatedMonthly = `---
month: 2026-03
approved: false
---

# 2026-03 Monthly Recap
1. Top Outcomes:
- Model summary
2. Problems Solved / Fires Prevented
- Model fire
3. Cross-Team Impact & Leadership
- Model impact
4. Risks & Blockers
- None captured
5. Next Month Focus
- Model next focus
`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: generatedMonthly }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const result = await generateMonthlyDraft(cwd, config, "2026-03");
    const output = await readFile(result.outputPath, "utf8");

    assert.equal(result.warnings.length, 0);
    assert.match(output, /# 2026-03 Monthly Recap\n\n1\. Top Outcomes:/);
    assert.match(output, /\n\n2\. Problems Solved \/ Fires Prevented/);
    assert.match(output, /\n\n3\. Cross-Team Impact & Leadership/);
    assert.match(output, /\n\n4\. Risks & Blockers/);
    assert.match(output, /\n\n5\. Next Month Focus/);
    assert.doesNotMatch(output, /\n1\. Top Outcomes:\n- Model summary\n2\./);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
