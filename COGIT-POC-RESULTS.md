# Cogit POC Enforcement Validation

## Environment Notes

- Project: `demoji` (`proj_c4300922-b61d-4fc5-85d1-6d3070ac18d5`)
- Service: `http://127.0.0.1:4311`
- Workbench: `http://127.0.0.1:4312`
- Gateway: `http://127.0.0.1:4000`
- Starting state mismatch: live sanitization config was `taskIdMode: "permissive"` instead of the expected strict baseline.
- I flipped the project to `strict` through `PUT /api/projects/:projectId/sanitization/config` so Test 1 could still run.

## Gateway Enforcement

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| Strict mode rejects no-task-ID | 403 | Project started in `permissive`. After forcing `strict`, bare gateway requests still returned `400 invalid_request_error` with `Invalid request format: 'CogitGatewayCallbacks' object has no attribute 'async_post_call_success_hook'` instead of `403 X-Cogit-Task-ID header required`. | No |
| Permissive mode warns | Allow + warning | Live project began in `permissive`, but bare requests still failed with the same gateway callback `400` before a successful allow-path could be observed. I did not get a clean allow + warning result, and Jordan manual toggle was not exercised separately. | No |

Observations:

- The strict error message in source/test fixtures is clear, but the live deployment never surfaced it.
- The live blocker is the gateway callback stack, not missing task-ID enforcement.

## Policy & Preflight

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| Contradictory task flagged | Preflight flags conflict | `preflight.run` returned `blocked`. It included the relevant blocker that log-statement emoji must be removed, plus several broader policy blockers. The contradiction was caught, but the output was noisier than ideal. | Yes |
| Out-of-scope file blocked | Blocked or warned | Claimed a task intended for `src/lib/reporter.ts`, intentionally wrote to `src/lib/detector.ts`, then completed the task. Completion succeeded. Audit did not flag an out-of-scope write; it only emitted unrelated `missing_file_coverage` findings tied to the broad decision-point file list. | No |

## Sanitizer

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| AWS key redacted | Yes | Could not verify. Gateway request failed with the same callback `400` before a usable sanitized conversation or audit redaction event was observable. | No |
| Anthropic key redacted | Yes | Could not verify for the same reason. | No |
| Postgres URL redacted | Yes | Could not verify for the same reason. | No |
| GitHub token redacted | Yes | Could not verify for the same reason. | No |
| Audit shows redaction counts | Yes | `audit.run` and `/api/audit/findings` did not surface sanitizer redaction events from the live request. | No |

Notes:

- Temporary file `test-secrets.json` was created for the test and then deleted.
- The fake secret content also polluted technology detection briefly by causing `postgresql` to appear in project detail while the file existed.

## Audit & Memory

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| Full audit trail | All tasks + events | `audit.run` included the original 8 tasks plus the validation tasks. It did preserve task IDs, some claim/completion state, and many audit findings. It did not give a useful view of gateway enforcement events, sanitizer redactions, or an explicit out-of-scope write violation. Findings were dominated by `missing_file_coverage` and `unacknowledged_policy_rule`. | No |
| Memory search returns results | Relevant sessions | All three searches returned empty results: `emoji detection regex unicode property`, `gitignore parsing implementation`, and `replacement strategy for log statements`. | No |

## Workbench

| View | Load Time | Data Accurate? | Notes |
|------|-----------|----------------|-------|
| Home | 0.029s | Partial | `/api/dashboard` returned 1 project and 0 conversations. Project presence/posture were right, but conversations were missing and readiness showed a blocked default-auth posture. |
| Project | 0.218s | Partial | `/api/projects/:projectId` showed demoji, enforced posture, hybrid identity, tasks, guidance, and audit context. Conversations remained `0`. Temporary test artifact briefly influenced technology detection. |
| Guidance | 0.218s | Partial | Guidance source/pack data and 6 reviewed rules were present through project detail. The newly added performance rule was only a candidate and never reached projection output. |
| Policy | 0.020s | Yes | `/api/policy/overview` accurately showed `pending_review`, 6 effective rules, and the new blocked preflight run for the contradictory task. |
| Conversations | 0.025s | No | `/api/conversations` returned no conversations. This does not match the expectation that Codex development sessions were captured. |
| Audit | 0.025s | Partial | `/api/audit/findings?projectId=...` loaded quickly and showed findings, but they were mostly file-coverage/policy-acknowledgement noise rather than gateway/sanitizer/scope-specific enforcement evidence. |

## Projection Freshness

- Initial `AGENTS.md` was present and contained the enforced posture and the 6 reviewed guidance rules.
- Added candidate guidance rule: `demoji scan should complete in under 5 seconds for repos with up to 10,000 files`.
- `projection.sync` with `targetSurface="agents_md"` failed with `Unexpected service error`.
- `AGENTS.md` did not change after the sync attempt.

Result:

- New rule did not appear after sync.
- Sync time could not be meaningfully measured because the service returned an error immediately.

## Detailed Test Records

### Test 1

- Bare gateway request without task ID:
  - Before config change: live project config read back as `taskIdMode: "permissive"`.
  - After forcing strict: response was still:

```json
{
  "error": {
    "message": "Invalid request format: 'CogitGatewayCallbacks' object has no attribute 'async_post_call_success_hook'",
    "type": "invalid_request_error",
    "code": "400"
  }
}
```

### Test 2

- Human-assisted permissive-mode validation was not cleanly exercised because the live system already started permissive and the gateway callback bug prevented successful permissive requests.

### Test 3

- Created validation task: `task_331e2602-3d68-46d1-9ca8-ac28a255c7ee`
- Preflight run: `pfrun_66c10f61-d235-45d6-9a07-f2622b96cddc`
- Relevant blocker text included:
  - replacement strategy says `LOG_STATEMENT emoji -> remove entirely`

### Test 4

- Created validation task: `task_66b46b10-3c11-4054-bf7c-7c26d6d49c39`
- Claimed successfully.
- Intentionally edited `src/lib/detector.ts` outside the task’s intended `reporter.ts` ownership.
- Completion succeeded.
- Resulting audit finding was unrelated:
  - `missing_file_coverage` for `AGENTS.md`, `COGIT-POC-RESULTS.md`, and `test-secrets.json`

### Test 5

- Temporary file created and later deleted.
- Gateway request with task ID still failed with the callback `400`.
- No redaction counts were visible in audit output.

### Test 6

- `audit.run` covered:
  - all original demoji build tasks
  - contradictory validation task
  - narrow-scope validation task
- Gaps:
  - no useful gateway enforcement event coverage
  - no visible sanitizer redaction event coverage
  - no useful out-of-scope write finding
  - noisy file-coverage findings due path normalization / decision-point scope mismatch

### Test 7

- Memory searches all returned no matches.

### Test 8

- Workbench backing APIs were responsive.
- Major data gap: conversations were absent.

### Test 9

- Candidate rule creation succeeded.
- Projection sync failed.
- `AGENTS.md` remained stale relative to the candidate change.

## Cleanup

- Deleted temporary `test-secrets.json`.
- Cancelled contradictory validation task after preflight.
- Reverted the intentional out-of-scope source edit.
- Scope-test task was left completed so its audit evidence remains visible.

## Overall Assessment

Cogit's local service and workbench surfaces are up and responsive, and preflight/audit machinery is clearly active. The enforcement boundary itself is not validated successfully in this environment because the live gateway fails with a callback integration error before strict/permissive behavior and sanitizer telemetry can be observed end-to-end. Audit data exists, but it is currently much better at catching metadata hygiene issues than the specific governance violations this POC was meant to prove.
