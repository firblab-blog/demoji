# Cogit POC Retrospective

## Executive Summary

The `demoji` POC produced a complete TypeScript CLI that scans repositories for emoji, classifies each match by context, applies policy-driven replacements, and generates both terminal and HTML reports. From the product side, the POC succeeded: the CLI was built quickly, the guidance was concrete enough to shape the implementation, and the task model provided a clean way to break the work into scaffold, detector, scanner, replacer, CLI, integration, and hardening phases.

Cogit itself performed unevenly. The strongest parts were project setup, guidance injection, task structuring, preflight contradiction detection, and basic audit persistence. The weakest parts were the actual enforcement boundary and the evidence surfaces that were supposed to prove it: live gateway routing failed before strict/permissive task-ID checks could be observed, sanitizer behavior could not be validated end to end, file-scope enforcement did not catch an intentional out-of-scope write, memory search returned nothing, and conversations were absent from the Workbench.

Top-line recommendation: do not treat Cogit as production-ready for governance-critical enforcement yet. It is ready for continued internal dogfooding because the guidance/task/policy backbone is already useful, but the gateway, scope enforcement, projection sync, and conversation/memory capture gaps need to be fixed before the system can be trusted as a source of compliance truth.

## What Worked Well

### Guidance injection and initial project shaping

- The strongest success case was the initial guidance payload. The active rules were specific enough to drive architecture, behavior, and tests without repeated clarification.
- Concrete examples:
  - The replacement-strategy rule directly informed the replacer behavior: comments -> text, log statements -> remove, identifiers -> flag only, string literals -> preserve unless `--strict`.
  - The file-targeting rule drove supported extensions, ignore handling, binary detection, and directory skips.
  - The architecture rule kept the implementation on stdlib-only Node.js with a single TypeScript entrypoint and no runtime dependencies.
- This guidance saved time by front-loading constraints that otherwise would have required design back-and-forth or post-hoc correction.

### Task workflow and dependency structure

- The task model delivered real value. The main build was decomposed into 8 delivery tasks with clear dependencies, and that breakdown maps closely to how a senior engineer would naturally stage the work.
- Helpful patterns:
  - `Scaffold project structure` unblocked all later work.
  - `Build emoji detection engine` fed both `Build replacement engine` and `Build file scanner`.
  - `Build CLI interface` depended on the core modules and produced a clear integration point.
  - `Write integration tests` and `Harden edge cases` fit naturally as later-stage tasks.
- This made the work feel organized rather than ad hoc. Even without a large team, the dependency graph gave useful structure.

### Preflight caught at least one meaningful contradiction

- Preflight successfully blocked the validation task that asked to add emoji to all error messages.
- That was important because it proved the effective guidance was being checked against proposed work rather than merely displayed.
- The relevant blocker text was correct: log-statement emoji must be removed, so a task demanding more emoji in error output was contradictory.

### Audit trail had some real value

- The audit trail was not clean enough for formal enforcement, but it was still useful for understanding task history and state transitions.
- It preserved task IDs, claim/completion timing, decision-point links, and some policy-acknowledgement evidence.
- For retrospective work, that data made it possible to reconstruct what happened across the build and validation phases without guessing.

## What Was Clunky

### Decision-point and policy workflow had friction

- Decision-point consultation was required and useful, but it could be noisy.
- The returned briefing often bundled all active rules together, even when only one or two were materially relevant to the action at hand.
- This made the output feel heavier than necessary for small or obvious edits.

### Guidance review flow looked duplicate-prone

- Policy overview showed 5 reviews total, 4 still open, and 55 review items still pending despite only 6 effective rules being active.
- Multiple review entries appeared to represent the same manual guidance source in slightly different forms.
- That made review state hard to interpret and undermined confidence in the approval queue as a clean operational surface.

### Preflight results were correct but verbose

- The contradiction test was blocked correctly, but the signal-to-noise ratio was weak.
- Instead of highlighting the single decisive contradiction first, preflight returned the contradiction plus a stack of generic blockers repeating every active rule.
- Result: the system technically helped, but it took extra reading to understand why the task was really blocked.

### Audit findings skewed toward bookkeeping noise

- The audit system surfaced a lot of `missing_file_coverage` and `unacknowledged_policy_rule` findings.
- Some of those findings were operationally interesting, but many felt like metadata hygiene warnings rather than direct governance outcomes.
- Path normalization also looked clunky. Findings mixed absolute and relative paths, which contributed to false or confusing file-coverage issues.

