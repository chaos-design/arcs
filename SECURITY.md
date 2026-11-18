[中文版](./SECURITY_zh.md) · English

# Security Policy

Thank you for helping keep ARCS and its users safe. This policy explains which
versions receive security fixes, how to report a vulnerability privately, what
we need from a report, what response to expect, and which ARCS-specific areas
deserve particular scrutiny.

> **Maintainers:** `security@chaos-design.example` is a **placeholder** address.
> Replace it with a real, monitored mailbox (or publish a PGP key) before this
> policy goes live. The `example` domain does not receive mail.

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x (current development line) | ✅ |
| < 0.1 (pre-release / earlier commits) | ❌ |

Convention: **✅** = this version currently receives security fixes; **❌** =
this version is no longer supported and will not receive security patches.

0.1.x is the only supported line. There are no older stable releases yet;
unreleased commits, forks, and local modifications are not covered — please
upgrade to the latest 0.1.x before reporting. Development happens on the
repository's default branch (this document was written on
`docs/bilingual-complete`); reports against a specific commit should name that
commit hash.

## Reporting a Vulnerability

**Preferred channel — GitHub Security Advisories (private).** Use the
repository's **Security** tab → **Report a vulnerability** → *Report a security
vulnerability privately*. This opens a private advisory between you and the
maintainers, keeps technical details out of the public issue tracker, keeps the
report accessible while a fix is prepared, and allows a CVE to be requested
directly from the advisory if you want one.

**Alternative channel — email.** Send to **`security@chaos-design.example`**
(placeholder — see the maintainer note above). If maintainers publish a PGP
key, encrypt reports containing exploit details or sensitive data.

**Do NOT file a public issue.** Never disclose a suspected vulnerability in a
public GitHub Issue, Discussion, Pull Request, commit message, release note, or
public chat. Public disclosure before a fix exists increases the risk of
exploitation and forces us into incident response before we can validate the
report. If you already opened a public issue, please flag it for immediate
removal and submit the details through one of the private channels above.
Reports made only in public may be treated as outside coordinated disclosure
and may limit attribution.

Please do not probe systems you do not own or are not authorized to test, and
do not exfiltrate real user data while demonstrating an issue — a minimal,
synthetic proof is sufficient.

## What to Include in Your Report

The more of the following you provide, the faster we can triage:

* **Impact and scope** — affected package(s) (`core`, `plugin-kit`,
  `host-kit`, `plugins/*`, `plugins/mcp`, `sdk/*`, CLI), the attack surface (for
  example: tool-call arguments, HITL approval channel, MCP JSON-RPC messages,
  audit files), the vulnerability class (path traversal, command injection,
  approval bypass, information disclosure, denial of service, dependency
  compromise, …), and a realistic worst-case impact.
* **Reproduction steps** — a minimal, deterministic sequence; include the host
  or harness used (for example Codex, Claude Code, opencode, pi, DeepSeek,
  `sdk/vercel`), the relevant configuration/environment variables, and the
  expected versus observed behavior.
* **Proof of concept** — minimal code, configuration, JSON-RPC message, or
  tool-call payload that demonstrates the issue. Keep it non-destructive and
  free of real credentials or personal data.
* **Affected versions** — release/tag or exact commit hash, branch, and whether
  the latest 0.1.x is affected. If known, note when the issue was introduced.
* **Suggested fix or mitigation** — optional but very helpful: a proposed
  patch, a safe validation strategy, or a temporary workaround for users.
* **CVE and attribution preference** — whether you would like a CVE requested
  (GitHub private advisories can issue one), the name/handle you want credited
  in the advisory and release notes, and whether you prefer to remain
  anonymous. Also tell us whether the issue is known to anyone else or has
  already been disclosed anywhere.

## Response Process and Expectations

These are best-effort targets for a maintainer team; we will tell you if a case
needs more time.

1. **Acknowledgement — within 3 business days.** We confirm receipt, open a
   private case, and assign a maintainer owner.
2. **Initial assessment — within 7 business days.** We reproduce the issue,
   determine whether it is a security vulnerability, assign a severity, and
   identify affected versions. We will tell you the preliminary verdict, or
   explain why more time is needed. Reports that are not security issues will
   be explained and, where appropriate, redirected to a normal issue.
3. **Fix and coordinated disclosure.** We develop and test the fix privately,
   prepare a security advisory and release notes, request a CVE if you want
   one, and agree a disclosure date with you. We will keep you informed of
   progress at least every 5 business days while a case is open. High-severity
   issues (for example, an HITL approval bypass or arbitrary command execution)
   are prioritized and may be fixed and released ahead of the normal schedule.
4. **Release and follow-up.** We publish the advisory and patched release
   together, credit you according to your preference, and, if useful, add a
   regression test so the issue cannot silently return.

If you receive no acknowledgement within 7 business days, please re-send via
the same private channel once and, if still unanswered, contact a maintainer
privately through GitHub to make sure the report was not missed.

## Disclosure Policy

