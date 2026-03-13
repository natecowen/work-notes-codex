import type { AppConfig } from "../types.js";

interface OllamaResponse {
  response?: string;
}

export async function generateWithOllama(
  config: AppConfig,
  system: string,
  prompt: string
): Promise<string> {
  const endpoint = config.llm.endpoint ?? "http://127.0.0.1:11434/api/generate";
  const body = {
    model: config.llm.model,
    prompt: `${system}\n\n${prompt}`,
    stream: false,
    options: {
      temperature: config.llm.temperature,
      num_predict: config.llm.max_tokens
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as OllamaResponse;
  if (!json.response) throw new Error("Ollama returned empty response.");
  return json.response.trim();
}
