import path from "node:path";
import { aggregateAttendance } from "./attendance.js";
import { monthFileName, monthKey, weeklyFileName } from "./dates.js";
import { readText, writeText, listMarkdownFiles } from "./files.js";
import { loadDailyEntriesForWeek } from "./indexing.js";
import { generateWithOllama } from "./llm.js";
import type { AppConfig } from "../types.js";
import { buildStyleProfile, loadSampleWritingExamples, loadStyleProfile, toStyleInstruction } from "./style.js";
import type { DailyEntry, WorkCategoryGroup } from "../types.js";
import {
  findPeriodSection,
  findDailySection,
  getMonthlyStructure,
  getWeeklyStructure,
  normalizeHeadingLabel
} from "./sections.js";

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

function configuredWorkCategoryLabels(config: AppConfig): string[] {
  return findDailySection(config, "work")?.categories?.map((category) => category.label) ?? [];
}

function defaultRememberRules(config: AppConfig): string[] {
  const configuredCategories = configuredWorkCategoryLabels(config);
  const categoryInstruction =
    configuredCategories.length > 0
      ? `Categorize appropriately using the configured work categories (${configuredCategories.join(", ")}).`
      : "Categorize appropriately using the configured work categories.";

  return [
    "Be factual.",
    "Use action verbs.",
    "Include system, tool, and people names when available.",
    categoryInstruction,
    "Keep bullets concise but impactful."
  ];
}

function resolveConfiguredCategoryRule(config: AppConfig): string {
  return defaultRememberRules(config)[3];
}

function rememberRules(config: AppConfig): string[] {
  if (config.prompting?.remember_rules && config.prompting.remember_rules.length > 0) {
    const nonCategoryRules = config.prompting.remember_rules.filter(
      (rule) => !/^categorize appropriately\b/i.test(rule.trim())
    );
    return [...nonCategoryRules, resolveConfiguredCategoryRule(config)];
  }

  return defaultRememberRules(config);
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

function renderBullets(lines: string[], emptyLine = "-"): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : emptyLine;
}

function collectWeeklyWorkCategories(entries: DailyEntry[]): WorkCategoryGroup[] {
  const grouped = new Map<string, string[]>();

  for (const entry of entries) {
    for (const group of entry.workCategories) {
      const existing = grouped.get(group.category) ?? [];
      existing.push(...group.items);
      grouped.set(group.category, existing);
    }
  }

  return [...grouped.entries()].map(([category, items]) => ({
    category,
    items
  }));
}

function renderWeeklyKeyOutcomes(config: AppConfig, groups: WorkCategoryGroup[]): string {
  if (groups.length === 0) return "- None captured";

  const configuredOrder = configuredWorkCategoryLabels(config).map((label) => normalizeHeadingLabel(label));
  const sortedGroups = [...groups].sort((left, right) => {
    const leftIndex = configuredOrder.indexOf(normalizeHeadingLabel(left.category));
    const rightIndex = configuredOrder.indexOf(normalizeHeadingLabel(right.category));
    if (leftIndex < 0 && rightIndex < 0) return 0;
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  });

  return sortedGroups
    .map((group) => [`**${group.category}:**`, ...group.items.map((item) => `- ${item}`)].join("\n"))
    .join("\n\n");
}

function renderWeeklyFallback(
  template: string,
  config: AppConfig,
  friday: string,
  sectionValues: Record<string, string>
): string {
  let output = template.replaceAll("{{FRIDAY}}", friday);
  for (const section of getWeeklyStructure(config).sections) {
    output = output.replaceAll(section.placeholder, sectionValues[section.id] ?? "- None captured");
  }
  return output;
}

function renderMonthlyFallback(template: string, config: AppConfig, month: string, sectionValues: Record<string, string>): string {
  let output = template.replaceAll("{{MONTH}}", month);
  for (const section of getMonthlyStructure(config).sections) {
    output = output.replaceAll(section.placeholder, sectionValues[section.id] ?? "- None captured");
  }
  return output;
}

