import path from "node:path";
import type { AppConfig } from "../types.js";
import { promoteFile, readText, writeText } from "./files.js";
import { monthFileName, weeklyFileName } from "./dates.js";
import { setApprovedFrontmatter } from "./markdown.js";
import { appendApprovalAudit } from "./indexing.js";

export async function approveWeekly(
  cwd: string,
  config: AppConfig,
  fridayIso: string
): Promise<{ finalPath: string; draftPath: string }> {
  const fileName = weeklyFileName(fridayIso);
  const draftPath = path.resolve(cwd, config.paths.drafts_dir, "weekly", fileName);
  const finalPath = path.resolve(cwd, config.paths.final_dir, "weekly", fileName);
  const raw = await readText(draftPath);
  const updated = setApprovedFrontmatter(raw);
  await writeText(draftPath, updated);
  await promoteFile(draftPath, finalPath);
  await appendApprovalAudit(cwd, config, {
    approvedAt: new Date().toISOString(),
    periodType: "weekly",
    periodKey: fridayIso,
    draftPath: path.relative(cwd, draftPath),
    finalPath: path.relative(cwd, finalPath)
  });
  return { finalPath, draftPath };
}

export async function approveMonthly(
  cwd: string,
  config: AppConfig,
  month: string
): Promise<{ finalPath: string; draftPath: string }> {
  const fileName = monthFileName(month);
  const draftPath = path.resolve(cwd, config.paths.drafts_dir, "monthly", fileName);
  const finalPath = path.resolve(cwd, config.paths.final_dir, "monthly", fileName);
  const raw = await readText(draftPath);
  const updated = setApprovedFrontmatter(raw);
  await writeText(draftPath, updated);
  await promoteFile(draftPath, finalPath);
  await appendApprovalAudit(cwd, config, {
    approvedAt: new Date().toISOString(),
    periodType: "monthly",
    periodKey: month,
    draftPath: path.relative(cwd, draftPath),
    finalPath: path.relative(cwd, finalPath)
  });
  return { finalPath, draftPath };
}
