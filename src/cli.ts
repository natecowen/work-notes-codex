#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { loadConfig } from "./core/config.js";
import { resolveWeekWindowFromFriday } from "./core/dates.js";
import { exportMonthlyPrompt, exportWeeklyPrompt, generateMonthlyDraft, generateWeeklyDraft } from "./core/generate.js";
import { runAttendanceReport } from "./core/report.js";
import { approveMonthly, approveWeekly } from "./core/approve.js";
import { runInit } from "./core/init.js";
import { createDailyFile, createDailyWeekFiles } from "./core/scaffold.js";
import { buildDailyIndex, buildIndexPayload, readIndexCache, writeIndexCache } from "./core/indexing.js";
import { buildStyleProfile } from "./core/style.js";

const program = new Command();
program.name("worklog").description("Work notes reporting CLI").version("0.1.0");

program
  .command("init")
  .description("Create default config and templates.")
  .action(async () => {
    const cwd = process.cwd();
    await runInit(cwd);
    console.log("Initialized config and templates.");
  });

program
  .command("validate")
  .description("Validate config and parse all daily notes.")
  .action(async () => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const result = await buildDailyIndex(cwd, config);
    const existing = await readIndexCache(cwd, config);
    const payload = buildIndexPayload(result.rows, result.errors, existing?.approvals ?? []);
    await writeIndexCache(cwd, config, payload, "index.json");

    console.log("Config is valid.");
    console.log(`Parsed daily files: ${result.rows.length}`);
    console.log(`Parse errors: ${result.errors.length}`);
    console.log("Wrote cache/index.json");

    if (result.errors.length > 0) {
      console.log("Errors:");
      result.errors.forEach((err) => console.log(`- ${err.sourcePath}: ${err.error}`));
      process.exitCode = 1;
    }
  });

program
  .command("index")
  .description("Rebuild cache/index.json from daily markdown files.")
  .action(async () => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const result = await buildDailyIndex(cwd, config);
    const existing = await readIndexCache(cwd, config);
    const payload = buildIndexPayload(result.rows, result.errors, existing?.approvals ?? []);
    await writeIndexCache(cwd, config, payload, "index.json");
    console.log(`Indexed daily files: ${result.rows.length}`);
    console.log(`Index errors: ${result.errors.length}`);
    console.log("Wrote cache/index.json");
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  });

const voice = program.command("voice").description("Voice tuning commands.");

voice
  .command("profile")
  .description("Build style profile from weekly/monthly samples.")
  .action(async () => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const profile = await buildStyleProfile(cwd, config);
    console.log("Built style profile.");
    console.log(`Sample files: ${profile.sampleFileCount}`);
    console.log(`Bullet lines: ${profile.bulletCount}`);
    console.log(`Avg bullet words: ${profile.avgBulletWords}`);
    console.log(`Heading categories: ${profile.headingCategoryCount}`);
    if (profile.commonHeadingCategories.length > 0) {
      console.log(`Top heading categories: ${profile.commonHeadingCategories.join(", ")}`);
    }
    console.log(`Prefers category prefix: ${profile.prefersCategoryPrefix ? "yes" : "no"}`);
    if (profile.commonCategoryPrefixes.length > 0) {
      console.log(`Common prefixes: ${profile.commonCategoryPrefixes.join(", ")}`);
    }
  });

const generate = program.command("generate").description("Generate weekly/monthly drafts.");

generate
  .command("daily")
  .requiredOption("--date <YYYY-MM-DD>", "Daily file date")
  .option("--overwrite", "Overwrite file if it already exists", false)
  .action(async (opts: { date: string; overwrite: boolean }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const result = await createDailyFile(cwd, config, opts.date, opts.overwrite);
    if (result.created) {
      console.log(`Created daily: ${path.relative(cwd, result.path)}`);
    } else {
      console.log(`Skipped existing daily: ${path.relative(cwd, result.path)}`);
    }
  });