function hasTemplatePlaceholders(content: string): boolean {
  return /{{[^}]+}}/.test(content);
}

function normalizeTemplate(content: string): string {
  return content.trim().replace(/\r\n/g, "\n");
}

function extractSectionContent(content: string, startHeading: string, endHeadings: string[]): string {
  const lines = normalizeTemplate(content).split("\n");
  const startIndex = lines.findIndex((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(startHeading));
  if (startIndex < 0) return "";

  const endIndex = lines.findIndex(
    (line, index) =>
      index > startIndex && endHeadings.map((heading) => normalizeHeadingLabel(heading)).includes(normalizeHeadingLabel(line))
  );

  return lines.slice(startIndex + 1, endIndex < 0 ? undefined : endIndex).join("\n").trim();
}

function hasSubstantiveSectionContent(content: string): boolean {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => /[A-Za-z0-9]/.test(line.replace(/^[-*]\s*/, "")));
}

function replaceSectionContent(content: string, startHeading: string, endHeadings: string[], replacement: string): string {
  const lines = normalizeTemplate(content).split("\n");
  const startIndex = lines.findIndex((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(startHeading));
  if (startIndex < 0) return content;

  const endIndex = lines.findIndex(
    (line, index) =>
      index > startIndex && endHeadings.map((heading) => normalizeHeadingLabel(heading)).includes(normalizeHeadingLabel(line))
  );
  if (endIndex < 0) {
    return [...lines.slice(0, startIndex + 1), ...replacement.split("\n")].join("\n");
  }

  return [...lines.slice(0, startIndex + 1), ...replacement.split("\n"), ...lines.slice(endIndex)].join("\n");
}

function extractManagedSection(content: string, labels: string[], label: string): string {
  const startIndex = labels.findIndex((item) => item === label);
  if (startIndex < 0) return "";
  return extractSectionContent(content, label, labels.slice(startIndex + 1));
}

function uniqueNonEmpty(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

function normalizeCollectedMonthlyLines(lines: string[]): string[] {
  return uniqueNonEmpty(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("**"))
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
  );
}

function inferWeeklyFireLines(entries: DailyEntry[]): string[] {
  const candidates = entries.flatMap((entry) => [...entry.notesLines, ...entry.workLines]);
  const signal = /(fixed|resolved|prevent|restored|unblocked|troubleshoot|cleanup|cleaned|validated|stabilized)/i;
  const matched = uniqueNonEmpty(candidates.filter((line) => signal.test(line)));
  return matched.length > 0 ? matched : uniqueNonEmpty(entries.flatMap((entry) => entry.notesLines)).slice(0, 5);
}

function inferWeeklyImpactLines(entries: DailyEntry[]): string[] {
  const meetingLines = entries.flatMap((entry) => entry.meetings.map((meeting) => `Met with ${meeting}.`));
  const noteLines = entries.flatMap((entry) => entry.notesLines);
  const signal = /(team|with|helped|assisted|supported|partner|stakeholder|met)/i;
  const matched = uniqueNonEmpty([...meetingLines, ...noteLines].filter((line) => signal.test(line)));
  return matched.length > 0 ? matched : uniqueNonEmpty(meetingLines).slice(0, 5);
}

function summarizeMonthlySections(config: AppConfig, weeklyInputs: Array<{ path: string; content: string }>): Record<string, string> {
  const weeklyLabels = getWeeklyStructure(config).sections.map((section) => section.label);
  const collect = (sectionId: string): string[] => {
    const section = findPeriodSection(config, "weekly", sectionId);
    if (!section) return [];
    return normalizeCollectedMonthlyLines(
      weeklyInputs.flatMap((item) =>
        extractManagedSection(item.content, weeklyLabels, section.label)
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("-") || line.startsWith("*"))
      )
    );
  };

  return {
    top_outcomes: renderBullets(collect("key_outcomes"), "- None captured"),
    fires: renderBullets(collect("fires_prevented"), "- None captured"),
    impact: renderBullets(collect("cross_team_impact"), "- None captured"),
    risks: "- None captured",
    next_focus: renderBullets(collect("next_week_tasks"), "- None captured")
  };
}

