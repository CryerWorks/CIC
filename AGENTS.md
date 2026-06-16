
## Mixed Remote+Local Dev Workflow

This project uses a **remote planning + local TDD implementation** workflow (Frontier Edition).

### Architecture
- **Remote** (DeepSeek V4 Flash via OpenCode Go): Runs speckit workflow, writes handoff packages, reviews implementation
- **Implementer** (DeepSeek V4 Flash via OpenCode Go): Implements via TDD, runs quality gates — same model quality for design and implementation

### Workflow Steps
1. Remote runs `/speckit.constitution` through `/speckit.tasks`
2. Remote writes handoff package to `.agent/handoff/<task-id>/` for all tasks
3. Remote calls `.\auto-implement-all.ps1 -AgentName frontier-implementer`
   Or single task: `.\run-local-implementer.ps1 -TaskId <task-id> -AgentName frontier-implementer`
4. Frontier implementer reads handoff and TDD-implements
5. Implementer writes `IMPL_REPORT.md`, sets `STATE.md` to "review"
6. Remote reviews and either approves or writes `REVISION_REQUEST.md` (sets state to `rejected`)
7. Repeat from step 3 for any rejected tasks

### Autonomous Mode (Single Bash Call)
```powershell
.\auto-implement-all.ps1 -AgentName frontier-implementer -TimeoutSeconds 600
```
Implements ALL tasks in sequence, writes `.agent/handoff/SUMMARY.md`.

### Agents
| Agent | Mode | Model | Purpose |
|-------|------|-------|---------|
| Default | primary | `opencode-go/deepseek-v4-flash` | Remote planning, spec, review |
| frontier-implementer | subagent | `opencode-go/deepseek-v4-flash` | TDD implementation (frontier) |

### Handoff Protocol
Handoff packages live in `.agent/handoff/<task-id>/`:
- `MANIFEST.md` — Task overview, files, dependencies
- `SPEC.md` — Interface contracts, types, API signatures
- `PLAN.md` — File-by-file implementation breakdown
- `TESTS.md` — Test specifications
- `QUALITY_GATES.md` — Pass/fail criteria
- `STATE.md` — State machine (waiting ? in_progress ? review ? approved/rejected)
- `IMPL_REPORT.md` — Implementation report (written by implementer)
- `REVISION_REQUEST.md` — Revision instructions (written by remote)

### Design Philosophy
Ousterhout's deep modules / shallow interfaces: each module hides significant complexity behind a narrow, simple API. The remote agent designs the architecture around this principle; the frontier-implementer checks interface depth during the refactor phase of TDD.