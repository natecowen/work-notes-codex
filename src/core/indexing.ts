import path from "node:path";
import type {
  AppConfig,
  DailyEntry,
  DailyIndexRow,
  DailyParseError,
  IndexCache,
  ApprovalAuditEvent
} from "../types.js";
import { iterateWorkdays } from "./dates.js";
import { listMarkdownFiles, listMarkdownFilesRecursive, readJsonIfExists, readText, writeText } from "./files.js";
import { parseDailyMarkdown } from "./markdown.js";

export async function loadDailyEntriesForWeek(
  cwd: string,
  config: AppConfig,
  mondayIso: string
): Promise<{ entries: DailyEntry[]; missingDates: string[] }> {
  const dates = iterateWorkdays(mondayIso);
  const baseDir = path.resolve(cwd, config.paths.daily_notes_dir, mondayIso.slice(0, 4));

  const entries: DailyEntry[] = [];
  const missingDates: string[] = [];
  for (const date of dates) {
    const filePath = path.join(baseDir, `${date}.md`);
    try {
      const raw = await readText(filePath);
      entries.push(parseDailyMarkdown(filePath, raw, config));
    } catch {
      missingDates.push(date);
    }
  }
  return { entries, missingDates };
}

export async function loadDailyEntriesInRange(
  cwd: string,
  config: AppConfig,
  from: string,
  to: string
): Promise<DailyEntry[]> {
  const yearDirs = new Set([from.slice(0, 4), to.slice(0, 4)]);
  const files: string[] = [];
  for (const year of yearDirs) {
    const dir = path.resolve(cwd, config.paths.daily_notes_dir, year);
    const inDir = await listMarkdownFiles(dir);
    files.push(...inDir);
  }

  const entries: DailyEntry[] = [];
  for (const filePath of files) {
    const raw = await readText(filePath);
    const parsed = parseDailyMarkdown(filePath, raw, config);
    if (parsed.date >= from && parsed.date <= to) entries.push(parsed);
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export async function writeIndexCache(
  cwd: string,
  config: AppConfig,
  payload: IndexCache,
  fileName = "index.json"
): Promise<void> {
  const outPath = path.resolve(cwd, config.paths.cache_dir, fileName);
  await writeText(outPath, JSON.stringify(payload, null, 2));
}

export async function readIndexCache(cwd: string, config: AppConfig): Promise<IndexCache | null> {
  const inPath = path.resolve(cwd, config.paths.cache_dir, "index.json");
  return readJsonIfExists<IndexCache>(inPath);
}

export async function buildDailyIndex(
  cwd: string,
  config: AppConfig
): Promise<{ rows: DailyIndexRow[]; errors: DailyParseError[] }> {
  const dailyRoot = path.resolve(cwd, config.paths.daily_notes_dir);
  const files = await listMarkdownFilesRecursive(dailyRoot);

  const rows: DailyIndexRow[] = [];
  const errors: DailyParseError[] = [];

  for (const filePath of files) {
    try {
      const raw = await readText(filePath);
      const parsed = parseDailyMarkdown(filePath, raw, config);
      rows.push({
        date: parsed.date,
        attendance: parsed.attendance,
        tags: parsed.tags,
        tasksOpenCount: parsed.tasksOpen.length,
        tasksDoneCount: parsed.tasksDone.length,
        meetingsCount: parsed.meetings.length,
        approved: parsed.approved,
        sourcePath: path.relative(cwd, filePath)
      });
    } catch (error) {
      errors.push({
        sourcePath: path.relative(cwd, filePath),
        error: String(error)
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, errors };
}

export function buildIndexPayload(
  rows: DailyIndexRow[],
  errors: DailyParseError[],
  approvals: ApprovalAuditEvent[]
): IndexCache {
  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    totalErrors: errors.length,
    rows,
    errors,
    approvals
  };
}

export async function appendApprovalAudit(
  cwd: string,
  config: AppConfig,
  event: ApprovalAuditEvent
): Promise<void> {
  const existing = await readIndexCache(cwd, config);
  const payload: IndexCache = {
    generatedAt: existing?.generatedAt ?? new Date().toISOString(),
    totalRows: existing?.totalRows ?? 0,
    totalErrors: existing?.totalErrors ?? 0,
    rows: existing?.rows ?? [],
    errors: existing?.errors ?? [],
    approvals: [...(existing?.approvals ?? []), event]
  };
  await writeIndexCache(cwd, config, payload, "index.json");
}
