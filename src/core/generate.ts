import path from "node:path";
import { aggregateAttendance } from "./attendance.js";
import { monthFileName, monthKey, weeklyFileName } from "./dates.js";
import { readText, writeText, listMarkdownFiles } from "./files.js";
import { loadDailyEntriesForWeek } from "./indexing.js";
import { generateWithOllama } from "./llm.js";
import type { AppConfig } from "../types.js";
import { buildStyleProfile, loadStyleProfile, toStyleInstruction } from "./style.js";

function renderAttendance(totals: ReturnType<typeof aggregateAttendance>): string {
  return [
    `- Office: ${totals.office}`,
    `- WFH: ${totals.wfh}`,
    `- Holiday: ${totals.holiday}`,
    `- Sick: ${totals.sick}`,
    `- Vacation: ${totals.vacation}`
  ].join("\n");
}

function deterministicWeekly(
  friday: string,
  carryTasks: string[],
  outcomes: string[],
  meetings: string[],
  attendanceMd: string
): string {
  return [
    `# Week of: ${friday}`,
    "",
    "Task list from last Week:",
    ...(carryTasks.length > 0 ? carryTasks.map((t) => `- ${t}`) : ["- None"]),
    "",
    "Work (Facts Only):",
    "Key outcomes shipped/delivered:",
    ...(outcomes.length > 0 ? outcomes.map((o) => `- ${o}`) : ["- None captured"]),
    "",
    "Problems solved / fires prevented:",
    "-",
    "",
    "Cross-team impact:",
    "-",
    "",
    "Attendance Summary:",
    attendanceMd,
    "",
    "Meetings Captured:",
    ...(meetings.length > 0 ? meetings.map((m) => `- ${m}`) : ["- None captured"]),
    "",
    "Task list for Next Week (Max 3)",
    "-",
    "-",
    "-"
  ].join("\n");
}

export async function generateWeeklyDraft(
  cwd: string,
  config: AppConfig,
  fridayIso: string,
  mondayIso: string
): Promise<{ outputPath: string; warnings: string[] }> {
  const warnings: string[] = [];
  let styleInstruction = "Facts only. No hype. No assumptions.";
  if (config.voice.style_profile_from_samples) {
    try {
      const profile = await buildStyleProfile(cwd, config);
      styleInstruction = toStyleInstruction(profile);
    } catch (error) {
      const cachedProfile = await loadStyleProfile(cwd, config);
      if (cachedProfile) {
        styleInstruction = toStyleInstruction(cachedProfile);
        warnings.push(`Style profile refresh failed; used cached style profile. ${String(error)}`);
      } else {
        warnings.push(`Style profile unavailable; using default voice rules. ${String(error)}`);
      }
    }
  }
  const { entries, missingDates } = await loadDailyEntriesForWeek(cwd, config, mondayIso);
  if (missingDates.length > 0) warnings.push(`Missing daily files: ${missingDates.join(", ")}`);

  const allOpenTasks = entries.flatMap((e) => e.tasksOpen);
  const outcomes = entries.flatMap((e) => e.workLines).filter((line) => line.startsWith("-"));
  const meetings = [...new Set(entries.flatMap((e) => e.meetings))];
  const attendance = aggregateAttendance(entries);
  const attendanceMd = renderAttendance(attendance);

  const templatePath = path.resolve(cwd, config.paths.templates_dir, "weekly.md");
  const template = await readText(templatePath);
  const prompt = [
    "Use the weekly template exactly. Keep headers unchanged and preserve markdown.",
    styleInstruction,
    "",
    `Friday date: ${fridayIso}`,
    `Open tasks:\n${allOpenTasks.map((t) => `- ${t}`).join("\n") || "- None"}`,
    `Work lines:\n${outcomes.join("\n") || "- None"}`,
    `Meetings:\n${meetings.map((m) => `- ${m}`).join("\n") || "- None"}`,
    `Attendance:\n${attendanceMd}`,
    "",
    `Template:\n${template}`
  ].join("\n");

  let content = deterministicWeekly(fridayIso, allOpenTasks, outcomes, meetings, attendanceMd);
  try {
    const generated = await generateWithOllama(
      config,
      "You are a strict formatter. Output only valid markdown using the provided template format.",
      prompt
    );
    if (generated.includes("Task list from last Week") && generated.includes("Attendance Summary")) {
      content = generated;
    } else {
      warnings.push("Ollama output did not match expected format; used deterministic fallback.");
    }
  } catch (error) {
    warnings.push(`Ollama unavailable or failed; used deterministic fallback. ${String(error)}`);
  }

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, "weekly", weeklyFileName(fridayIso));
  await writeText(outputPath, content.trimEnd() + "\n");
  return { outputPath, warnings };
}

export async function generateMonthlyDraft(
  cwd: string,
  config: AppConfig,
  month: string
): Promise<{ outputPath: string; warnings: string[] }> {
  const warnings: string[] = [];
  let styleInstruction = "Facts only. Do not invent outcomes.";
  if (config.voice.style_profile_from_samples) {
    try {
      const profile = await buildStyleProfile(cwd, config);
      styleInstruction = toStyleInstruction(profile);
    } catch (error) {
      const cachedProfile = await loadStyleProfile(cwd, config);
      if (cachedProfile) {
        styleInstruction = toStyleInstruction(cachedProfile);
        warnings.push(`Style profile refresh failed; used cached style profile. ${String(error)}`);
      } else {
        warnings.push(`Style profile unavailable; using default voice rules. ${String(error)}`);
      }
    }
  }
  const year = month.slice(0, 4);
  const weeklyDir = path.resolve(cwd, config.paths.weekly_notes_dir, year);
  const weeklyFiles = (await listMarkdownFiles(weeklyDir)).filter((f) =>
    monthKey(path.basename(f).slice(0, 10)).startsWith(month)
  );
  if (weeklyFiles.length === 0) warnings.push(`No weekly files found for ${month} in ${weeklyDir}`);

  const weeklyBodies = await Promise.all(weeklyFiles.map((file) => readText(file)));
  const templatePath = path.resolve(cwd, config.paths.templates_dir, "monthly.md");
  const template = await readText(templatePath);

  const prompt = [
    "Use fixed categories exactly as given in the template.",
    styleInstruction,
    "",
    `Month: ${month}`,
    "Weekly inputs:",
    ...weeklyBodies.map((body, idx) => `## Weekly ${idx + 1}\n${body}`),
    "",
    `Template:\n${template}`
  ].join("\n");

  let content = template
    .replaceAll("{{MONTH}}", month)
    .replaceAll("{{TOP_OUTCOMES}}", "-")
    .replaceAll("{{FIRES}}", "-")
    .replaceAll("{{IMPACT}}", "-")
    .replaceAll("{{RISKS}}", "-")
    .replaceAll("{{NEXT_FOCUS}}", "-");

  try {
    const generated = await generateWithOllama(
      config,
      "You are a strict formatter. Output only valid markdown using the provided template format.",
      prompt
    );
    if (generated.includes("Top Outcomes") && generated.includes("Cross-Team Impact")) {
      content = generated;
    } else {
      warnings.push("Ollama output did not match expected monthly format; used fallback template.");
    }
  } catch (error) {
    warnings.push(`Ollama unavailable or failed; used fallback template. ${String(error)}`);
  }

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, "monthly", monthFileName(month));
  await writeText(outputPath, content.trimEnd() + "\n");
  return { outputPath, warnings };
}
