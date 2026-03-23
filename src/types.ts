export type Attendance = "office" | "wfh" | "holiday" | "sick" | "vacation";
export type SectionType = "bullet_list" | "categorized_list" | "kv_list" | "free_text";

export interface SectionCategoryDefinition {
  id: string;
  label: string;
}

export interface DailySectionDefinition {
  id: string;
  label: string;
  type: SectionType;
  categories?: SectionCategoryDefinition[];
}

export interface OutputSectionDefinition {
  id: string;
  label: string;
  type: SectionType;
  placeholder: string;
  source: string;
  required?: boolean;
}

export interface DailyStructureConfig {
  sections: DailySectionDefinition[];
}

export interface PeriodStructureConfig {
  sections: OutputSectionDefinition[];
}

export interface WorkCategoryGroup {
  category: string;
  items: string[];
}

export interface AppConfig {
  version: number;
  paths: {
    daily_notes_dir: string;
    weekly_notes_dir: string;
    monthly_notes_dir: string;
    templates_dir: string;
    drafts_dir: string;
    reports_dir: string;
    cache_dir: string;
  };
  llm: {
    provider: "ollama";
    model: string;
    temperature: number;
    max_tokens: number;
    endpoint?: string;
  };
  voice: {
    mode: "facts_only";
    style_profile_from_samples: boolean;
    sample_dirs?: string[];
    profile_path?: string;
  };
  prompting?: {
    sample_writing_limit?: number;
    remember_rules?: string[];
  };
  categories: string[];
  attendance: {
    workdays_only: boolean;
    values: Attendance[];
    missing_policy: "warn";
  };
  tasks: {
    carry_forward_enabled: boolean;
    open_marker: string;
    done_marker: string;
  };
  tags: {
    enabled: boolean;
    input_mode: "frontmatter" | "inline" | "frontmatter_or_inline";
  };
  daily?: DailyStructureConfig;
  weekly?: PeriodStructureConfig;
  monthly?: PeriodStructureConfig;
}

export interface DailyEntry {
  date: string;
  attendance: Attendance;
  meetings: string[];
  workLines: string[];
  workCategories: WorkCategoryGroup[];
  notesLines: string[];
  tasksOpen: string[];
  tasksDone: string[];
  tags: string[];
  approved: boolean;
  rawBody: string;
  sourcePath: string;
}

export interface WeekWindow {
  friday: string;
  monday: string;
}

export interface DailyIndexRow {
  date: string;
  attendance: Attendance;
  tags: string[];
  tasksOpenCount: number;
  tasksDoneCount: number;
  meetingsCount: number;
  approved: boolean;
  sourcePath: string;
}

export interface DailyParseError {
  sourcePath: string;
  error: string;
}

export interface ApprovalAuditEvent {
  approvedAt: string;
  periodType: "weekly" | "monthly";
  periodKey: string;
  draftPath: string;
  approvedPath: string;
}

export interface IndexCache {
  generatedAt: string;
  totalRows: number;
  totalErrors: number;
  rows: DailyIndexRow[];
  errors: DailyParseError[];
  approvals: ApprovalAuditEvent[];
}

export interface VoiceStyleProfile {
  generatedAt: string;
  sampleFileCount: number;
  bulletCount: number;
  avgBulletWords: number;
  headingCategoryCount: number;
  commonHeadingCategories: string[];
  prefersCategoryPrefix: boolean;
  commonCategoryPrefixes: string[];
}
