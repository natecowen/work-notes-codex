import path from "node:path";
import type { AppConfig } from "../types.js";
import { fileExists, moveFile, readText, writeText } from "./files.js";
import { monthFileName, weeklyFileName } from "./dates.js";
import { setApprovedFrontmatter } from "./markdown.js";
import { appendApprovalAudit } from "./indexing.js";

function approvedWeeklyPath(cwd: string, config: AppConfig, fridayIso: string): string {
  return path.resolve(cwd, config.paths.weekly_notes_dir, fridayIso.slice(0, 4), weeklyFileName(fridayIso));
}

function approvedMonthlyPath(cwd: string, config: AppConfig, month: string): string {
  return path.resolve(cwd, config.paths.monthly_notes_dir, month.slice(0, 4), monthFileName(month));
}

export async function approveWeekly(
  cwd: string,
  config: AppConfig,
  fridayIso: string
): Promise<{ approvedPath: string; draftPath: string }> {
  const fileName = weeklyFileName(fridayIso);
  const draftPath = path.resolve(cwd, config.paths.drafts_dir, "weekly", fileName);
  const approvedPath = approvedWeeklyPath(cwd, config, fridayIso);
  if (await fileExists(approvedPath)) {
    throw new Error(`Approved weekly already exists: ${path.relative(cwd, approvedPath)}`);
  }
  const raw = await readText(draftPath);
  const updated = setApprovedFrontmatter(raw);
  await writeText(draftPath, updated);
  await moveFile(draftPath, approvedPath);
  await appendApprovalAudit(cwd, config, {
    approvedAt: new Date().toISOString(),
    periodType: "weekly",
    periodKey: fridayIso,
    draftPath: path.relative(cwd, draftPath),
    approvedPath: path.relative(cwd, approvedPath)
  });
  return { approvedPath, draftPath };
}

export async function approveMonthly(
  cwd: string,
  config: AppConfig,
  month: string
): Promise<{ approvedPath: string; draftPath: string }> {
  const fileName = monthFileName(month);
  const draftPath = path.resolve(cwd, config.paths.drafts_dir, "monthly", fileName);
  const approvedPath = approvedMonthlyPath(cwd, config, month);
  if (await fileExists(approvedPath)) {
    throw new Error(`Approved monthly already exists: ${path.relative(cwd, approvedPath)}`);
  }
  const raw = await readText(draftPath);
  const updated = setApprovedFrontmatter(raw);
  await writeText(draftPath, updated);
  await moveFile(draftPath, approvedPath);
  await appendApprovalAudit(cwd, config, {
    approvedAt: new Date().toISOString(),
    periodType: "monthly",
    periodKey: month,
    draftPath: path.relative(cwd, draftPath),
    approvedPath: path.relative(cwd, approvedPath)
  });
  return { approvedPath, draftPath };
}