export function isValidWeeklyOllamaOutput(
  config: AppConfig,
  template: string,
  generated: string,
  fridayIso: string,
  expected: { carryTasks: string[]; outcomes: string[] }
): boolean {
  const normalizedGenerated = normalizeTemplate(generated);
  const labels = getWeeklyStructure(config).sections.map((section) => section.label);
  if (!normalizedGenerated) return false;
  if (normalizedGenerated === normalizeTemplate(template)) return false;
  if (hasTemplatePlaceholders(normalizedGenerated)) return false;
  if (!normalizedGenerated.includes(fridayIso)) return false;
  for (const section of getWeeklyStructure(config).sections.filter((item) => item.required !== false)) {
    if (!normalizedGenerated.split("\n").some((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(section.label))) {
      return false;
    }
  }
  if (
    expected.carryTasks.length > 0 &&
    !hasSubstantiveSectionContent(extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "tasks_last_week")!.label))
  ) {
    return false;
  }
  if (
    expected.outcomes.length > 0 &&
    !hasSubstantiveSectionContent(extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "key_outcomes")!.label))
  ) {
    return false;
  }
  return true;
}

export function isValidMonthlyOllamaOutput(
  config: AppConfig,
  template: string,
  generated: string,
  month: string,
  expected: { hasWeeklyInputs: boolean }
): boolean {
  const normalizedGenerated = normalizeTemplate(generated);
  const labels = getMonthlyStructure(config).sections.map((section) => section.label);
  if (!normalizedGenerated) return false;
  if (normalizedGenerated === normalizeTemplate(template)) return false;
  if (hasTemplatePlaceholders(normalizedGenerated)) return false;
  if (!normalizedGenerated.includes(month)) return false;
  for (const section of getMonthlyStructure(config).sections.filter((item) => item.required !== false)) {
    if (!normalizedGenerated.split("\n").some((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(section.label))) {
      return false;
    }
  }
  if (
    expected.hasWeeklyInputs &&
    !hasSubstantiveSectionContent(extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "monthly", "top_outcomes")!.label))
  ) {
    return false;
  }
  return true;
}

