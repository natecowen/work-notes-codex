import path from "node:path";
import type { AppConfig } from "../types.js";
import { aggregateAttendance } from "./attendance.js";
import { resolveWeekWindowFromFriday } from "./dates.js";
import { writeText } from "./files.js";
import { loadDailyEntriesInRange } from "./indexing.js";

function toDate(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeForMonth(month: string): { from: string; to: string } {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { from: toIso(start), to: toIso(end) };
}

function isWeekday(dateIso: string): boolean {
  const day = toDate(dateIso).getDay();
  return day >= 1 && day <= 5;
}

export async function runAttendanceReport(
  cwd: string,
  config: AppConfig,
  mode: "week" | "month" | "range",
  args: { weekFriday?: string; month?: string; from?: string; to?: string }
): Promise<string> {
  let from = args.from ?? "";
  let to = args.to ?? "";

  if (mode === "week") {
    if (!args.weekFriday) throw new Error("Missing --week Friday date.");
    const week = resolveWeekWindowFromFriday(args.weekFriday);
    from = week.monday;
    to = args.weekFriday;
  }
  if (mode === "month") {
    if (!args.month) throw new Error("Missing --month value.");
    const monthRange = rangeForMonth(args.month);
    from = monthRange.from;
    to = monthRange.to;
  }
  if (mode === "range" && (!from || !to)) {
    throw new Error("Range mode requires --from and --to.");
  }

  const entries = await loadDailyEntriesInRange(cwd, config, from, to);
  const weekdayEntries = entries.filter((e) => !config.attendance.workdays_only || isWeekday(e.date));
  const totals = aggregateAttendance(weekdayEntries);

  const md = [
    `# Attendance Report`,
    "",
    `Range: ${from} to ${to}`,
    `Workdays only: ${config.attendance.workdays_only ? "Yes" : "No"}`,
    "",
    "- Office: " + totals.office,
    "- WFH: " + totals.wfh,
    "- Holiday: " + totals.holiday,
    "- Sick: " + totals.sick,
    "- Vacation: " + totals.vacation
  ].join("\n");

  const suffix = mode === "range" ? `${from}_to_${to}` : mode === "week" ? args.weekFriday : args.month;
  const outPath = path.resolve(cwd, config.paths.reports_dir, "attendance", `attendance-${mode}-${suffix}.md`);
  await writeText(outPath, md + "\n");
  return outPath;
}