### Workbench navigation was fast but only partially trustworthy

- Load time was good across all measured views: average load time was about 0.089s.
- The friction was data quality, not speed.
- Examples:
  - Home and Project views loaded quickly but showed `0` conversations.
  - Guidance data was visible, but candidate changes were not reflected in projection output.
  - Audit loaded quickly, but the findings were not the most important ones for the POC.

### CLI and MCP ergonomics were mixed

- The MCP surface was powerful but not always intuitive in practice.
- Memory search required multiple attempts and still produced no results.
- Some validation required falling back to raw HTTP calls against local service endpoints because the higher-level answers were incomplete or too abstract.

## What Didn't Work

### LLM gateway routing failed before enforcement could be validated

- This was the biggest hard failure in the POC.
- Both strict-mode and permissive-mode validation attempts hit the same live gateway error:
  - `Invalid request format: 'CogitGatewayCallbacks' object has no attribute 'async_post_call_success_hook'`
- Because of that callback failure:
  - strict task-ID enforcement was not observed end to end
  - permissive allow-with-warning behavior was not observed end to end
  - sanitizer validation could not be observed end to end

### File-scope enforcement did not catch an intentional violation

- A validation task was scoped to `src/lib/reporter.ts`.
- An intentional edit was made to `src/lib/detector.ts` instead.
- Task completion still succeeded, and audit did not produce an out-of-scope write finding.
- This is a genuine enforcement gap, not just UI friction.

### Sanitizer validation was effectively blocked

- The POC attempted to test redaction for AWS keys, Anthropic keys, Postgres URLs, and GitHub tokens.
- None of those tests produced usable live sanitizer evidence because the gateway failed first.
- Audit logs also did not show sanitizer redaction counts afterward.
- Net result: sanitizer effectiveness remains unproven in this environment.

### Memory search and conversation capture were unusable

- Memory search returned no results for all three test queries.
- Workbench and dashboard APIs reported `conversationCount: 0` and `messageCount: 0`.
- This does not match how the project was actually developed and makes the Conversations view effectively non-functional for retrospective use.

### Projection sync failed

- Candidate guidance rule creation succeeded.
- `projection.sync` for `AGENTS.md` failed immediately with `Unexpected service error`.
- The projection remained stale, so the system could not prove that reviewed or candidate guidance would propagate reliably back to developer surfaces.

### Missing evidence surfaces

- The POC needed explicit telemetry for gateway decisions, sanitizer events, and scope enforcement.
- Those were either absent or buried under unrelated findings.
- Without first-class evidence for those events, Cogit cannot yet serve as a dependable compliance record.

## Cogit Feature Scorecard

| Feature | Score | Notes |
|---------|-------|-------|
| Project registration | 4 | Project discovery and identity attachment worked quickly and produced a usable project shell. |
| Guidance source/rule creation | 3 | Core rule creation worked, but review duplication and candidate-rule handling were clunky. |
| Guidance packs & attachments | 4 | Effective rules were attached and clearly influenced implementation. |
| Task creation with dependencies | 5 | One of the best parts of the POC; dependencies mapped cleanly to real work. |
| Task ready (dependency gating) | 4 | Dependency structure was useful and coherent, though not heavily stress-tested under concurrency. |
| Task brief (context injection) | 4 | Guidance/context were useful, but often broader and noisier than needed. |
| Task claim/heartbeat/complete | 3 | Basic lifecycle worked, but completion/audit linkage felt brittle. |
| Preflight checks | 4 | Correctly caught the contradictory emoji task, but output was noisy. |
| Posture enforcement | 2 | Enforced posture existed, but critical live enforcement evidence was missing. |
| File scope enforcement | 1 | Intentional out-of-scope write was not caught. |
| LLM Gateway routing | 1 | Live validation blocked by gateway callback failure. |
| Task-ID enforcement (strict/permissive) | 1 | Could not be proven live because gateway requests failed before policy behavior surfaced. |
| Sanitizer redaction | 1 | Could not be verified live and redaction telemetry was absent. |
| Audit trail | 3 | Useful for reconstruction, but too noisy and weak on the exact violations that mattered most. |
| Memory search | 1 | Returned no useful results. |
| Projection sync (AGENTS.md) | 1 | Sync failed with a service error and left the projection stale. |
| Workbench - Home | 3 | Fast, but conversations and some readiness details reduced trust. |
| Workbench - Project detail | 4 | Best overall Workbench view; showed tasks, guidance, posture, and audit context. |
| Workbench - Guidance | 3 | Effective rules were visible, but candidate/projection flow was confusing. |
| Workbench - Policy | 5 | Most accurate and useful Workbench surface during validation. |
| Workbench - Conversations | 1 | No conversations were recorded, so the view was not useful. |
| Workbench - Audit | 3 | Responsive, but findings were not the highest-value enforcement evidence. |
| CLI usability | 3 | Functional, but several validation flows still required direct API probing. |
| MCP tool usability | 3 | Powerful but uneven; some actions were smooth, others required retries or lower-level fallback. |