generate
  .command("dailies")
  .requiredOption("--friday <YYYY-MM-DD>", "Friday date of the target week")
  .option("--overwrite", "Overwrite files if they already exist", false)
  .action(async (opts: { friday: string; overwrite: boolean }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const week = resolveWeekWindowFromFriday(opts.friday);
    const result = await createDailyWeekFiles(cwd, config, week.monday, opts.overwrite);
    result.created.forEach((item) => console.log(`Created daily: ${path.relative(cwd, item)}`));
    result.skipped.forEach((item) => console.log(`Skipped existing daily: ${path.relative(cwd, item)}`));
  });

generate
  .command("weekly")
  .requiredOption("--friday <YYYY-MM-DD>", "Friday date of the target week")
  .option("--export-prompt", "Write an external-LLM prompt package instead of generating with Ollama", false)
  .action(async (opts: { friday: string; exportPrompt: boolean }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const week = resolveWeekWindowFromFriday(opts.friday);
    const result = opts.exportPrompt
      ? await exportWeeklyPrompt(cwd, config, week.friday, week.monday)
      : await generateWeeklyDraft(cwd, config, week.friday, week.monday);
    console.log(
      `${opts.exportPrompt ? "Weekly prompt package" : "Weekly draft"}: ${path.relative(cwd, result.outputPath)}`
    );
    if (result.warnings.length > 0) {
      console.log("Warnings:");
      result.warnings.forEach((w) => console.log(`- ${w}`));
    }
  });

generate
  .command("monthly")
  .requiredOption("--month <YYYY-MM>", "Month key")
  .option("--export-prompt", "Write an external-LLM prompt package instead of generating with Ollama", false)
  .action(async (opts: { month: string; exportPrompt: boolean }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const result = opts.exportPrompt
      ? await exportMonthlyPrompt(cwd, config, opts.month)
      : await generateMonthlyDraft(cwd, config, opts.month);
    console.log(
      `${opts.exportPrompt ? "Monthly prompt package" : "Monthly draft"}: ${path.relative(cwd, result.outputPath)}`
    );
    if (result.warnings.length > 0) {
      console.log("Warnings:");
      result.warnings.forEach((w) => console.log(`- ${w}`));
    }
  });

const report = program.command("report").description("Reporting commands.");

report
  .command("attendance")
  .option("--week <YYYY-MM-DD>", "Use week containing Friday date")
  .option("--month <YYYY-MM>", "Use month")
  .option("--from <YYYY-MM-DD>", "Range start")
  .option("--to <YYYY-MM-DD>", "Range end")
  .action(
    async (opts: { week?: string; month?: string; from?: string; to?: string }) => {
      const cwd = process.cwd();
      const config = await loadConfig(cwd);
      let mode: "week" | "month" | "range" = "range";
      if (opts.week) mode = "week";
      if (opts.month) mode = "month";
      const outPath = await runAttendanceReport(cwd, config, mode, {
        weekFriday: opts.week,
        month: opts.month,
        from: opts.from,
        to: opts.to
      });
      console.log(`Attendance report: ${path.relative(cwd, outPath)}`);
    }
  );

const approve = program.command("approve").description("Approve and promote drafts.");

approve
  .command("weekly")
  .requiredOption("--friday <YYYY-MM-DD>", "Friday date in weekly filename")
  .action(async (opts: { friday: string }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const result = await approveWeekly(cwd, config, opts.friday);
    console.log(`Approved weekly: ${path.relative(cwd, result.finalPath)}`);
    console.log("Audit appended: cache/index.json");
  });

approve
  .command("monthly")
  .requiredOption("--month <YYYY-MM>", "Monthly filename key")
  .action(async (opts: { month: string }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const result = await approveMonthly(cwd, config, opts.month);
    console.log(`Approved monthly: ${path.relative(cwd, result.finalPath)}`);
    console.log("Audit appended: cache/index.json");
  });

program.parseAsync().catch((error) => {
  console.error(`Error: ${String(error)}`);
  process.exitCode = 1;
});