async function loadWeeklyInputsForMonth(
  cwd: string,
  config: AppConfig,
  month: string
): Promise<Array<{ path: string; content: string }>> {
  const year = month.slice(0, 4);
  const candidateDir = path.resolve(cwd, config.paths.weekly_notes_dir, year);
  const files: string[] = [];

  const inDir = await listMarkdownFiles(candidateDir);
  for (const file of inDir) {
    const baseName = path.basename(file);
    if (!monthKey(baseName.slice(0, 10)).startsWith(month)) continue;
    files.push(file);
  }

  files.sort();
  const contents = await Promise.all(files.map((file) => readText(file)));
  return files.map((file, index) => ({
    path: path.relative(cwd, file),
    content: contents[index]
  }));
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
  const outcomes = entries.flatMap((e) => e.workLines.map((line) => line.replace(/^\-\s*/, "").trim())).filter(Boolean);
  const weeklyWorkCategories = collectWeeklyWorkCategories(entries);
  const keyOutcomesMd = renderWeeklyKeyOutcomes(config, weeklyWorkCategories);
  const meetings = [...new Set(entries.flatMap((e) => e.meetings))];
  const attendance = aggregateAttendance(entries);
  const attendanceMd = renderAttendance(attendance);
  const firesMd = renderBullets(inferWeeklyFireLines(entries), "- None captured");
  const impactMd = renderBullets(inferWeeklyImpactLines(entries), "- None captured");
  const nextWeekMd = renderBullets(allOpenTasks.slice(0, 3), "- None captured");
  const weeklySections = getWeeklyStructure(config).sections;

  const templatePath = path.resolve(cwd, config.paths.templates_dir, "weekly.md");
  const template = await readText(templatePath);
  const prompt = [
    "Use the weekly template exactly. Keep headers unchanged and preserve markdown.",
    styleInstruction,
    "",
    `Friday date: ${fridayIso}`,
    `Open tasks:\n${allOpenTasks.map((t) => `- ${t}`).join("\n") || "- None"}`,
    `Work lines by category:\n${keyOutcomesMd}`,
    `Flattened work lines:\n${outcomes.join("\n") || "- None"}`,
    `Meetings:\n${meetings.map((m) => `- ${m}`).join("\n") || "- None"}`,
    `Notes:\n${entries.flatMap((entry) => entry.notesLines).map((line) => `- ${line}`).join("\n") || "- None"}`,
    `Attendance:\n${attendanceMd}`,
    `Managed weekly sections:\n${weeklySections.map((section) => `- ${section.id}: ${section.label}`).join("\n")}`,
    "",
    `Template:\n${template}`,
    "",
    renderRememberBlock(config, "Generate the weekly summary now as markdown.")
  ].join("\n");

  const weeklySectionValues = {
    tasks_last_week: renderBullets(allOpenTasks, "- None"),
    key_outcomes: keyOutcomesMd,
    fires_prevented: firesMd,
    cross_team_impact: impactMd,
    attendance_summary: attendanceMd,
    next_week_tasks: nextWeekMd
  };

  let content = renderWeeklyFallback(template, config, fridayIso, weeklySectionValues);
  try {
    const generated = await generateWithOllama(
      config,
      "You are a strict formatter. Output only valid markdown using the provided template format.",
      prompt
    );
    if (isValidWeeklyOllamaOutput(config, template, generated, fridayIso, { carryTasks: allOpenTasks, outcomes })) {
      content = renderWeeklyFallback(template, config, fridayIso, weeklySectionValues);
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
    `Managed weekly sections: ${getWeeklyStructure(config).sections.map((section) => `${section.id}=${section.label}`).join("; ")}`,
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
  const weeklyInputs = await loadWeeklyInputsForMonth(cwd, config, month);
  if (weeklyInputs.length === 0) {
    warnings.push(`No weekly files found for ${month} in ${config.paths.weekly_notes_dir}`);
  }
  const templatePath = path.resolve(cwd, config.paths.templates_dir, "monthly.md");
  const template = await readText(templatePath);
  const monthlySectionValues = summarizeMonthlySections(config, weeklyInputs);

  const prompt = [
    "Use fixed categories exactly as given in the template.",
    styleInstruction,
    "",
    `Month: ${month}`,
    `Managed monthly sections:\n${getMonthlyStructure(config).sections.map((section) => `- ${section.id}: ${section.label}`).join("\n")}`,
    "Weekly inputs:",
    ...weeklyInputs.map((item, idx) => `## Weekly ${idx + 1}\nSource: ${item.path}\n${item.content}`),
    "",
    `Template:\n${template}`,
    "",
    renderRememberBlock(config, "Generate the monthly summary now as markdown.")
  ].join("\n");

  let content = renderMonthlyFallback(template, config, month, monthlySectionValues);

  try {
    const generated = await generateWithOllama(
      config,
      "You are a strict formatter. Output only valid markdown using the provided template format.",
      prompt
    );
    if (isValidMonthlyOllamaOutput(config, template, generated, month, { hasWeeklyInputs: weeklyInputs.length > 0 })) {
      content = renderMonthlyFallback(template, config, month, monthlySectionValues);
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
  const weeklyInputs = await loadWeeklyInputsForMonth(cwd, config, month);
  if (weeklyInputs.length === 0) {
    warnings.push(`No weekly files found for ${month} in ${config.paths.weekly_notes_dir}`);
  }
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
    `Managed monthly sections: ${getMonthlyStructure(config).sections.map((section) => `${section.id}=${section.label}`).join("; ")}`,
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
    renderSourceBlocks(weeklyInputs, "## Source Weekly Notes")
  ].join("\n");

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, promptPath("", "monthly", month));
  await writeText(outputPath, prompt.trimEnd() + "\n");
  return { outputPath, warnings };
}
