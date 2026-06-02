import path from "node:path";
import type { AppConfig, WeekWindow } from "../types.js";

const MONTH_FOLDER_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function resolveWeekWindowFromFriday(fridayIso: string): WeekWindow {
  const friday = parseIsoDate(fridayIso);
  if (friday.getDay() !== 5) {
    throw new Error(`Weekly filename requires Friday date, got ${fridayIso}.`);
  }
  const monday = addDays(friday, -4);
  return { friday: fridayIso, monday: toIsoDate(monday) };
}

export function iterateWorkdays(mondayIso: string): string[] {
  const start = parseIsoDate(mondayIso);
  return [0, 1, 2, 3, 4].map((offset) => toIsoDate(addDays(start, offset)));
}

export function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function monthFolderName(dateIso: string): string {
  parseIsoDate(dateIso);
  const monthNumber = Number(dateIso.slice(5, 7));
  const monthName = MONTH_FOLDER_NAMES[monthNumber - 1];
  if (!monthName) throw new Error(`Invalid date month: ${dateIso}`);
  return `${String(monthNumber).padStart(2, "0")}-${monthName}`;
}

export function dailyFilePath(cwd: string, config: AppConfig, dateIso: string): string {
  return path.resolve(cwd, config.paths.daily_notes_dir, dateIso.slice(0, 4), monthFolderName(dateIso), `${dateIso}.md`);
}

export function monthFileName(month: string): string {
  return `${month}-Monthly.md`;
}

export function isoWeekNumber(dateIso: string): number {
  const parsed = parseIsoDate(dateIso);
  const date = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function weeklyFileName(fridayIso: string): string {
  return `${fridayIso}-W${String(isoWeekNumber(fridayIso)).padStart(2, "0")}.md`;
}
