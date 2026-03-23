import assert from "node:assert/strict";
import test from "node:test";
import { generateWithOllama } from "./llm.js";
import type { AppConfig } from "../types.js";

const config: AppConfig = {
  version: 1,
  paths: {
    daily_notes_dir: "daily",
    weekly_notes_dir: "weekly",
    monthly_notes_dir: "monthly",
    templates_dir: "templates",
    drafts_dir: "drafts",
    reports_dir: "reports",
    cache_dir: "cache"
  },
  llm: {
    provider: "ollama",
    model: "test-model",
    temperature: 0,
    max_tokens: 128,
    endpoint: "http://127.0.0.1:11434/api/generate"
  },
  voice: {
    mode: "facts_only",
    style_profile_from_samples: false
  },
  categories: ["Development"],
  attendance: {
    workdays_only: true,
    values: ["office", "wfh", "holiday", "sick", "vacation"],
    missing_policy: "warn"
  },
  tasks: {
    carry_forward_enabled: true,
    open_marker: "[ ]",
    done_marker: "[x]"
  },
  tags: {
    enabled: false,
    input_mode: "frontmatter"
  }
};

test("generateWithOllama rejects whitespace-only responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response: "   \n\t  " }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  try {
    await assert.rejects(
      () => generateWithOllama(config, "system", "prompt"),
      /Ollama returned empty response/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