* **90-day coordinated disclosure.** We aim to confirm, fix, and release within
  90 days of the initial report. We ask reporters not to publish details before
  the coordinated release, giving users time to upgrade. If a fix cannot be
  completed within 90 days, we will explain why and agree a concrete extension
  with the reporter rather than letting the deadline pass silently.
* **Earlier disclosure.** If an issue is publicly leaked, actively exploited,
  or poses immediate danger, we may disclose and release earlier than the
  agreed date, with as much advance notice to the reporter as circumstances
  allow.
* **Attribution and thanks.** With your consent we credit you by name or handle
  in the security advisory and release notes. You may choose to remain
  anonymous. We do not disclose the reporter's identity in public without
  permission (except where legally required).

## ARCS-Specific Security Concerns

ARCS is an Agent course-steering engine: it sits between model decisions and
tool execution and rewrites tool-call arguments, injects prompts, redirects
tools, and suspends high-risk actions for human approval. That position makes
the following areas security-sensitive. Please report anything in this list
privately, even if you are unsure whether it is exploitable. Design context:
[README_zh.md](./README_zh.md), [architecture.md](./docs/architecture.md),
[key-flows.md](./docs/key-flows.md),
[host-kit.md](./docs/host-kit.md), [constraints.md](./docs/constraints.md),
[telemetry.md](./docs/telemetry.md).

### (a) L1 `PatchArgs` hot-fixing must not introduce path traversal or command injection

L1 corrects malformed tool-call arguments (for example, a hallucinated path or
bad JSON field) by patching them in milliseconds so the host can pass them
through and the task continues ([key-flows.md](./docs/key-flows.md)). Because a
"correction" changes what the tool actually receives, the patch itself is part
of the attack surface: **a hot fix must never be the step that introduces a new
`../` path traversal, an absolute-path escape, a null byte, or a shell
metacharacter/command-injection vector** that was not present in the original
call. Report cases where a `PatchArgs` result is not re-validated against an
allowed root/schema, where string concatenation replaces structured field
patching, where module banner/permission context is lost, or where a Tier B/C
host that lacks `patchArgs` silently falls back to "allow" with an
unvalidated `updatedInput`. Rule-based correction logic and model-supplied
suggestions must both be treated as untrusted input.

### (b) L4 `Suspend` (HITL) approval must not be bypassed