## Recommended Improvements

### Quick wins (< 1 day each)

- Fix path normalization in audit evidence so file-coverage checks do not mix absolute and relative paths.
- Make preflight summarize the primary reason for a block before listing all secondary policy matches.
- Add explicit zero-result messaging for memory and conversations so the UI distinguishes "empty because broken" from "empty because there is truly no data."
- Expose redaction-count and gateway-decision counters directly in audit/findings or dashboard metrics.
- Collapse duplicate review entries for the same guidance source/revision.

### Medium effort (1-3 days each)

- Implement first-class out-of-scope write detection based on actual changed files rather than manual closeout metadata.
- Add a dedicated enforcement-events timeline that records gateway task-ID decisions, sanitizer triggers, and posture blocks in one place.
- Improve Workbench Guidance and Policy views so effective, candidate, and projected states can be compared without jumping between screens.
- Make task completion validate file coverage more intelligently so metadata mismatches do not dominate audit output.
- Backfill conversation ingestion and memory capture for Codex sessions so retrospective search becomes usable.

### Large effort (> 3 days each)

- Fix the gateway callback integration bug and re-run strict/permissive enforcement as a full end-to-end system test.
- Harden projection sync so `AGENTS.md` updates are reliable, measurable, and recoverable after service errors.
- Build a trustworthy sanitizer validation harness with observable request, redaction, and audit events.
- Rework the enforcement model so scope, sanitizer, and gateway outcomes are all tied to the same canonical event stream instead of inferred from scattered metadata.

## Metrics

- Total tasks created: 10 total (`8` delivery tasks plus `2` P5-S1 validation tasks).
- Total Codex sessions: 0 recorded in Cogit memory/workbench, which appears to be a capture gap rather than the true count.
- Total LLM calls through gateway: 0 successfully observed in audit logs; live validation requests failed before usable gateway telemetry was emitted.
- Sanitizer redactions triggered: 0 observed in audit logs; not trustworthy as a true zero because gateway validation failed first.
- Enforcement blocks: 1 clear preflight block observed for the contradictory emoji task; latest preflight returned `1` warning plus `6` blockers.
- Average task brief quality rating: 4/5 subjective. Guidance was usually helpful and concrete, but often broader than needed.
- Workbench average load time: 0.089s across Home, Project, Guidance, Policy, Conversations, and Audit views.
- Total development time: 39.52 minutes from first task claim (`2026-03-22T23:49:04.339Z`) to last completed validation task (`2026-03-23T00:28:35.714Z`).
- Audit findings logged: 64 total (`19` open, `45` resolved).
- Open audit findings at end of POC: 19 total (`12` blocker, `7` warning).
- Open finding mix: `12` `unacknowledged_policy_rule`, `7` `missing_file_coverage`.
- Policy review state: 5 reviews total, 4 still open, 55 review items still pending, 6 effective rules active.

## Conclusion

Cogit is not yet ready for production use as a hard enforcement layer. The core product idea is validated: guidance injection, task structuring, preflight checks, and policy surfaces all provided real value during development. But the system still fails at the exact moment where trust matters most: proving live gateway enforcement, proving sanitizer behavior, proving scope enforcement, and reconstructing conversation history after the fact.

The next step should not be adding more policy. It should be tightening the enforcement and evidence loop. Specifically: fix the gateway callback bug, implement real out-of-scope write detection, restore conversation/memory capture, and make audit surfaces show the events operators actually care about. Once those are stable, Cogit will be in a much better position to move from useful internal workflow tooling to production-grade governance infrastructure.
