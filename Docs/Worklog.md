# Worklog

Running index of every task run through the studio pipeline. One line per task,
newest first. Update when a task file is opened (status: in progress) and again
when it's closed (status: done).

| Date | Task | Status | Log |
|---|---|---|---|
| 2026-07-26 | Guard perception & patrol/alert states | done | [Docs/Tasks/2026-07-26-guard-perception.md](Tasks/2026-07-26-guard-perception.md) |
| 2026-07-26 | Player movement | done | [Docs/Tasks/2026-07-26-player-movement.md](Tasks/2026-07-26-player-movement.md) |
| 2026-07-25 | Bootstrap Unity project | done | [Docs/Tasks/2026-07-25-bootstrap-unity-project.md](Tasks/2026-07-25-bootstrap-unity-project.md) |

**Backup policy:** no git/cron backup mechanism in use (declined). Durability relies
on writing task-log and worklog updates to disk immediately after each pipeline
stage completes, rather than batching until a task finishes.
