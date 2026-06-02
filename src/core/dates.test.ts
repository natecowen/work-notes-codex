import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { AppConfig } from "../types.js";
import { dailyFilePath, isoWeekNumber, monthFolderName, weeklyFileName } from "./dates.js";

const config = {
  paths: {
    daily_notes_dir: "daily"
  }
} as AppConfig;

test("dailyFilePath uses year and month-number month-name folders", () => {
  assert.equal(monthFolderName("2026-01-05"), "01-January");
  assert.equal(dailyFilePath("/tmp/worklog", config, "2026-01-05"), path.resolve("/tmp/worklog", "daily", "2026", "01-January", "2026-01-05.md"));
});

test("weeklyFileName uses the actual padded ISO week number", () => {
  assert.equal(isoWeekNumber("2026-03-20"), 12);
  assert.equal(weeklyFileName("2026-03-20"), "2026-03-20-W12.md");
  assert.equal(weeklyFileName("2026-01-02"), "2026-01-02-W01.md");
});
