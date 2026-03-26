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

interface ValidationResult {
  ok: boolean;
  reason?: string;
}

interface DebugPayload {
  enabled: boolean;
  systemPrompt: string;
  prompt: string;
  rawResponse?: string;
  validation: ValidationResult;
  usedFallback: boolean;
  error?: string;
}

interface GenerateDraftOptions {
  debug?: boolean;
}

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

function extractSectionContentRaw(content: string, startHeading: string, endHeadings: string[]): string {
  const lines = normalizeTemplate(content).split("\n");
  const startIndex = lines.findIndex((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(startHeading));
  if (startIndex < 0) return "";

  const endIndex = lines.findIndex(
    (line, index) =>
      index > startIndex && endHeadings.map((heading) => normalizeHeadingLabel(heading)).includes(normalizeHeadingLabel(line))
  );

  return lines.slice(startIndex + 1, endIndex < 0 ? undefined : endIndex).join("\n");
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

function replaceLeadingContent(content: string, firstHeading: string, replacement: string): string {
  const lines = normalizeTemplate(content).split("\n");
  const startIndex = lines.findIndex((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(firstHeading));
  if (startIndex < 0) return content;
  return [...replacement.split("\n"), ...lines.slice(startIndex)].join("\n");
}

function applyManagedSectionsFromScaffold(
  baseContent: string,
  scaffoldContent: string,
  sections: Array<{ label: string }>
): string {
  if (sections.length === 0) return baseContent;

  let content = replaceLeadingContent(
    baseContent,
    sections[0].label,
    normalizeTemplate(scaffoldContent).split("\n").slice(
      0,
      normalizeTemplate(scaffoldContent)
        .split("\n")
        .findIndex((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(sections[0].label))
    ).join("\n")
  );

  const sectionOrder = sections.map((section) => section.label);
  for (const section of sections) {
    const nextIndex = sectionOrder.findIndex((label) => label === section.label);
    const replacement = extractSectionContentRaw(scaffoldContent, section.label, sectionOrder.slice(nextIndex + 1));
    content = replaceSectionContent(content, section.label, sectionOrder.slice(nextIndex + 1), replacement);
  }

  return content;
}

function extractManagedSection(content: string, labels: string[], label: string): string {
  const startIndex = labels.findIndex((item) => item === label);
  if (startIndex < 0) return "";
  return extractSectionContent(content, label, labels.slice(startIndex + 1));
}

function uniqueNonEmpty(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

function stripListMarker(line: string): string {
  return line.trim().replace(/^[-*]\s*/, "").trim();
}

function normalizeSentence(line: string): string {
  return line.trim().replace(/[.]+$/g, "").trim();
}

function normalizeLinePunctuation(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function extractBulletItems(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-") || line.startsWith("*"))
    .map(stripListMarker)
    .filter(Boolean);
}

function normalizeCollectedMonthlyLines(lines: string[]): string[] {
  return uniqueNonEmpty(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("**"))
      .map(stripListMarker)
      .filter(Boolean)
  );
}

function escapeCodeFence(content: string): string {
  return content.replaceAll("```", "``\\`");
}

function renderDebugBlock(debug: DebugPayload): string {
  if (!debug.enabled) return "";

  const validationLines = [
    `- Accepted: ${debug.validation.ok ? "yes" : "no"}`,
    `- Used fallback: ${debug.usedFallback ? "yes" : "no"}`,
    `- Reason: ${debug.validation.reason ?? (debug.validation.ok ? "Output passed validation." : "No validation reason recorded.")}`
  ];

  if (debug.error) {
    validationLines.push(`- Error: ${debug.error}`);
  }

  const rawResponse = debug.rawResponse?.length ? debug.rawResponse : "[unavailable]";

  return [
    "---",
    "",
    "# Debug",
    "",
    "## Validation",
    ...validationLines,
    "",
    "## System Prompt",
    "```text",
    escapeCodeFence(debug.systemPrompt),
    "```",
    "",
    "## Prompt",
    "```text",
    escapeCodeFence(debug.prompt),
    "```",
    "",
    "## Raw Ollama Response",
    "```text",
    escapeCodeFence(rawResponse),
    "```"
  ].join("\n");
}

interface WeeklyDerivedContent {
  carryInTasks: string[];
  nextWeekTasks: string[];
  outcomes: string[];
  weeklyWorkCategories: WorkCategoryGroup[];
  meetings: string[];
  notes: string[];
  fireLines: string[];
  fireExcludedLines: string[];
  impactLines: string[];
}

function getNonPersonalWorkLines(entry: DailyEntry): string[] {
  const explicit = entry.workCategories
    .filter((group) => normalizeHeadingLabel(group.category) !== normalizeHeadingLabel("Personal"))
    .flatMap((group) => group.items);
  return uniqueNonEmpty(explicit.length > 0 ? explicit : entry.workLines);
}

function normalizedNotes(entry: DailyEntry): string[] {
  return uniqueNonEmpty(entry.notesLines.map(stripListMarker).filter(Boolean));
}

function inferWeeklyFireLines(entries: DailyEntry[]): { included: string[]; excluded: string[] } {
  const remediationSignal =
    /\b(fixed|resolved|prevent(?:ed)?|restored|unblocked|troubleshoot(?:ed|ing)?|mitigated|validated|stabilized|incident|failure|outage|alert|issue|bug|rollback|degraded|bottleneck|secret|config|logging)\b/i;
  const weakAdminSignal = /\b(cleaned up|cleaned|reviewed my notes|shell aliases|document(?:ed|ing)|captured follow-up|reference)\b/i;
  const candidates = entries.flatMap((entry) => [...normalizedNotes(entry), ...getNonPersonalWorkLines(entry)]);
  const included = uniqueNonEmpty(
    candidates.filter((line) => remediationSignal.test(line) && !weakAdminSignal.test(line))
  );
  const excluded = uniqueNonEmpty(
    entries.flatMap((entry) => {
      const personalLines = entry.workCategories
        .filter((group) => normalizeHeadingLabel(group.category) === normalizeHeadingLabel("Personal"))
        .flatMap((group) => group.items);
      const weakLines = [...normalizedNotes(entry), ...entry.workLines].filter((line) => weakAdminSignal.test(line));
      return [...personalLines, ...weakLines];
    })
  );
  const fallbackNotes = uniqueNonEmpty(
    entries
      .flatMap((entry) => normalizedNotes(entry))
      .filter((line) => remediationSignal.test(line) && !weakAdminSignal.test(line))
  ).slice(0, 5);

  return {
    included: included.length > 0 ? included : fallbackNotes,
    excluded
  };
}

function inferWeeklyImpactLines(entries: DailyEntry[]): string[] {
  const meetingLines = uniqueNonEmpty(entries.flatMap((entry) => entry.meetings.map(normalizeLinePunctuation)));
  const noteLines = uniqueNonEmpty(entries.flatMap((entry) => normalizedNotes(entry).map(normalizeLinePunctuation)));
  const noteSignal =
    /\b(team|helped|assisted|supported|partner(?:ed)?|stakeholder|mentor(?:ed|ing)?|coordinated|briefed|collaborat(?:ed|ing)|met with|worked with|paired with)\b/i;
  const matchedNotes = uniqueNonEmpty(noteLines.filter((line) => noteSignal.test(line)));
  const matched = uniqueNonEmpty([...meetingLines, ...matchedNotes]);
  return matched.length > 0 ? matched : meetingLines.slice(0, 5);
}

function deriveWeeklyContent(entries: DailyEntry[], mondayIso?: string): WeeklyDerivedContent {
  const outcomes = entries.flatMap((entry) => entry.workLines.map(stripListMarker)).filter(Boolean);
  const weeklyWorkCategories = collectWeeklyWorkCategories(entries);
  const meetings = uniqueNonEmpty(entries.flatMap((entry) => entry.meetings));
  const notes = uniqueNonEmpty(entries.flatMap((entry) => normalizedNotes(entry)));
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const carryInTasks = firstEntry && (!mondayIso || firstEntry.date === mondayIso) ? uniqueNonEmpty(firstEntry.tasksOpen) : [];
  const nextWeekTasks = uniqueNonEmpty(lastEntry?.tasksOpen ?? []).slice(0, 3);
  const fireAnalysis = inferWeeklyFireLines(entries);

  return {
    carryInTasks,
    nextWeekTasks,
    outcomes,
    weeklyWorkCategories,
    meetings,
    notes,
    fireLines: fireAnalysis.included,
    fireExcludedLines: fireAnalysis.excluded,
    impactLines: inferWeeklyImpactLines(entries)
  };
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
  expected: WeeklyDerivedContent
): boolean {
  return validateWeeklyOllamaOutput(config, template, generated, fridayIso, expected).ok;
}

function validateWeeklyOllamaOutput(
  config: AppConfig,
  template: string,
  generated: string,
  fridayIso: string,
  expected: WeeklyDerivedContent
): ValidationResult {
  const normalizedGenerated = normalizeTemplate(generated);
  const labels = getWeeklyStructure(config).sections.map((section) => section.label);
  if (!normalizedGenerated) return { ok: false, reason: "Ollama output was empty after trimming." };
  if (normalizedGenerated === normalizeTemplate(template)) {
    return { ok: false, reason: "Ollama output matched the weekly template without filling it in." };
  }
  if (hasTemplatePlaceholders(normalizedGenerated)) {
    return { ok: false, reason: "Ollama output still contains template placeholders." };
  }
  if (!normalizedGenerated.includes(fridayIso)) {
    return { ok: false, reason: `Ollama output did not include the target Friday ${fridayIso}.` };
  }
  for (const section of getWeeklyStructure(config).sections.filter((item) => item.required !== false)) {
    if (!normalizedGenerated.split("\n").some((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(section.label))) {
      return { ok: false, reason: `Ollama output is missing required weekly heading: ${section.label}.` };
    }
  }
  if (
    expected.carryInTasks.length > 0 &&
    !hasSubstantiveSectionContent(extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "tasks_last_week")!.label))
  ) {
    return { ok: false, reason: "Task list from last Week was empty even though carry-forward tasks existed." };
  }
  if (
    expected.outcomes.length > 0 &&
      !hasSubstantiveSectionContent(extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "key_outcomes")!.label))
  ) {
    return { ok: false, reason: "Key outcomes shipped/delivered was empty even though source work lines existed." };
  }
  const tasksLastWeek = extractBulletItems(
    extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "tasks_last_week")!.label)
  );
  const nextWeekTasks = extractBulletItems(
    extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "next_week_tasks")!.label)
  );
  const fires = extractBulletItems(
    extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "fires_prevented")!.label)
  );
  const impact = extractBulletItems(
    extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "weekly", "cross_team_impact")!.label)
  );

  if (
    expected.carryInTasks.length > 0 &&
    tasksLastWeek.length > 0 &&
    tasksLastWeek.every((line) => expected.nextWeekTasks.includes(line)) &&
    !expected.carryInTasks.every((line) => expected.nextWeekTasks.includes(line))
  ) {
    return { ok: false, reason: "Task list from last Week was overwritten with end-of-week open tasks." };
  }

  const sourceMeetings = new Set(expected.meetings.map(normalizeSentence));
  if (
    impact.some((line) => {
      const normalized = normalizeSentence(line);
      if (!normalized.startsWith("Met with ")) return false;
      const rewritten = normalized.replace(/^Met with\s+/i, "").trim();
      return sourceMeetings.has(normalizeSentence(rewritten));
    })
  ) {
    return { ok: false, reason: "Cross-team impact rewrote meeting bullets into `Met with ...` phrasing." };
  }

  if (fires.some((line) => expected.fireExcludedLines.some((excluded) => normalizeSentence(excluded) === normalizeSentence(line)))) {
    return { ok: false, reason: "Problems solved / fires prevented included a line that should have been excluded." };
  }

  return { ok: true, reason: "Output passed weekly validation." };
}

