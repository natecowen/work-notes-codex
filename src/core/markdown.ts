import matter from "gray-matter";
import type { AppConfig, Attendance, DailyEntry } from "../types.js";

function normalizeLine(line: string): string {
  return line.trim().replace(/^\-\s*/, "").trim();
}

function parseTasks(lines: string[], config: AppConfig): { open: string[]; done: string[] } {
  const open: string[] = [];
  const done: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`- ${config.tasks.open_marker}`)) {
      open.push(trimmed.replace(`- ${config.tasks.open_marker}`, "").trim());
    }
    if (trimmed.startsWith(`- ${config.tasks.done_marker}`)) {
      done.push(trimmed.replace(`- ${config.tasks.done_marker}`, "").trim());
    }
  }
  return { open, done };
}

function extractSection(body: string, header: string): string[] {
  const lines = body.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => line.trim().toLowerCase() === `${header.toLowerCase()}:`);
  if (startIdx < 0) return [];
  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[A-Za-z][A-Za-z\s/()-]+:$/.test(line.trim())) {
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

  const meetingsLines = extractSection(parsed.content, "Meetings").map(normalizeLine).filter(Boolean);
  const workLines = extractSection(parsed.content, "Work").map((l) => l.trim()).filter(Boolean);
  const notesLines = extractSection(parsed.content, "Notes").map((l) => l.trim()).filter(Boolean);

  const allBodyLines = parsed.content.split(/\r?\n/);
  const tasks = parseTasks(allBodyLines, config);
  const inlineTags = parseInlineTags(parsed.content);

  return {
    date: dateValue,
    attendance: data.attendance,
    meetings: meetingsLines,
    workLines,
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
  parsed.data = { ...parsed.data, approved: true };
  return matter.stringify(parsed.content, parsed.data);
}
