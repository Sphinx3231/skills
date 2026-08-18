export type GeminiMode = "chat" | "codebase" | "document";

export interface AskGeminiOptions {
  mode: GeminiMode;
  /** Directories to pass via --include-directories (codebase mode). */
  includeDirectories?: string[];
  /** Model override, passed as -m. */
  model?: string;
  /** Per-attempt timeout before the process is killed. Default 120_000. */
  timeoutMs?: number;
  /** Max attempts (including the first) for transient-error retry. Default 4. */
  maxRetries?: number;
  /** -o/--output-format. Default "text". */
  outputFormat?: "text" | "json" | "stream-json";
}

export interface GeminiResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Number of attempts made (1 = succeeded or failed on the first try). */
  attempts: number;
  timedOut: boolean;
}

export class GeminiInvocationError extends Error {
  constructor(
    message: string,
    public readonly result: GeminiResult
  ) {
    super(message);
    this.name = "GeminiInvocationError";
  }
}