L4 suspends a single high-risk action (for example, `rm -rf` or editing a
protected `.env`) and resumes it only after interactive or webhook approval;
rejection or the default 120s timeout means block + inject an explanation, and
the task continues ([key-flows.md](./docs/key-flows.md),
[constraints.md](./docs/constraints.md) #4). This is the project's strongest
safety boundary. Report any path that lets a tool argument, injected prompt, or
model message self-approve a suspension, forge `approved: true`, replay or race
an approval token, approve a different action than the one suspended, or turn
`Suspend` into an unconditional allow. Note the deliberate design in
[host-kit.md](./docs/host-kit.md): Hook-based platforms have a ~5s timeout and
must translate `Suspend` to `ask` (Tier A) or `block` (Tier B) rather than
calling HITL synchronously; only subscription-based platforms run the async
HITL flow. Gaps must be recorded in `HostDecision.degraded` and the
`AuditEvent` (`suspend→block`, `suspend→allow`) — a silent downgrade is itself
a finding. "Task continuity" must never be used as a justification for
auto-approving a high-risk action.

### (c) MCP transparent proxy: JSON-RPC messages, line-buffer limit, EPIPE, pending requests

`plugins/mcp` (`arcs-plugin-mcp`) is a persistent stdio JSON-RPC transparent
proxy with a serial queue that intercepts `tools/call` ([architecture.md](./docs/architecture.md),
[host-kit.md](./docs/host-kit.md)). Hardening requirements, all of which are
security-relevant, include: a **1 MB line-buffer limit** so oversized lines
cannot exhaust memory; malformed JSON lines answered with JSON-RPC **-32700**;
downstream unreachable answered with **-32000** for requests carrying an id;
error listeners on all three pipes so a downstream **EPIPE** cannot crash the
proxy; and **every forwarded pending request must be settled when the
downstream exits** — no client may be left hanging. Report ways to bypass the
line limit, smuggle messages across the stream boundary, forge JSON-RPC ids to
hijack or suppress another client's response (including an approval response),
silently drop a `block`/`ask` decision, or keep a request unresolved forever
(denial of service). Proxying must not strip the host's guardrail metadata or
let prompt-injected tool arguments travel downstream unchecked.

### (d) `AuditEvent` may contain sensitive paths/parameters: redaction and access control

`AuditEvent` (`packages/telemetry`) carries `signals` and `effects`, which can
embed paths, tool names, and argument fragments from corrections
([telemetry.md](./docs/telemetry.md)). Even though `FileAuditSink` writes only
validated event fields and explicitly excludes raw prompts and tool arguments,
correction effects can still leak secrets, home-directory paths, or protected
filenames. Report any sink or code path that writes raw secrets, tokens, `.env`
values, or unredacted absolute paths to disk (`ARCS_AUDIT_FILE`,
`<ARCS_HOME>/audit/<host>/<YYYY-MM-DD>.jsonl`, default `~/.arcs`) or to an
`HttpSink`/`OtlpSink`. Persisted audit data needs restrictive file permissions,
a clear retention policy, and must not be committed to git; telemetry receivers
must be trusted, authenticated, and TLS-protected. Redaction must happen
**before** `TelemetrySink.emit` and must not throw, because constraint #10
(forbidding telemetry backpressure) means a failing sink is silently dropped —
a redaction failure must never turn into an exception on the steering path.

### (e) `core` zero-I/O / zero-host-dependency red line and `pnpm scan`

`packages/core` must contain no `fs` / `net` / `child_process` imports and no
host SDK dependencies; this is enforced by `scripts/scan-deps.mjs` with each
Node builtin whitelisted individually by justification
([constraints.md](./docs/constraints.md) #1,
[architecture.md](./docs/architecture.md)). This red line keeps correction
logic deterministic, sandbox-safe, and free of exfiltration paths. Report any
bypass — dynamic `import()`, `require`, `eval`, reaching `process` through
`globalThis`, a transitive dependency that performs I/O, or a CI change that
weakens the scan — as well as any new dependency that reads the filesystem,
opens sockets, or spawns processes from code that is supposed to be pure.
Generated or contributed code that quietly introduces I/O into `core` is a
high-severity finding.

### (f) Host contract guardrails: `pnpm verify:contracts`

`HOST_CAPABILITIES`, `applyEffect`/`translateEffects`, and each plugin's
`serialize*` function define what a host decision (`allow|block|ask`,
`updatedInput`, `updatedName`, `injected[]`, `degraded[]`, `level`) is allowed to
express ([host-kit.md](./docs/host-kit.md)). `pnpm verify:contracts`
(`scripts/verify-host-contracts.mjs`, static assertions plus Codex official
schema behavior checks) and the conformance tests lock the capability matrix
to actual behavior. Report any change that breaks these guardrails: a plugin
declaring a capability it does not enforce (for example advertising
`patchArgs` while accepting unvalidated arguments), a serializer that turns a
`deny` into an `allow`, drift between the matrix and runtime behavior, or a
bypass of `verify:contracts` in CI. Such mismatches can silently widen host
permissions and undermine every other boundary in this policy.

## Security Design Red Lines and the fail-open Balance

The ten constraints in [docs/constraints.md](./docs/constraints.md) are the
engineering red lines; they are also security requirements:

| # | Constraint | Security relevance |
|---|---|---|
| 1 | core purity: no `fs`/`net`/`child_process` | No I/O or exfiltration in the decision engine (`pnpm scan`) |
| 2 | CPU-time latency budget < 50ms | Prevents OS preemption from falsely downgrading an L4 block to a pass-through |
| 3 | Serializable `SteeringEffect[]` | Auditable, replayable, tamper-evident decisions |
| 4 | Approval semantics: suspend one action, timeout → block + inject | HITL cannot become task termination or silent allowance |
| 5 | Host-agnostic `plugin-kit` | Host SDK trust stays out of the glue layer |
| 6 | SDK boundary | SDKs do not reimplement lifecycle/proxy safeguards |
| 7 | Fail open on failure → pass through + `degraded` | ARCS must never become a task interruption source |
| 8 | Effect-list contract; `Suspend` alone and last | No partially materialized or reordered safety decisions |
| 9 | Session state TTL (default 30 min) | Bounds stale authority and memory leaks |
| 10 | No telemetry backpressure | Sink failures cannot disable steering or hide attacks |

**The balance:** fail-open (constraint #7, the "ARCS must never become a task
interruption source" promise from [README_zh.md](./README_zh.md)) means that
when *ARCS itself* fails — a sensor exception, a planning error, a budget
overrun — the host task continues and the event is marked `degraded` and
audited. It does **not** mean that security boundaries are relaxed when things
go wrong. In particular:

* L4 rejection or timeout is a **block of that single action plus an injected
  explanation** — never an automatic allow. Task continuity is preserved by
  keeping the task alive, not by waving the dangerous action through.
* Capability gaps downgrade *ARCS's steering ability*, not the host's security:
  every downgrade is recorded (`degraded[]`, audit event) and must never grant
  a capability the host did not have (for example, an unvalidated
  `updatedInput`).
* Non-negotiable boundaries — no I/O in `core`, trusted-only approval sources,
  `verify:contracts`, redaction before emit — apply even on the fail-open path.

An attacker may try to *trigger* a sensor exception or CPU-budget overrun to
force fail-open and slip a correction past us. Mitigations are layered: budget
is measured in CPU time (constraint #2) so preemption cannot fake an overrun;
individual sensor failures skip only that sensor; the overall fallback still
emits a `degraded` audit event for monitoring; and fail-open never grants new
rights to the underlying tool call. If you find a case where forcing `degraded`
bypasses an L4 suspension or corrupts an audit record, report it as high
severity. **In short: degrade the correction, never the security boundary.**
