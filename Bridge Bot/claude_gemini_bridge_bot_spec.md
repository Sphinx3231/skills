# Engineering Specification & Prompt: Autonomous Claude-to-Gemini CLI Bridge Bot

## Document Metadata
* **Status:** Ready for Implementation / Ticket Drafting
* **Target Environment:** Windows / Claude Workspace / Local CLI
* **Target Model Architecture:** Extended Context Gemini Models (up to 2M Tokens)
* **Local Skills Path:** `C:\Users\El Samaka\OneDrive\Desktop\Claude\claude-skills`
* **Local Agents Path:** `C:\Users\El Samaka\OneDrive\Desktop\Claude\Claude Agents`

---

## 1. Overview & Objective

This document defines the architectural specification and deployment prompt for building an autonomous relay bridge between **Claude** and **Google Gemini via local CLI transport**. 

The system enables Claude to delegate massive context processing—specifically **entire codebase ingestions** and **deep document dumps**—to Gemini's 2M-token context window and high-recall retrieval mechanisms (MRCR v2), capturing Gemini's stdout output and piping it back into Claude seamlessly without human intervention.

---

## 2. Infrastructure & Local Dependencies

### 2.1 Premade Skills Integration
The build process **must** strictly utilize the premade skills located at:
`C:\Users\El Samaka\OneDrive\Desktop\Claude\claude-skills`

Key skills to execute from this directory:
* Ticket creation, tracking, and status transitions.
* Gated build verification pipeline (Fullstack-dev → QA → Tech Lead → CTO gates).

### 2.2 Custom Agents Directory
Sub-tasks must be delegated across the agent definitions located at:
`C:\Users\El Samaka\OneDrive\Desktop\Claude\Claude Agents`

---

## 3. Technical & Transport Architecture

```
+------------------+         stdin (Prompt/Code/Docs)         +--------------------+
|                  | ---------------------------------------> |                    |
|   Claude Agent   |                                          |   Local Gemini CLI |
|   Environment    | <--------------------------------------- |   Transport Wrapper|
+------------------+        stdout (Model Response/JSON)      +--------------------+
                                                                        |
                                                                        v
                                                             +---------------------+
                                                             | Gemini 2M Model     |
                                                             | (Gemini Extended)   |
                                                             +---------------------+
```

* **Transport Mechanism:** Local CLI process wrapper (spawning via Node.js `child_process` or Python `subprocess`) communicating over `stdin` / `stdout` streams rather than direct HTTP/REST calls.
* **Target Workloads:**
  1. **Multi-File Codebase Ingestion:** Ingesting multi-directory repositories for cross-file dependency mapping, architectural checks, and systemic refactoring.
  2. **Massive Document Dumps:** Ingesting large PDFs, specifications, research papers, and technical manuals for high-precision needle-in-a-haystack retrieval.
* **Autonomous Resilience Controls:**
  * Automated timeout monitoring on spawned CLI child processes.
  * Stream buffering to handle multi-megabyte payloads without buffer overflow crashes.
  * Exponential backoff retry loops for handling rate limits (429) or transient pipe errors.

---

## 4. Execution Workflow (Gated Pipeline)

```
[Scan Skills & Agents] ---> [Open Ticket via Skill] ---> [Run CLI Transport Spike]
                                                                  |
[Merge to Main] <--- [CTO / Lead Gate] <--- [QA / Mutation Test] <--- [Fullstack Implementation]
```

1. **Phase 1: Environment Registration**
   * Scan `claude-skills` to register workflow capabilities.
   * Scan `Claude Agents` to register available sub-agent personas.
2. **Phase 2: Ticket Opening**
   * Invoke the premade ticket skill to create `Ticket 020: Autonomous Claude-to-Gemini CLI Bridge Bot`.
3. **Phase 3: Spike & Implementation**
   * Run a CLI transport spike verifying max `stdin` payload limits for large codebase/doc dumps.
   * Implement process spawning, stream buffering, and retry logic.
4. **Phase 4: Gated Verification & Review**
   * Run unit and mutation test suites (covering process crashes, broken pipes, and timeouts).
   * Submit through the multi-stage review gates (QA → Tech Lead → CTO) using local skills.

---

## 5. Ready-to-Use Claude Prompt

Copy and paste the exact prompt below into Claude to initiate the build:

```markdown
# MISSION: Build an Autonomous Claude-to-Gemini CLI Bridge Bot

You are assigned to build an autonomous relay bot that accepts query payloads from Claude, forwards them to Google Gemini via a local CLI transport wrapper (leveraging extended-context models with up to 2M token context windows), captures Gemini's stdout response, and pipes it back into Claude's environment without human intervention.

## LOCAL INFRASTRUCTURE & PREMADE SKILLS

1. **Premade Skills Directory:** Inspect, load, and execute the premade workflow skills located at:
   `C:\Users\El Samaka\OneDrive\Desktop\Claude\claude-skills`
   * Use these skills specifically for ticketed change management and the gated build/review system.
2. **Custom Agents Directory:** Delegate sub-tasks across the agent definitions located at:
   `C:\Users\El Samaka\OneDrive\Desktop\Claude\Claude Agents`

## TECHNICAL & TRANSPORT REQUIREMENTS

* **Transport Layer:** Local CLI executable wrapper (spawning processes via Node.js `child_process` or Python `subprocess`) handling stdin/stdout streams instead of direct REST API calls.
* **Target Model & Workloads:** Extended-context Gemini models (up to 2M token context window) tuned for dual workloads:
  * **Multi-File Codebases:** Ingesting full multi-directory repositories for cross-file dependency reasoning, architecture checks, and refactoring.
  * **Massive Document Dumps:** Ingesting long-form specs, research PDFs, and technical manuals for high-precision needle-in-a-haystack retrieval.
* **Autonomous Resilience:** Include automated process timeout handling, exponential backoff retries for rate limits (429), and stream-buffering controls to safely process multi-megabyte payloads without hitting CLI stdout/stdin buffer overflows.

## EXECUTION STEPS

1. Scan `C:\Users\El Samaka\OneDrive\Desktop\Claude\claude-skills` to load the gated build and ticket management skills.
2. Scan `C:\Users\El Samaka\OneDrive\Desktop\Claude\Claude Agents` to register available sub-agents.
3. Invoke your loaded ticket skill to open the ticket for `Claude-to-Gemini CLI Bridge Bot`.
4. Execute a CLI transport spike pass (specifically benchmarking max stdin payload sizes for massive codebase/doc dumps) before starting fullstack development, then route through the gated build skills for review and merge.
```