export function isValidMonthlyOllamaOutput(
  config: AppConfig,
  template: string,
  generated: string,
  month: string,
  expected: { hasWeeklyInputs: boolean }
): boolean {
  return validateMonthlyOllamaOutput(config, template, generated, month, expected).ok;
}

function validateMonthlyOllamaOutput(
  config: AppConfig,
  template: string,
  generated: string,
  month: string,
  expected: { hasWeeklyInputs: boolean }
): ValidationResult {
  const normalizedGenerated = normalizeTemplate(generated);
  const labels = getMonthlyStructure(config).sections.map((section) => section.label);
  if (!normalizedGenerated) return { ok: false, reason: "Ollama output was empty after trimming." };
  if (normalizedGenerated === normalizeTemplate(template)) {
    return { ok: false, reason: "Ollama output matched the monthly template without filling it in." };
  }
  if (hasTemplatePlaceholders(normalizedGenerated)) {
    return { ok: false, reason: "Ollama output still contains template placeholders." };
  }
  if (!normalizedGenerated.includes(month)) {
    return { ok: false, reason: `Ollama output did not include the target month ${month}.` };
  }
  for (const section of getMonthlyStructure(config).sections.filter((item) => item.required !== false)) {
    if (!normalizedGenerated.split("\n").some((line) => normalizeHeadingLabel(line) === normalizeHeadingLabel(section.label))) {
      return { ok: false, reason: `Ollama output is missing required monthly heading: ${section.label}.` };
    }
  }
  if (
    expected.hasWeeklyInputs &&
    !hasSubstantiveSectionContent(extractManagedSection(normalizedGenerated, labels, findPeriodSection(config, "monthly", "top_outcomes")!.label))
  ) {
    return { ok: false, reason: "Top Outcomes was empty even though weekly inputs existed." };
  }
  return { ok: true, reason: "Output passed monthly validation." };
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
  mondayIso: string,
  options: GenerateDraftOptions = {}
): Promise<{ outputPath: string; warnings: string[] }> {
  const warnings: string[] = [];
  const styleInstruction = await resolveStyleInstruction(cwd, config, warnings, "Facts only. No hype. No assumptions.");
  const { entries, missingDates } = await loadDailyEntriesForWeek(cwd, config, mondayIso);
  if (missingDates.length > 0) warnings.push(`Missing daily files: ${missingDates.join(", ")}`);

  const weeklyContent = deriveWeeklyContent(entries, mondayIso);
  const keyOutcomesMd = renderWeeklyKeyOutcomes(config, weeklyContent.weeklyWorkCategories);
  const attendance = aggregateAttendance(entries);
  const attendanceMd = renderAttendance(attendance);
  const firesMd = renderBullets(weeklyContent.fireLines, "- None captured");
  const impactMd = renderBullets(weeklyContent.impactLines, "- None captured");
  const carryInMd = renderBullets(weeklyContent.carryInTasks, "- None captured");
  const nextWeekMd = renderBullets(weeklyContent.nextWeekTasks, "- None captured");
  const weeklySections = getWeeklyStructure(config).sections;

  const templatePath = path.resolve(cwd, config.paths.templates_dir, "weekly.md");
  const template = await readText(templatePath);
  const prompt = [
    "Use the weekly template exactly. Keep headers unchanged and preserve markdown.",
    styleInstruction,
    "",
    `Friday date: ${fridayIso}`,
    `Carry-forward tasks entering the week:\n${weeklyContent.carryInTasks.map((t) => `- ${t}`).join("\n") || "- None"}`,
    `Open tasks remaining at the end of the week:\n${weeklyContent.nextWeekTasks.map((t) => `- ${t}`).join("\n") || "- None"}`,
    `Work lines by category:\n${keyOutcomesMd}`,
    `Flattened work lines:\n${weeklyContent.outcomes.join("\n") || "- None"}`,
    `Meetings:\n${weeklyContent.meetings.map((m) => `- ${m}`).join("\n") || "- None"}`,
    `Notes:\n${weeklyContent.notes.map((line) => `- ${line}`).join("\n") || "- None"}`,
    `Problems solved / fires prevented source lines:\n${weeklyContent.fireLines.map((line) => `- ${line}`).join("\n") || "- None"}`,
    `Cross-team impact source lines:\n${weeklyContent.impactLines.map((line) => `- ${line}`).join("\n") || "- None"}`,
    `Attendance:\n${attendanceMd}`,
    `Managed weekly sections:\n${weeklySections.map((section) => `- ${section.id}: ${section.label}`).join("\n")}`,
    "",
    `Template:\n${template}`,
    "",
    "Weekly section rules:",
    "- `Task list from last Week` contains carry-forward items already open when the week started.",
    "- `Problems solved / fires prevented` contains concrete fixes, remediations, incidents, or blockers addressed this week.",
    "- `Cross-team impact` preserves meeting and collaboration wording from the source notes; do not rewrite bullets into `Met with ...` phrases.",
    "- `Task list for Next Week` contains forward-looking open tasks that remain at the end of the week.",
    "",
    renderRememberBlock(config, "Generate the weekly summary now as markdown.")
  ].join("\n");

  const weeklySectionValues = {
    tasks_last_week: carryInMd,
    key_outcomes: keyOutcomesMd,
    fires_prevented: firesMd,
    cross_team_impact: impactMd,
    attendance_summary: attendanceMd,
    next_week_tasks: nextWeekMd
  };
  const renderedWeeklyScaffold = renderWeeklyFallback(template, config, fridayIso, weeklySectionValues);
  const systemPrompt = "You are a strict formatter. Output only valid markdown using the provided template format.";
  const debug: DebugPayload = {
    enabled: options.debug ?? false,
    systemPrompt,
    prompt,
    validation: {
      ok: false,
      reason: "Generation did not complete."
    },
    usedFallback: false
  };

  let content = renderWeeklyFallback(template, config, fridayIso, weeklySectionValues);
  try {
    const generated = await generateWithOllama(config, systemPrompt, prompt);
    debug.rawResponse = generated;
    const validation = validateWeeklyOllamaOutput(config, template, generated, fridayIso, weeklyContent);
    debug.validation = validation;
    if (validation.ok) {
      content = applyManagedSectionsFromScaffold(generated, renderedWeeklyScaffold, weeklySections);
    } else {
      debug.usedFallback = true;
      warnings.push("Ollama output did not match expected format; used deterministic fallback.");
    }
  } catch (error) {
    debug.usedFallback = true;
    debug.validation = { ok: false, reason: "Ollama generation failed before validation." };
    debug.error = String(error);
    warnings.push(`Ollama unavailable or failed; used deterministic fallback. ${String(error)}`);
  }

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, "weekly", weeklyFileName(fridayIso));
  const debugBlock = renderDebugBlock(debug);
  const finalContent = debug.enabled ? `${content.trimEnd()}\n\n${debugBlock}\n` : `${content.trimEnd()}\n`;
  await writeText(outputPath, finalContent);
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

  const weeklyContent = deriveWeeklyContent(entries, mondayIso);
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
    "Use `Task list from last Week` only for carry-forward items already open when the week began.",
    "Use `Task list for Next Week` only for forward-looking tasks still open at the end of the week.",
    "Keep `Cross-team impact` close to the source meeting and collaboration wording; do not rewrite bullets into `Met with ...` phrases.",
    "Keep `Problems solved / fires prevented` limited to concrete fixes, remediations, incidents, and blockers addressed this week.",
    `Managed weekly sections: ${getWeeklyStructure(config).sections.map((section) => `${section.id}=${section.label}`).join("; ")}`,
    "",
    renderRememberBlock(config, "Generate the weekly summary now in a downloadable .md file."),
    "",
    "## Target Week",
    `Friday date: ${fridayIso}`,
    `Monday date: ${mondayIso}`,
    "",
    "## Derived Weekly Inputs",
    `Carry-forward tasks entering the week:\n${weeklyContent.carryInTasks.map((task) => `- ${task}`).join("\n") || "- None"}`,
    "",
    `Open tasks remaining at the end of the week:\n${weeklyContent.nextWeekTasks.map((task) => `- ${task}`).join("\n") || "- None"}`,
    "",
    `Problems solved / fires prevented source lines:\n${weeklyContent.fireLines.map((line) => `- ${line}`).join("\n") || "- None"}`,
    "",
    `Cross-team impact source lines:\n${weeklyContent.impactLines.map((line) => `- ${line}`).join("\n") || "- None"}`,
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
  month: string,
  options: GenerateDraftOptions = {}
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
  const renderedMonthlyScaffold = renderMonthlyFallback(template, config, month, monthlySectionValues);

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
  const systemPrompt = "You are a strict formatter. Output only valid markdown using the provided template format.";
  const debug: DebugPayload = {
    enabled: options.debug ?? false,
    systemPrompt,
    prompt,
    validation: {
      ok: false,
      reason: "Generation did not complete."
    },
    usedFallback: false
  };

  let content = renderedMonthlyScaffold;

  try {
    const generated = await generateWithOllama(config, systemPrompt, prompt);
    debug.rawResponse = generated;
    const validation = validateMonthlyOllamaOutput(config, template, generated, month, {
      hasWeeklyInputs: weeklyInputs.length > 0
    });
    debug.validation = validation;
    if (validation.ok) {
      content = applyManagedSectionsFromScaffold(generated, renderedMonthlyScaffold, getMonthlyStructure(config).sections);
    } else {
      debug.usedFallback = true;
      warnings.push("Ollama output did not match expected monthly format; used fallback template.");
    }
  } catch (error) {
    debug.usedFallback = true;
    debug.validation = { ok: false, reason: "Ollama generation failed before validation." };
    debug.error = String(error);
    warnings.push(`Ollama unavailable or failed; used fallback template. ${String(error)}`);
  }

  const outputPath = path.resolve(cwd, config.paths.drafts_dir, "monthly", monthFileName(month));
  const debugBlock = renderDebugBlock(debug);
  const finalContent = debug.enabled ? `${content.trimEnd()}\n\n${debugBlock}\n` : `${content.trimEnd()}\n`;
  await writeText(outputPath, finalContent);
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
