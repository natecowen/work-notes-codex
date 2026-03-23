import matter from "gray-matter";
import type { AppConfig, Attendance, DailyEntry, WorkCategoryGroup, DailySectionDefinition } from "../types.js";
import { findDailySection, getDailyStructure, normalizeHeadingLabel } from "./sections.js";

function normalizeLine(line: string): string {
  return line.trim().replace(/^\-\s*/, "").trim();
}

function parseTasks(lines: string[], config: AppConfig): { open: string[]; done: string[] } {
  const open: string[] = [];
  const done: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`- ${config.tasks.open_marker}`)) {
      const task = trimmed.replace(`- ${config.tasks.open_marker}`, "").trim();
      if (task) open.push(task);
    }
    if (trimmed.startsWith(`- ${config.tasks.done_marker}`)) {
      const task = trimmed.replace(`- ${config.tasks.done_marker}`, "").trim();
      if (task) done.push(task);
    }
  }
  return { open, done };
}

function parseMarkdownHeading(line: string): { depth: number; label: string } | null {
  const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
  if (!match) return null;
  return {
    depth: match[1].length,
    label: match[2].trim()
  };
}

function extractSection(body: string, labels: string[], boundaryLabels = labels): string[] {
  const lines = body.split(/\r?\n/);
  const targets = new Set(labels.map((label) => normalizeHeadingLabel(label)));
  const startIdx = lines.findIndex((line) => {
    const heading = parseMarkdownHeading(line);
    if (heading) return targets.has(normalizeHeadingLabel(heading.label));
    return targets.has(normalizeHeadingLabel(line.trim()));
  });
  if (startIdx < 0) return [];

  const startHeading = parseMarkdownHeading(lines[startIdx]);
  const sectionLabels = new Set(boundaryLabels.map((label) => normalizeHeadingLabel(label)));
  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = parseMarkdownHeading(line);
    if (heading && startHeading && heading.depth <= startHeading.depth) {
      break;
    }
    if (!startHeading && sectionLabels.has(normalizeHeadingLabel(line.trim()))) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines;
}

function parseInlineTags(text: string): string[] {
  const matches = text.match(/(^|\s)#([a-zA-Z0-9-_]+)/g) ?? [];
  return matches.map((m) => m.trim().replace(/^#/, "").replace(/\s#/, ""));
}

function isCategoryHeadingLine(line: string): boolean {
  return /^(-\s*)?[A-Za-z][A-Za-z\s/()-]+:\s*$/.test(line.trim());
}

function extractCategoryLabel(line: string): string | null {
  const trimmed = line.trim().replace(/^\-\s*/, "");
  const match = trimmed.match(/^([A-Za-z][A-Za-z\s/&()-]+):\s*$/);
  return match ? match[1] : null;
}

function normalizeWorkLines(lines: string[]): string[] {
  return lines
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .filter((line) => line !== "-")
    .filter((line) => !isCategoryHeadingLine(line));
}

function parseWorkSection(
  lines: string[],
  workSection: DailySectionDefinition | undefined
): { workLines: string[]; workCategories: WorkCategoryGroup[] } {
  const workLines: string[] = [];
  const workCategories: WorkCategoryGroup[] = [];
  let currentCategory: WorkCategoryGroup | null = null;
  const configuredCategories = new Map(
    (workSection?.categories ?? []).map((category) => [normalizeHeadingLabel(category.label), category.label])
  );

  const ensureCategory = (category: string): WorkCategoryGroup => {
    const existing = workCategories.find((group) => group.category === category);
    if (existing) return existing;
    const group = { category, items: [] };
    workCategories.push(group);
    return group;
  };

  for (const line of lines) {
    const markdownHeading = parseMarkdownHeading(line);
    const categoryLabel = markdownHeading ? extractCategoryLabel(markdownHeading.label) : extractCategoryLabel(line);
    if (categoryLabel) {
      const normalized = normalizeHeadingLabel(categoryLabel);
      currentCategory = ensureCategory(configuredCategories.get(normalized) ?? categoryLabel);
      continue;
    }

    const normalized = normalizeLine(line);
    if (!normalized || normalized === "-") continue;
    workLines.push(normalized);

    if (!currentCategory) {
      currentCategory = ensureCategory("General");
    }
    currentCategory.items.push(normalized);
  }

  return {
    workLines: normalizeWorkLines(workLines),
    workCategories: workCategories.filter((group) => group.items.length > 0)
  };
}

export function parseDailyMarkdown(filePath: string, raw: string, config: AppConfig): DailyEntry {
  const parsed = matter(raw);
  const data = parsed.data as Partial<DailyEntry> & {
    attendance?: Attendance;
    tags?: string[];
    approved?: boolean;
  };
  const rawDate = (parsed.data as Record<string, unknown>).date;

  const dateValue =
    rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : typeof rawDate === "string" ? rawDate : "";

  if (!dateValue) throw new Error(`Missing frontmatter 'date' in ${filePath}`);
  if (!data.attendance) throw new Error(`Missing frontmatter 'attendance' in ${filePath}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error(`Invalid frontmatter 'date' format in ${filePath}. Expected YYYY-MM-DD.`);
  }
  if (!config.attendance.values.includes(data.attendance)) {
    throw new Error(
      `Invalid frontmatter 'attendance' in ${filePath}. Expected one of: ${config.attendance.values.join(", ")}.`
    );
  }

  const structure = getDailyStructure(config);
  const managedLabels = structure.sections.map((section) => section.label);
  const meetingsSection = findDailySection(config, "meetings");
  const workSection = findDailySection(config, "work");
  const notesSection = findDailySection(config, "notes");

  const meetingsLines = extractSection(
    parsed.content,
    meetingsSection ? [meetingsSection.label] : ["Meetings"],
    managedLabels
  )
    .map(normalizeLine)
    .filter(Boolean);
  const { workLines, workCategories } = parseWorkSection(
    extractSection(parsed.content, workSection ? [workSection.label] : ["Work"], managedLabels),
    workSection
  );
  const notesLines = extractSection(
    parsed.content,
    notesSection ? [notesSection.label] : ["Notes"],
    managedLabels
  )
    .map((l) => l.trim())
    .filter(Boolean);

  const allBodyLines = parsed.content.split(/\r?\n/);
  const tasks = parseTasks(allBodyLines, config);
  const inlineTags = parseInlineTags(parsed.content);

  return {
    date: dateValue,
    attendance: data.attendance,
    meetings: meetingsLines,
    workLines,
    workCategories,
    notesLines,
    tasksOpen: tasks.open,
    tasksDone: tasks.done,
    tags: [...new Set([...(data.tags ?? []), ...inlineTags])],
    approved: Boolean(data.approved),
    rawBody: parsed.content,
    sourcePath: filePath
  };
}

export function setApprovedFrontmatter(raw: string): string {
  const parsed = matter(raw);
  const normalized = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString().slice(0, 10) : value
    ])
  );
  parsed.data = { ...normalized, approved: true };
  return matter.stringify(parsed.content, parsed.data);
}
