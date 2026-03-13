import path from "node:path";
import { aggregateAttendance } from "./attendance.js";
import { monthFileName, monthKey, weeklyFileName } from "./dates.js";
import { readText, writeText, listMarkdownFiles } from "./files.js";
import { loadDailyEntriesForWeek } from "./indexing.js";
import { generateWithOllama } from "./llm.js";
import type { AppConfig } from "../types.js";
import { buildStyleProfile, loadSampleWritingExamples, loadStyleProfile, toStyleInstruction } from "./style.js";

function renderAttendance(totals: ReturnType<typeof aggregateAttendance>): string {
  return [
    `- Office: ${totals.office}`,
    `- WFH: ${totals.wfh}`,
    `- Holiday: ${totals.holiday}`,
    `- Sick: ${totals.sick}`,
    `- Vacation: ${totals.vacation}`
  ].join("\n");
}

function sampleWritingLimit(config: AppConfig): number {
  return config.prompting?.sample_writing_limit ?? 2;
}

function defaultRememberRules(): string[] {
  return [
    "Be factual.",
    "Use action verbs.",
    "Include system, tool, and people names when available.",
    "Categorize appropriately (DevOps, Development, Architecture, Leadership, Training).",
    "Keep bullets concise but impactful."
  ];
}

function rememberRules(config: AppConfig): string[] {
  return config.prompting?.remember_rules && config.prompting.remember_rules.length > 0
    ? config.prompting.remember_rules
    : defaultRememberRules();
}

function renderRememberBlock(config: AppConfig, finalInstruction: string): string {
  return ["Remember:", ...rememberRules(config).map((rule) => `- ${rule}`), "", finalInstruction].join("\n");
}

async function resolveStyleInstruction(cwd: string, config: AppConfig, warnings: string[], fallback: string): Promise<string> {
  let styleInstruction = fallback;
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
  return styleInstruction;
}

function promptPath(baseDir: string, type: "weekly" | "monthly", key: string): string {
  const fileName = type === "weekly" ? `${key}-weekly-prompt.md` : `${key}-monthly-prompt.md`;
  return path.join(baseDir, "prompts", type, fileName);
}

function renderSampleWritingBlocks(samples: Array<{ path: string; content: string }>): string {
  if (samples.length === 0) {
    return "No sample writing files were found in the configured voice.sample_dirs folders.";
  }

  return samples
    .map(
      (sample, index) =>
        `## Sample Writing ${index + 1}\nSource: ${sample.path}\n\n\`\`\`md\n${sample.content.trim()}\n\`\`\``
    )
    .join("\n\n");
}

function renderSourceBlocks(blocks: Array<{ path: string; content: string }>, heading: string): string {
  return [
    heading,
    ...blocks.map(
      (item, index) => `## Source ${index + 1}\nPath: ${item.path}\n\n\`\`\`md\n${item.content.trim()}\n\`\`\``
    )
  ].join("\n\n");
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
  const styleInstruction = await resolveStyleInstruction(cwd, config, warnings, "Facts only. No hype. No assumptions.");
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
    `Template:\n${template}`,
    "",
    renderRememberBlock(config, "Generate the weekly summary now as markdown.")
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

export async function exportWeeklyPrompt(
  cwd: string,
  config: AppConfig,
  fridayIso: string,
  mondayIso: string
): Promise<{ outputPath: string; warnings: string[] }> {
  const warnings: string[] = [];
  const styleInstruction = await resolveStyleInstruction(cwd, config, warnings, "Facts only. No hype. No assumptions.");
  const { entries, missingDates } = await loadDailyEntriesForWeek(cwd, config, mondayIso);
  if (missingDates.length > 0) warnings.push(`Missing daily files: ${missingDates.join(", ")}`);

  const attendance = aggregateAttendance(entries);
  const attendanceMd = renderAttendance(attendance);
  const templatePath = path.resolve(cwd, config.paths.templates_dir, "weekly.md");
  const template = await readText(templatePath);
  const samples = await loadSampleWritingExamples(cwd, config, sampleWritingLimit(config));
  const sourceBlocks = await Promise.all(
    entries.map(async (entry) => ({
      path: path.relative(cwd, entry.sourcePath),
      content: await readText(entry.sourcePath)
    }))
  );

  const fileName = weeklyFileName(fridayIso);
  const prompt = [
    `# External LLM Prompt Package: Weekly Summary`,
    "",
    "Use this prompt in another LLM when local generation is unavailable or not good enough.",
    "",
    "## Warning",
    "Review this prompt package before sending it to any external AI service.",
    "It may contain sensitive internal work details, names, systems, or project context copied from your notes.",
    "",
    "## Instructions For The LLM",
    `Create exactly one markdown file named \`${fileName}\`.`,
    "Return only the markdown file contents. Do not include commentary, explanation, or code fences around the final answer.",
    "If the UI supports file export or download, make the result a downloadable markdown file with that file name.",
    "Preserve the weekly template structure and headers exactly.",
    "Replace all template placeholders with real content. Do not leave placeholder tokens like `{{FRIDAY}}` in the final file.",
    styleInstruction,
    "Use the daily notes below as the source of truth.",
    "Use the sample writing only for tone and phrasing, not as factual source material.",
    "Do not invent meetings, outcomes, risks, or blockers.",
    "",
    renderRememberBlock(config, "Generate the weekly summary now in a downloadable .md file."),
    "",
    "## Target Week",
    `Friday date: ${fridayIso}`,
    `Monday date: ${mondayIso}`,
    "",
    "## Attendance Summary",
    attendanceMd,
    "",
    "## Weekly Template",
    "```md",
    template.trim(),
    "```",
    "",
    "## Sample Writing",
    renderSampleWritingBlocks(samples),
    "",
    renderSourceBlocks(sourceBlocks, "## Source Daily Notes")
  ].join("\n");

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, promptPath("", "weekly", fridayIso));
  await writeText(outputPath, prompt.trimEnd() + "\n");
  return { outputPath, warnings };
}

