import type { WeekWindow } from "../types.js";

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

export function monthFileName(month: string): string {
  return `${month}-Monthly.md`;
}

export function weeklyFileName(fridayIso: string): string {
  return `${fridayIso}-ISOWeek.md`;
}
