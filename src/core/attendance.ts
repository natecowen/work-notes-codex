import type { Attendance, DailyEntry } from "../types.js";

export interface AttendanceTotals {
  office: number;
  wfh: number;
  holiday: number;
  sick: number;
  vacation: number;
}

export function emptyAttendanceTotals(): AttendanceTotals {
  return { office: 0, wfh: 0, holiday: 0, sick: 0, vacation: 0 };
}

export function aggregateAttendance(entries: DailyEntry[]): AttendanceTotals {
  const totals = emptyAttendanceTotals();
  for (const entry of entries) {
    totals[entry.attendance as Attendance] += 1;
  }
  return totals;
}