export async function generateMonthlyDraft(
  cwd: string,
  config: AppConfig,
  month: string
): Promise<{ outputPath: string; warnings: string[] }> {
  const warnings: string[] = [];
  const styleInstruction = await resolveStyleInstruction(cwd, config, warnings, "Facts only. Do not invent outcomes.");
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
    `Template:\n${template}`,
    "",
    renderRememberBlock(config, "Generate the monthly summary now as markdown.")
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

export async function exportMonthlyPrompt(
  cwd: string,
  config: AppConfig,
  month: string
): Promise<{ outputPath: string; warnings: string[] }> {
  const warnings: string[] = [];
  const styleInstruction = await resolveStyleInstruction(cwd, config, warnings, "Facts only. Do not invent outcomes.");
  const year = month.slice(0, 4);
  const weeklyDir = path.resolve(cwd, config.paths.weekly_notes_dir, year);
  const weeklyFiles = (await listMarkdownFiles(weeklyDir)).filter((f) =>
    monthKey(path.basename(f).slice(0, 10)).startsWith(month)
  );
  if (weeklyFiles.length === 0) warnings.push(`No weekly files found for ${month} in ${weeklyDir}`);

  const weeklyBodies = await Promise.all(weeklyFiles.map((file) => readText(file)));
  const sourceBlocks = weeklyFiles.map((file, index) => ({
    path: path.relative(cwd, file),
    content: weeklyBodies[index]
  }));
  const templatePath = path.resolve(cwd, config.paths.templates_dir, "monthly.md");
  const template = await readText(templatePath);
  const samples = await loadSampleWritingExamples(cwd, config, sampleWritingLimit(config));
  const fileName = monthFileName(month);

  const prompt = [
    `# External LLM Prompt Package: Monthly Summary`,
    "",
    "Use this prompt in another LLM when local generation is unavailable or not good enough.",
    "",
    "## Warning",
    "Review this prompt package before sending it to any external AI service.",
    "It may contain sensitive internal work details, names, systems, or project context copied from your notes.",
    "",
    "## Instructions For The LLM",
    `Create exactly one markdown file named \`${fileName}\`.`,
    "Return only the markdown file contents. Do not include commentary, explanation, or code fences around the final answer.",
    "If the UI supports file export or download, make the result a downloadable markdown file with that file name.",
    "Preserve the monthly template structure and headers exactly.",
    "Replace all template placeholders with real content. Do not leave placeholder tokens like `{{MONTH}}` in the final file.",
    styleInstruction,
    "Use the weekly summaries below as the source of truth.",
    "Use the sample writing only for tone and phrasing, not as factual source material.",
    "Do not invent accomplishments, blockers, or risks.",
    "",
    renderRememberBlock(config, "Generate the monthly summary now in a downloadable .md file."),
    "",
    "## Target Month",
    `Month: ${month}`,
    "",
    "## Monthly Template",
    "```md",
    template.trim(),
    "```",
    "",
    "## Sample Writing",
    renderSampleWritingBlocks(samples),
    "",
    renderSourceBlocks(sourceBlocks, "## Source Weekly Notes")
  ].join("\n");

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, promptPath("", "monthly", month));
  await writeText(outputPath, prompt.trimEnd() + "\n");
  return { outputPath, warnings };
}
