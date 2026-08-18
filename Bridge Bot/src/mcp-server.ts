#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { askGemini } from "./bridge.js";
import type { AskGeminiOptions, GeminiMode } from "./types.js";

const askGeminiInputShape = {
  prompt: z.string().min(1).describe("The instruction/prompt sent to Gemini."),
  mode: z
    .enum(["chat", "codebase", "document"])
    .default("chat")
    .describe(
      "chat: plain prompt. codebase: adds --include-directories for repo-wide context. " +
        "document: reads filePath and pipes its content to Gemini alongside the prompt."
    ),
  includeDirectories: z
    .array(z.string())
    .optional()
    .describe("Directories to pass via --include-directories (codebase mode)."),
  filePath: z
    .string()
    .optional()
    .describe(
      "Path to a file whose content is read server-side and piped to Gemini (document mode). " +
        "Content is never inlined into the tool call payload, so this is safe for multi-megabyte files."
    ),
  timeoutMs: z.number().optional().describe("Per-attempt timeout in ms. Default 120000."),
  model: z.string().optional().describe("Model override."),
};

const askGeminiInputSchema = z.object(askGeminiInputShape);
type AskGeminiToolInput = z.infer<typeof askGeminiInputSchema>;

interface ToolTextContent {
  type: "text";
  text: string;
}

interface ToolResult {
  [key: string]: unknown;
  content: ToolTextContent[];
  isError?: boolean;
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Exported (not just used inline) so unit tests can call it directly,
 * bypassing the stdio transport entirely.
 *
 * The whole body — file read AND the askGemini() call — is wrapped in one
 * try/catch. This process is a long-lived MCP server, unlike cli.ts's
 * one-shot run: an unhandled rejection here wouldn't just fail one tool
 * call, it would crash the server and silently break every subsequent
 * ask_gemini call for the rest of the session. askGemini() throws
 * synchronously in realistic, Claude-triggerable cases beyond CLI failure
 * — codebase mode with missing/empty includeDirectories, or document mode
 * where a successfully-read file is empty (falsy content fails
 * askGemini's own validation *after* the read already succeeded) — both
 * must be caught here, not assumed rare.
 */
export async function handleAskGemini(params: AskGeminiToolInput): Promise<ToolResult> {
  try {
    let content: string | undefined;
    if (params.mode === "document") {
      if (!params.filePath) {
        return errorResult("document mode requires filePath");
      }
      try {
        content = readFileSync(params.filePath, "utf-8");
      } catch (err) {
        return errorResult(`Could not read filePath "${params.filePath}": ${String(err)}`);
      }
    }

    const opts: AskGeminiOptions = {
      mode: params.mode as GeminiMode,
      includeDirectories: params.includeDirectories,
      model: params.model,
      timeoutMs: params.timeoutMs,
    };

    const result = await askGemini({ prompt: params.prompt, content }, opts);

    const metadata = {
      attempts: result.attempts,
      timedOut: result.timedOut,
      exitCode: result.exitCode,
      ...(result.exitCode !== 0 ? { stderr: result.stderr } : {}),
    };

    // A completed-but-failed Gemini invocation is a successful tool call
    // carrying structured failure data — NOT isError. isError is reserved
    // for cases where the tool itself couldn't run at all (see catch
    // block below and the bad-filePath branch above). This lets Claude
    // distinguish "Gemini failed, here's why" from "the tool call itself
    // is broken" and react accordingly (e.g. retry vs give up).
    return {
      content: [
        { type: "text", text: result.stdout },
        { type: "text", text: JSON.stringify(metadata) },
      ],
    };
  } catch (err) {
    return errorResult(`ask_gemini failed to run: ${String(err)}`);
  }
}

const server = new McpServer({ name: "bridge-bot", version: "0.0.0" });

server.registerTool(
  "ask_gemini",
  {
    title: "Ask Gemini",
    description:
      "Delegate a prompt, codebase directory, or large document to the local Gemini CLI " +
      "(large context window) and return its response.",
    inputSchema: askGeminiInputShape,
  },
  handleAskGemini
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP protocol channel — never write anything else there.
  console.error("bridge-bot MCP server ready (ask_gemini tool registered)");
}

// Only start the stdio transport when this file is run directly (`tsx
// src/mcp-server.ts`), not when it's imported by tests — importing it to
// reach handleAskGemini() must never try to connect a real stdio server.
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    console.error("bridge-bot MCP server failed to start:", err);
    process.exit(1);
  });
}
