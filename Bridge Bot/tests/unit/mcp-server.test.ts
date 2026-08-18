import { describe, it, expect, vi, beforeEach } from "vitest";

const askGeminiMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("../../src/bridge.js", () => ({
  askGemini: (...args: unknown[]) => askGeminiMock(...args),
}));
vi.mock("node:fs", () => ({ readFileSync: (...args: unknown[]) => readFileSyncMock(...args) }));

const { handleAskGemini } = await import("../../src/mcp-server.js");

const OK_RESULT = { stdout: "gemini says hi", stderr: "", exitCode: 0, attempts: 1, timedOut: false };

describe("handleAskGemini", () => {
  beforeEach(() => {
    askGeminiMock.mockReset().mockResolvedValue(OK_RESULT);
    readFileSyncMock.mockReset();
  });

  it("chat mode: calls askGemini and returns stdout + metadata, not isError", async () => {
    const result = await handleAskGemini({ prompt: "hi", mode: "chat" });

    expect(askGeminiMock).toHaveBeenCalledWith(
      { prompt: "hi", content: undefined },
      expect.objectContaining({ mode: "chat" })
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "gemini says hi" });
    const metadata = JSON.parse(result.content[1].text);
    expect(metadata).toEqual({ attempts: 1, timedOut: false, exitCode: 0 });
  });

  it("codebase mode: passes includeDirectories through to askGemini", async () => {
    await handleAskGemini({
      prompt: "audit",
      mode: "codebase",
      includeDirectories: ["src", "tests"],
    });

    expect(askGeminiMock).toHaveBeenCalledWith(
      { prompt: "audit", content: undefined },
      expect.objectContaining({ mode: "codebase", includeDirectories: ["src", "tests"] })
    );
  });

  it("document mode: reads filePath server-side and passes its content to askGemini", async () => {
    readFileSyncMock.mockReturnValue("big document content");

    await handleAskGemini({ prompt: "summarize", mode: "document", filePath: "/tmp/doc.txt" });

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/doc.txt", "utf-8");
    expect(askGeminiMock).toHaveBeenCalledWith(
      { prompt: "summarize", content: "big document content" },
      expect.objectContaining({ mode: "document" })
    );
  });

  it("document mode: returns isError (not a throw) when filePath is missing", async () => {
    const result = await handleAskGemini({ prompt: "summarize", mode: "document" });

    expect(result.isError).toBe(true);
    expect(askGeminiMock).not.toHaveBeenCalled();
  });

  it("document mode: returns isError (not a throw) when the file can't be read", async () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    const result = await handleAskGemini({
      prompt: "summarize",
      mode: "document",
      filePath: "/nope.txt",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("/nope.txt");
    expect(askGeminiMock).not.toHaveBeenCalled();
  });

  it("a completed-but-failed Gemini call (non-zero exit) is NOT isError — it's a successful tool call carrying failure data", async () => {
    askGeminiMock.mockResolvedValue({
      stdout: "",
      stderr: "You exceeded your current quota",
      exitCode: 1,
      attempts: 4,
      timedOut: false,
    });

    const result = await handleAskGemini({ prompt: "hi", mode: "chat" });

    expect(result.isError).toBeUndefined();
    const metadata = JSON.parse(result.content[1].text);
    expect(metadata.exitCode).toBe(1);
    expect(metadata.stderr).toContain("exceeded your current quota");
  });

  // Regression test for the round-1 review finding: askGemini() itself can
  // throw synchronously (not just reject after a CLI failure) for cases
  // like codebase mode with no includeDirectories, or document mode with
  // an empty file. Since mcp-server.ts is a long-lived process, an
  // unhandled rejection here would crash it for the rest of the session —
  // handleAskGemini must catch this, not just the file-read step.
  it("does not throw/reject when askGemini() itself throws (e.g. codebase mode with no includeDirectories)", async () => {
    askGeminiMock.mockRejectedValue(
      new Error("codebase mode requires opts.includeDirectories to be non-empty")
    );

    const result = await handleAskGemini({ prompt: "audit", mode: "codebase" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("includeDirectories");
  });

  it("does not throw/reject when askGemini() throws on an empty document file", async () => {
    readFileSyncMock.mockReturnValue(""); // file exists but is empty
    askGeminiMock.mockRejectedValue(new Error("document mode requires input.content"));

    const result = await handleAskGemini({
      prompt: "summarize",
      mode: "document",
      filePath: "/empty.txt",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ask_gemini failed to run");
  });
});
