import path from "node:path";
import { ensureDir, writeText } from "./files.js";

const defaultConfig = `version: 1
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
  endpoint: http://127.0.0.1:11434/api/generate

voice:
  mode: facts_only
  style_profile_from_samples: true
  sample_dirs:
    - notes/weekly
    - notes/monthly
  profile_path: cache/style-profile.json

prompting:
  sample_writing_limit: 2
  remember_rules:
    - Be factual.
    - Use action verbs.
    - Include system, tool, and people names.
    - Categorize appropriately (DevOps, Development, Architecture, Leadership, Training).
    - Keep bullets concise but impactful.

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

daily:
  sections:
    - id: meetings
      label: Meetings
      type: bullet_list
    - id: work
      label: Work
      type: categorized_list
      categories:
        - id: architecture_devops
          label: Architecture/Devops
        - id: leadership_training
          label: Leadership/Training
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
      type: categorized_list
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
      source: weekly_fires_prevented
      required: true
    - id: impact
      label: "3. Cross-Team Impact & Leadership"
      type: bullet_list
      placeholder: "{{IMPACT}}"
      source: weekly_cross_team_impact
      required: true
    - id: risks
      label: "4. Risks & Blockers"
      type: bullet_list
      placeholder: "{{RISKS}}"
      source: weekly_risks
      required: true
    - id: next_focus
      label: "5. Next Month Focus"
      type: bullet_list
      placeholder: "{{NEXT_FOCUS}}"
      source: weekly_next_tasks
      required: true
`;

const dailyTemplate = `---
date: {{DATE}}
attendance: office
tags: []
approved: false
---

# Day: {{DATE}}

{{SECTION id="meetings" label=true heading_level=2}}:
{{SECTION id="meetings"}}

{{SECTION id="work" label=true heading_level=2}}:
{{SECTION id="work" nested=true category_level=3}}

{{SECTION id="notes" label=true heading_level=2}}
{{SECTION id="notes"}}

{{SECTION id="tasks_tomorrow" label=true heading_level=2}}:
{{SECTION id="tasks_tomorrow"}}
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
