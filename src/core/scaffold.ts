import path from "node:path";
import type { AppConfig } from "../types.js";
import { iterateWorkdays } from "./dates.js";
import { fileExists, readText, writeText } from "./files.js";
import { findDailySection } from "./sections.js";

function buildDailyPath(cwd: string, config: AppConfig, date: string): string {
  return path.resolve(cwd, config.paths.daily_notes_dir, date.slice(0, 4), `${date}.md`);
}

function renderDailyTemplate(template: string, config: AppConfig, date: string): string {
  const meetingsSection = findDailySection(config, "meetings");
  const workSection = findDailySection(config, "work");
  const notesSection = findDailySection(config, "notes");
  const tasksTomorrowSection = findDailySection(config, "tasks_tomorrow");
  const workCategories = workSection?.categories?.map((category) => `- ${category.label}:\n`).join("") ?? "";
  let output = template
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{MEETINGS_LABEL}}", meetingsSection?.label ?? "Meetings")
    .replaceAll("{{WORK_LABEL}}", workSection?.label ?? "Work")
    .replaceAll("{{WORK_CATEGORIES}}", workCategories.trimEnd())
    .replaceAll("{{NOTES_LABEL}}", notesSection?.label ?? "Notes")
    .replaceAll("{{TASKS_TOMORROW_LABEL}}", tasksTomorrowSection?.label ?? "Task list for tomorrow");

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
