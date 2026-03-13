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

function extractBullets(markdown: string): string[] {
  const content = matter(markdown).content;
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
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

export async function buildStyleProfile(cwd: string, config: AppConfig): Promise<VoiceStyleProfile> {
  const dirs = sampleDirs(cwd, config);
  const files = (await Promise.all(dirs.map((dir) => listMarkdownFilesRecursive(dir))))
    .flat()
    .filter((file, idx, arr) => arr.indexOf(file) === idx)
    .sort();

  const fileBodies = await Promise.all(files.map((file) => readText(file)));
  const bullets = fileBodies.flatMap((body) => extractBullets(body));
  const bulletWords = bullets.map((b) => b.split(/\s+/).filter(Boolean).length);
  const avgBulletWords = bulletWords.length > 0 ? Math.round(bulletWords.reduce((a, b) => a + b, 0) / bulletWords.length) : 12;
  const prefixHits = bullets.filter((b) => /^[A-Za-z][A-Za-z/&-]*:/.test(b)).length;
  const prefersCategoryPrefix = bullets.length > 0 && prefixHits / bullets.length >= 0.25;

  const profile: VoiceStyleProfile = {
    generatedAt: new Date().toISOString(),
    sampleFileCount: files.length,
    bulletCount: bullets.length,
    avgBulletWords,
    prefersCategoryPrefix,
    commonCategoryPrefixes: topPrefixes(bullets)
  };

  await writeText(profilePath(cwd, config), JSON.stringify(profile, null, 2));
  return profile;
}

export async function loadStyleProfile(cwd: string, config: AppConfig): Promise<VoiceStyleProfile | null> {
  return readJsonIfExists<VoiceStyleProfile>(profilePath(cwd, config));
}

export function toStyleInstruction(profile: VoiceStyleProfile): string {
  const prefixRule =
    profile.prefersCategoryPrefix && profile.commonCategoryPrefixes.length > 0
      ? `Prefer bullet prefix labels when useful (examples: ${profile.commonCategoryPrefixes.join(", ")}).`
      : "Use plain factual bullets without extra narrative framing.";

  return [
    "Voice constraints:",
    "- Facts only. No hype, no fluff, no motivational tone.",
    "- Use concise bullets and direct statements.",
    `- Target average bullet length around ${profile.avgBulletWords} words.`,
    `- ${prefixRule}`,
    "- Do not invent accomplishments, outcomes, or blockers.",
    "- Keep wording practical and concrete."
  ].join("\n");
}
