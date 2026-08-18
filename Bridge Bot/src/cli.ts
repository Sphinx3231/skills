#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { askGemini } from "./bridge.js";
import type { AskGeminiOptions, GeminiMode } from "./types.js";

function parseArgs(argv: string[]) {
  const opts: {
    mode: GeminiMode;
    prompt?: string;
    dirs?: string[];
    file?: string;
    timeoutMs?: number;
    model?: string;
  } = { mode: "chat" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--mode":
        opts.mode = argv[++i] as GeminiMode;
        break;
      case "--dir":
        opts.dirs = (opts.dirs ?? []).concat(argv[++i]);
        break;
      case "--file":
        opts.file = argv[++i];
        break;
      case "--timeout-ms":
        opts.timeoutMs = Number(argv[++i]);
        break;
      case "--model":
        opts.model = argv[++i];
        break;
      default:
        opts.prompt = opts.prompt ? `${opts.prompt} ${arg}` : arg;
    }
  }

  return opts;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.prompt) {
    console.error(
      'Usage: bridge-bot --mode <chat|codebase|document> [--dir <path>]... [--file <path>] [--timeout-ms <n>] [--model <name>] "<prompt>"'
    );
    process.exit(1);
  }

  const askOpts: AskGeminiOptions = {
    mode: parsed.mode,
    includeDirectories: parsed.dirs,
    timeoutMs: parsed.timeoutMs,
    model: parsed.model,
  };

  const content = parsed.file ? readFileSync(parsed.file, "utf-8") : undefined;

  const result = await askGemini({ prompt: parsed.prompt, content }, askOpts);

  if (result.exitCode !== 0) {
    console.error(`gemini exited ${result.exitCode} after ${result.attempts} attempt(s)`);
    console.error(result.stderr);
    process.exit(1);
  }

  console.log(result.stdout);
}

main().catch((err) => {
  console.error("bridge-bot failed:", err);
  process.exit(1);
});
