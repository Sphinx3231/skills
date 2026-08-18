import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnGeminiOnceMock = vi.fn();

vi.mock("../../src/process/spawnGemini.js", () => ({
  spawnGeminiOnce: (...args: unknown[]) => spawnGeminiOnceMock(...args),
}));

const { askGemini } = await import("../../src/bridge.js");

const OK_RESULT = { stdout: "ok", stderr: "", exitCode: 0, timedOut: false };

describe("askGemini arg construction per mode", () => {
  beforeEach(() => {
    spawnGeminiOnceMock.mockReset().mockResolvedValue(OK_RESULT);
  });

  it("chat mode: sends -p <prompt> with no stdin", async () => {
    await askGemini({ prompt: "hello" }, { mode: "chat" });

    const [args, stdinPayload] = spawnGeminiOnceMock.mock.calls[0];
    expect(args).toEqual(["-p", "hello", "-o", "text"]);
    expect(stdinPayload).toBeNull();
  });

  it("codebase mode: adds --include-directories from opts, no stdin", async () => {
    await askGemini(
      { prompt: "audit this repo" },
      { mode: "codebase", includeDirectories: ["src", "tests"] }
    );

    const [args, stdinPayload] = spawnGeminiOnceMock.mock.calls[0];
    expect(args).toEqual(["-p", "audit this repo", "-o", "text", "--include-directories", "src,tests"]);
    expect(stdinPayload).toBeNull();
  });

  it("codebase mode: throws if includeDirectories is missing/empty", async () => {
    await expect(askGemini({ prompt: "audit" }, { mode: "codebase" })).rejects.toThrow(
      /includeDirectories/
    );
    await expect(
      askGemini({ prompt: "audit" }, { mode: "codebase", includeDirectories: [] })
    ).rejects.toThrow(/includeDirectories/);
  });

  it("document mode: content is piped via stdin, appended to the -p prompt (not a separate flag)", async () => {
    await askGemini(
      { prompt: "summarize the document below", content: "big document text..." },
      { mode: "document" }
    );

    const [args, stdinPayload] = spawnGeminiOnceMock.mock.calls[0];
    expect(args).toEqual(["-p", "summarize the document below", "-o", "text"]);
    expect(stdinPayload).toBe("big document text...");
  });

  it("document mode: throws if content is missing", async () => {
    await expect(askGemini({ prompt: "summarize" }, { mode: "document" })).rejects.toThrow(
      /content/
    );
  });

  it("passes model override as -m when provided", async () => {
    await askGemini({ prompt: "hi" }, { mode: "chat", model: "gemini-2.5-pro" });

    const [args] = spawnGeminiOnceMock.mock.calls[0];
    expect(args).toEqual(["-p", "hi", "-o", "text", "-m", "gemini-2.5-pro"]);
  });

  it("never includes a hardcoded payload-size figure anywhere in constructed args", async () => {
    await askGemini({ prompt: "hi" }, { mode: "chat" });
    const [args] = spawnGeminiOnceMock.mock.calls[0];
    expect(args.join(" ")).not.toMatch(/\d+\s*(KB|MB|bytes)/i);
  });

  it("surfaces attempts count and timedOut from the underlying result", async () => {
    spawnGeminiOnceMock.mockResolvedValue({ ...OK_RESULT, exitCode: 1, timedOut: true });
    const result = await askGemini({ prompt: "hi" }, { mode: "chat", maxRetries: 1 });
    expect(result.attempts).toBe(1);
    expect(result.timedOut).toBe(true);
  });
});
