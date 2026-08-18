// Gated behind RUN_INTEGRATION=1 so `npm run test:unit`/`test:functional`
// stay offline-safe and don't burn real API quota. Run explicitly via
// `npm run test:integration` (requires GEMINI_API_KEY to be configured per
// this project's CLAUDE.md).
import { describe, it, expect } from "vitest";
import { askGemini } from "../../src/bridge.js";

const runIntegration = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!runIntegration)("askGemini integration smoke test (real CLI)", () => {
  it(
    "chat mode returns a real response from the installed Gemini CLI",
    async () => {
      const result = await askGemini(
        { prompt: "Reply with exactly: OK" },
        { mode: "chat", timeoutMs: 60_000, maxRetries: 2 }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().length).toBeGreaterThan(0);
    },
    70_000
  );
});
