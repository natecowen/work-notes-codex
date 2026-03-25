import type {
  AppConfig,
  DailySectionDefinition,
  OutputSectionDefinition,
  PeriodStructureConfig,
  DailyStructureConfig
} from "../types.js";

export const DEFAULT_DAILY_SECTIONS: DailySectionDefinition[] = [
  { id: "meetings", label: "Meetings", type: "bullet_list" },
  {
    id: "work",
    label: "Work",
    type: "categorized_list",
    categories: [
      { id: "architecture_devops", label: "Architecture/Devops" },
      { id: "leadership_training", label: "Leadership/Training" },
      { id: "personal", label: "Personal" }
    ]
  },
  { id: "notes", label: "Notes", type: "free_text" },
  { id: "tasks_tomorrow", label: "Task list for tomorrow", type: "bullet_list" }
];

export const DEFAULT_WEEKLY_SECTIONS: OutputSectionDefinition[] = [
  {
    id: "tasks_last_week",
    label: "Task list from last Week",
    type: "bullet_list",
    placeholder: "{{TASKS_FROM_LAST_WEEK}}",
    source: "carry_forward_tasks",
    required: true
  },
  {
    id: "key_outcomes",
    label: "Key outcomes shipped/delivered",
    type: "categorized_list",
    placeholder: "{{KEY_OUTCOMES}}",
    source: "weekly_work_rollup",
    required: true
  },
  {
    id: "fires_prevented",
    label: "Problems solved / fires prevented",
    type: "bullet_list",
    placeholder: "{{FIRES_PREVENTED}}",
    source: "notes_and_work",
    required: true
  },
  {
    id: "cross_team_impact",
    label: "Cross-team impact",
    type: "bullet_list",
    placeholder: "{{CROSS_TEAM_IMPACT}}",
    source: "meetings_and_notes",
    required: true
  },
  {
    id: "attendance_summary",
    label: "Attendance Summary",
    type: "kv_list",
    placeholder: "{{ATTENDANCE_SUMMARY}}",
    source: "attendance_rollup",
    required: true
  },
  {
    id: "next_week_tasks",
    label: "Task list for Next Week (Max 3)",
    type: "bullet_list",
    placeholder: "{{NEXT_WEEK_TASKS}}",
    source: "upcoming_tasks",
    required: true
  }
];

export const DEFAULT_MONTHLY_SECTIONS: OutputSectionDefinition[] = [
  {
    id: "top_outcomes",
    label: "1. Top Outcomes",
    type: "bullet_list",
    placeholder: "{{TOP_OUTCOMES}}",
    source: "weekly_key_outcomes",
    required: true
  },
  {
    id: "fires",
    label: "2. Problems Solved / Fires Prevented",
    type: "bullet_list",
    placeholder: "{{FIRES}}",
    source: "weekly_fires_prevented",
    required: true
  },
  {
    id: "impact",
    label: "3. Cross-Team Impact & Leadership",
    type: "bullet_list",
    placeholder: "{{IMPACT}}",
    source: "weekly_cross_team_impact",
    required: true
  },
  {
    id: "risks",
    label: "4. Risks & Blockers",
    type: "bullet_list",
    placeholder: "{{RISKS}}",
    source: "weekly_risks",
    required: true
  },
  {
    id: "next_focus",
    label: "5. Next Month Focus",
    type: "bullet_list",
    placeholder: "{{NEXT_FOCUS}}",
    source: "weekly_next_tasks",
    required: true
  }
];

function cloneDailySections(sections: DailySectionDefinition[]): DailySectionDefinition[] {
  return sections.map((section) => ({
    ...section,
    categories: section.categories?.map((category) => ({ ...category }))
  }));
}

function cloneOutputSections(sections: OutputSectionDefinition[]): OutputSectionDefinition[] {
  return sections.map((section) => ({ ...section }));
}

