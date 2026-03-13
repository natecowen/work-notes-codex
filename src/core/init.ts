import path from "node:path";
import { ensureDir, writeText } from "./files.js";

const defaultConfig = `version: 1
paths:
  daily_notes_dir: notes/daily
  weekly_notes_dir: notes/weekly
  monthly_notes_dir: notes/monthly
  templates_dir: templates
  drafts_dir: drafts
  final_dir: final
  reports_dir: reports
  cache_dir: cache

llm:
  provider: ollama
  model: llama3.1:8b
  temperature: 0.1
  max_tokens: 1600
  endpoint: http://127.0.0.1:11434/api/generate

voice:
  mode: facts_only
  style_profile_from_samples: true
  sample_dirs:
    - notes/weekly
    - notes/monthly
    - final/weekly
    - final/monthly
  profile_path: cache/style-profile.json

categories:
  - Top Outcomes
  - Problems Solved / Fires Prevented
  - Cross-Team Impact & Leadership
  - Risks & Blockers
  - Next Month Focus

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
`;

const dailyTemplate = `---
date: {{DATE}}
attendance: office
tags: []
approved: false
---

# Day: {{DATE}}

Meetings:
- 

Work:
- Architecture/Devops:
- Leadership/Training:
- Personal:

Notes:
Task list for tomorrow:
- [ ] 
`;

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

export async function runInit(cwd: string): Promise<void> {
  await Promise.all([
    ensureDir(path.resolve(cwd, "config")),
    ensureDir(path.resolve(cwd, "templates")),
    ensureDir(path.resolve(cwd, "notes/daily")),
    ensureDir(path.resolve(cwd, "notes/weekly")),
    ensureDir(path.resolve(cwd, "notes/monthly")),
    ensureDir(path.resolve(cwd, "drafts/weekly")),
    ensureDir(path.resolve(cwd, "drafts/monthly")),
    ensureDir(path.resolve(cwd, "final/weekly")),
    ensureDir(path.resolve(cwd, "final/monthly")),
    ensureDir(path.resolve(cwd, "reports/attendance")),
    ensureDir(path.resolve(cwd, "cache"))
  ]);

  await Promise.all([
    writeText(path.resolve(cwd, "config/config.yaml"), defaultConfig),
    writeText(path.resolve(cwd, "templates/daily.md"), dailyTemplate),
    writeText(path.resolve(cwd, "templates/weekly.md"), weeklyTemplate),
    writeText(path.resolve(cwd, "templates/monthly.md"), monthlyTemplate)
  ]);
}
