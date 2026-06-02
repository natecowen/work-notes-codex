import path from "node:path";
import type { AppConfig, DailySectionDefinition } from "../types.js";
import { dailyFilePath, iterateWorkdays } from "./dates.js";
import { fileExists, readText, writeText } from "./files.js";
import { findDailySection, getDailyStructure } from "./sections.js";

function buildDailyPath(cwd: string, config: AppConfig, date: string): string {
  return dailyFilePath(cwd, config, date);
}

function parseSectionDirectiveAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of input.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)=(?:"([^"]*)"|(\S+))/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function clampHeadingLevel(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 6);
}

function resolveCategoryHeadingLevel(attrs: Record<string, string>): number {
  const requestedLevel = clampHeadingLevel(attrs.category_level, 3);
  const parentLevel = attrs.parent_heading_level ? clampHeadingLevel(attrs.parent_heading_level, 2) : null;
  if (parentLevel === null) return requestedLevel;
  return Math.max(requestedLevel, Math.min(parentLevel + 1, 6));
}

function renderDefaultSectionContent(section: DailySectionDefinition, attrs: Record<string, string>, config: AppConfig): string {
  const nested = attrs.nested === "true";

  if (section.id === "work") {
    if (nested) {
      const categories = section.categories?.length ? section.categories : [{ id: "general", label: "General" }];
      const prefix = `${"#".repeat(resolveCategoryHeadingLevel(attrs))} `;
      return categories.map((category) => `${prefix}${category.label}:\n- `).join("\n\n");
    }
    return "- ";
  }

  if (section.id === "tasks_tomorrow") {
    return `- ${config.tasks.open_marker} `;
  }

  if (section.type === "free_text") {
    return "";
  }

  return "- ";
}

function renderSectionDirective(directive: string, config: AppConfig): string {
  const attrs = parseSectionDirectiveAttributes(directive);
  const id = attrs.id;
  if (!id) return directive;

  const section = findDailySection(config, id);
  if (!section) {
    throw new Error(`Unknown daily section id '${id}' in template SECTION directive.`);
  }

  if (attrs.label === "true") {
    const headingLevel = attrs.heading_level ? clampHeadingLevel(attrs.heading_level, 2) : null;
    return headingLevel ? `${"#".repeat(headingLevel)} ${section.label}` : section.label;
  }

  return renderDefaultSectionContent(section, attrs, config);
}

function renderDailyTemplate(template: string, config: AppConfig, date: string): string {
  const meetingsSection = findDailySection(config, "meetings");
  const workSection = findDailySection(config, "work");
  const notesSection = findDailySection(config, "notes");
  const tasksTomorrowSection = findDailySection(config, "tasks_tomorrow");
  let output = template
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{MEETINGS_LABEL}}", meetingsSection?.label ?? "Meetings")
    .replaceAll("{{WORK_LABEL}}", workSection?.label ?? "Work")
    .replaceAll("{{NOTES_LABEL}}", notesSection?.label ?? "Notes")
    .replaceAll("{{TASKS_TOMORROW_LABEL}}", tasksTomorrowSection?.label ?? "Task list for tomorrow");
  const lastHeadingLevelBySectionId = new Map<string, string>();
  output = output.replace(/{{SECTION\s+([^}]+)}}/g, (_match, directive) => {
    const attrs = parseSectionDirectiveAttributes(directive);
    if (attrs.id && attrs.label === "true" && attrs.heading_level) {
      lastHeadingLevelBySectionId.set(attrs.id, attrs.heading_level);
    } else if (attrs.id && attrs.nested === "true" && !attrs.parent_heading_level) {
      const parentLevel = lastHeadingLevelBySectionId.get(attrs.id);
      if (parentLevel) attrs.parent_heading_level = parentLevel;
    }
    return renderSectionDirective(
      Object.entries(attrs)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" "),
      config
    );
  });

  if (!output.includes("{{MEETINGS_LABEL}}")) {
    output = output.replace(/^Meetings:\s*$/m, `${meetingsSection?.label ?? "Meetings"}:`);
  }
  if (!output.includes("{{WORK_LABEL}}")) {
    output = output.replace(/^Work:\s*$/m, `${workSection?.label ?? "Work"}:`);
  }
  if (!output.includes("{{NOTES_LABEL}}")) {
    output = output.replace(/^Notes:\s*$/m, `${notesSection?.label ?? "Notes"}:`);
  }
  if (!output.includes("{{TASKS_TOMORROW_LABEL}}")) {
    output = output.replace(/^Task list for tomorrow:\s*$/m, `${tasksTomorrowSection?.label ?? "Task list for tomorrow"}:`);
  }

  // Backward-compatible fallback for older templates that still use WORK_CATEGORIES.
  if (output.includes("{{WORK_CATEGORIES}}")) {
    const fallbackWork = renderDefaultSectionContent(
      workSection ?? getDailyStructure(config).sections.find((section) => section.id === "work")!,
      { nested: "true" },
      config
    );
    output = output.replaceAll("{{WORK_CATEGORIES}}", fallbackWork);
  }

  return output;
}

export async function createDailyFile(
  cwd: string,
  config: AppConfig,
  date: string,
  overwrite = false
): Promise<{ path: string; created: boolean }> {
  const templatePath = path.resolve(cwd, config.paths.templates_dir, "daily.md");
  const template = await readText(templatePath);
  const filePath = buildDailyPath(cwd, config, date);

  if (!overwrite && (await fileExists(filePath))) {
    return { path: filePath, created: false };
  }

  await writeText(filePath, renderDailyTemplate(template, config, date).trimEnd() + "\n");
  return { path: filePath, created: true };
}

export async function createDailyWeekFiles(
  cwd: string,
  config: AppConfig,
  mondayIso: string,
  overwrite = false
): Promise<{ created: string[]; skipped: string[] }> {
  const dates = iterateWorkdays(mondayIso);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const date of dates) {
    const result = await createDailyFile(cwd, config, date, overwrite);
    if (result.created) {
      created.push(result.path);
    } else {
      skipped.push(result.path);
    }
  }

  return { created, skipped };
}