export function normalizeHeadingLabel(label: string): string {
  return label.trim().replace(/^#+\s*/, "").replace(/:\s*$/, "").toLowerCase();
}

export function getDailyStructure(config: AppConfig): DailyStructureConfig {
  return {
    sections: cloneDailySections(config.daily?.sections ?? DEFAULT_DAILY_SECTIONS)
  };
}

export function getWeeklyStructure(config: AppConfig): PeriodStructureConfig {
  return {
    sections: cloneOutputSections(config.weekly?.sections ?? DEFAULT_WEEKLY_SECTIONS)
  };
}

export function getMonthlyStructure(config: AppConfig): PeriodStructureConfig {
  return {
    sections: cloneOutputSections(config.monthly?.sections ?? DEFAULT_MONTHLY_SECTIONS)
  };
}

export function normalizeConfigStructures(config: AppConfig): AppConfig {
  return {
    ...config,
    daily: getDailyStructure(config),
    weekly: getWeeklyStructure(config),
    monthly: getMonthlyStructure(config)
  };
}

function assertUniqueIds(items: Array<{ id: string }>, path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id?.trim()) throw new Error(`Invalid config: ${path} entries require a non-empty id.`);
    if (seen.has(item.id)) throw new Error(`Invalid config: duplicate id '${item.id}' in ${path}.`);
    seen.add(item.id);
  }
}

export function validateDailyStructure(structure: DailyStructureConfig, path = "daily.sections"): void {
  if (!Array.isArray(structure.sections) || structure.sections.length === 0) {
    throw new Error(`Invalid config: ${path} must be a non-empty list.`);
  }
  assertUniqueIds(structure.sections, path);
  for (const section of structure.sections) {
    if (!section.label?.trim()) throw new Error(`Invalid config: ${path}.${section.id}.label is required.`);
    if (!section.type?.trim()) throw new Error(`Invalid config: ${path}.${section.id}.type is required.`);
    if (section.categories) {
      assertUniqueIds(section.categories, `${path}.${section.id}.categories`);
      for (const category of section.categories) {
        if (!category.label?.trim()) {
          throw new Error(`Invalid config: ${path}.${section.id}.categories.${category.id}.label is required.`);
        }
      }
    }
  }
}

export function validatePeriodStructure(structure: PeriodStructureConfig, path: string): void {
  if (!Array.isArray(structure.sections) || structure.sections.length === 0) {
    throw new Error(`Invalid config: ${path} must be a non-empty list.`);
  }
  assertUniqueIds(structure.sections, path);
  const placeholders = new Set<string>();
  for (const section of structure.sections) {
    if (!section.label?.trim()) throw new Error(`Invalid config: ${path}.${section.id}.label is required.`);
    if (!section.type?.trim()) throw new Error(`Invalid config: ${path}.${section.id}.type is required.`);
    if (!section.placeholder?.trim()) throw new Error(`Invalid config: ${path}.${section.id}.placeholder is required.`);
    if (!/^{{[^}]+}}$/.test(section.placeholder)) {
      throw new Error(`Invalid config: ${path}.${section.id}.placeholder must look like {{TOKEN}}.`);
    }
    if (placeholders.has(section.placeholder)) {
      throw new Error(`Invalid config: duplicate placeholder '${section.placeholder}' in ${path}.`);
    }
    placeholders.add(section.placeholder);
  }
}

export function findDailySection(config: AppConfig, id: string): DailySectionDefinition | undefined {
  return getDailyStructure(config).sections.find((section) => section.id === id);
}

export function getDailyWorkCategoryLabels(config: AppConfig): string[] {
  return findDailySection(config, "work")?.categories?.map((category) => category.label) ?? [];
}

export function findPeriodSection(
  config: AppConfig,
  period: "weekly" | "monthly",
  id: string
): OutputSectionDefinition | undefined {
  const structure = period === "weekly" ? getWeeklyStructure(config) : getMonthlyStructure(config);
  return structure.sections.find((section) => section.id === id);
}

export function sectionHeadings(sections: Array<{ label: string }>): string[] {
  return sections.map((section) => normalizeHeadingLabel(section.label));
}
