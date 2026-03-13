import path from "node:path";
import type { AppConfig } from "../types.js";
import { iterateWorkdays } from "./dates.js";
import { fileExists, readText, writeText } from "./files.js";

function buildDailyPath(cwd: string, config: AppConfig, date: string): string {
  return path.resolve(cwd, config.paths.daily_notes_dir, date.slice(0, 4), `${date}.md`);
}

function renderDailyTemplate(template: string, date: string): string {
  return template.replaceAll("{{DATE}}", date);
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

  await writeText(filePath, renderDailyTemplate(template, date).trimEnd() + "\n");
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
