import path from "node:path";
import yaml from "js-yaml";
import { readText } from "./files.js";
import type { AppConfig } from "../types.js";
import { normalizeConfigStructures, validateDailyStructure, validatePeriodStructure } from "./sections.js";

export async function loadConfig(cwd: string, configPath = "config/config.yaml"): Promise<AppConfig> {
  const absolute = path.resolve(cwd, configPath);
  const raw = await readText(absolute);
  const parsed = normalizeConfigStructures(yaml.load(raw) as AppConfig);
  const endpointOverride = process.env.WORKLOG_OLLAMA_ENDPOINT?.trim();
  if (endpointOverride) {
    parsed.llm.endpoint = endpointOverride;
  }
  validateConfig(parsed);
  return parsed;
}

function validateConfig(config: AppConfig): void {
  if (!config?.paths?.daily_notes_dir) {
    throw new Error("Invalid config: paths.daily_notes_dir is required.");
  }
  if (config.llm.provider !== "ollama") {
    throw new Error("Invalid config: only llm.provider=ollama is supported in v1.");
  }
  if (!Array.isArray(config.categories) || config.categories.length === 0) {
    throw new Error("Invalid config: categories must be a non-empty list.");
  }
  if (config.voice.style_profile_from_samples && config.voice.sample_dirs && !Array.isArray(config.voice.sample_dirs)) {
    throw new Error("Invalid config: voice.sample_dirs must be a list when provided.");
  }
  if (
    config.voice.style_example_limit !== undefined &&
    (!Number.isInteger(config.voice.style_example_limit) ||
      config.voice.style_example_limit < 0 ||
      config.voice.style_example_limit > 10)
  ) {
    throw new Error("Invalid config: voice.style_example_limit must be an integer between 0 and 10.");
  }
  if (config.prompting?.remember_rules && !Array.isArray(config.prompting.remember_rules)) {
    throw new Error("Invalid config: prompting.remember_rules must be a list when provided.");
  }
  validateDailyStructure(normalizeConfigStructures(config).daily!, "daily.sections");
  validatePeriodStructure(normalizeConfigStructures(config).weekly!, "weekly.sections");
  validatePeriodStructure(normalizeConfigStructures(config).monthly!, "monthly.sections");
}
