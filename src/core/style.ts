import path from "node:path";
import matter from "gray-matter";
import type { AppConfig, VoiceStyleProfile } from "../types.js";
import { listMarkdownFilesRecursive, readJsonIfExists, readText, writeText } from "./files.js";

function profilePath(cwd: string, config: AppConfig): string {
  const relative = config.voice.profile_path ?? "cache/style-profile.json";
  return path.resolve(cwd, relative);
}

function sampleDirs(cwd: string, config: AppConfig): string[] {
  const defaults = [config.paths.weekly_notes_dir, config.paths.monthly_notes_dir, "final/weekly", "final/monthly"];
  const dirs = config.voice.sample_dirs && config.voice.sample_dirs.length > 0 ? config.voice.sample_dirs : defaults;
  return dirs.map((dir) => path.resolve(cwd, dir));
}

async function sampleFiles(cwd: string, config: AppConfig): Promise<string[]> {
  return (await Promise.all(sampleDirs(cwd, config).map((dir) => listMarkdownFilesRecursive(dir))))
    .flat()
    .filter((file, idx, arr) => arr.indexOf(file) === idx)
    .sort();
}

function extractBullets(markdown: string): string[] {
  const content = matter(markdown).content;
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function extractHeadingCategories(markdown: string): string[] {
  const content = matter(markdown).content;
  const lines = content.split(/\r?\n/);
  const categories: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("###")) continue;
    let heading = line.replace(/^###\s*/, "").trim();
    if (!heading) continue;

    // Prefer explicit category labels like "Category (DevOps)" when present.
    const paren = heading.match(/\(([^)]+)\)/);
    if (paren && paren[1]) {
      heading = paren[1].trim();
    }
    // Strip trailing ":" and extra whitespace.
    heading = heading.replace(/:\s*$/, "").trim();
    if (!heading) continue;
    categories.push(heading);
  }

  return categories;
}

function topPrefixes(items: string[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.split(":")[0]?.trim();
    if (!key || key.length > 40 || key.includes(" ")) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function topValues(items: string[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

export async function buildStyleProfile(cwd: string, config: AppConfig): Promise<VoiceStyleProfile> {
  const files = await sampleFiles(cwd, config);

  const fileBodies = await Promise.all(files.map((file) => readText(file)));
  const bullets = fileBodies.flatMap((body) => extractBullets(body));
  const headingCategories = fileBodies.flatMap((body) => extractHeadingCategories(body));
  const bulletWords = bullets.map((b) => b.split(/\s+/).filter(Boolean).length);
  const avgBulletWords = bulletWords.length > 0 ? Math.round(bulletWords.reduce((a, b) => a + b, 0) / bulletWords.length) : 12;
  const prefixHits = bullets.filter((b) => /^[A-Za-z][A-Za-z/&-]*:/.test(b)).length;
  const prefersCategoryPrefix = bullets.length > 0 && prefixHits / bullets.length >= 0.25;

  const profile: VoiceStyleProfile = {
    generatedAt: new Date().toISOString(),
    sampleFileCount: files.length,
    bulletCount: bullets.length,
    avgBulletWords,
    headingCategoryCount: headingCategories.length,
    commonHeadingCategories: topValues(headingCategories),
    prefersCategoryPrefix,
    commonCategoryPrefixes: topPrefixes(bullets)
  };

  await writeText(profilePath(cwd, config), JSON.stringify(profile, null, 2));
  return profile;
}

export async function loadStyleProfile(cwd: string, config: AppConfig): Promise<VoiceStyleProfile | null> {
  return readJsonIfExists<VoiceStyleProfile>(profilePath(cwd, config));
}

export async function loadSampleWritingExamples(
  cwd: string,
  config: AppConfig,
  limit = 4
): Promise<Array<{ path: string; content: string }>> {
  const files = await sampleFiles(cwd, config);
  const selected = files.slice(-limit);
  const contents = await Promise.all(selected.map((file) => readText(file)));
  return selected.map((file, index) => ({
    path: path.relative(cwd, file),
    content: contents[index]
  }));
}

export function toStyleInstruction(profile: VoiceStyleProfile): string {
  let groupingRule = "Use plain factual bullets without extra narrative framing.";
  if (profile.commonHeadingCategories.length > 0) {
    groupingRule = `Group work under category subheadings when relevant (examples: ${profile.commonHeadingCategories.join(", ")}).`;
  } else if (profile.prefersCategoryPrefix && profile.commonCategoryPrefixes.length > 0) {
    groupingRule = `Prefer bullet prefix labels when useful (examples: ${profile.commonCategoryPrefixes.join(", ")}).`;
  }

  return [
    "Voice constraints:",
    "- Facts only. No hype, no fluff, no motivational tone.",
    "- Use concise bullets and direct statements.",
    `- Target average bullet length around ${profile.avgBulletWords} words.`,
    `- ${groupingRule}`,
    "- Do not invent accomplishments, outcomes, or blockers.",
    "- Keep wording practical and concrete."
  ].join("\n");
}
