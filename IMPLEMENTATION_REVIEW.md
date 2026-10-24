# Implementation review — 2026-09-19

Scope: the native MCP implementation and surrounding Worker Core, Load Balancer,
Base Worker template, dashboard, documentation and website. This review covers
local source and generated artifacts, with regression tests for confirmed bugs.
It is not a penetration test, production load test or a guarantee that no other
bugs remain. No packages were published and nothing was pushed or deployed.

## Follow-up — Node.js and Brotli security update (2026-10-24)

The October 21, 2026 Node.js security release fixes CVE-2026-111497, an
out-of-bounds write in the bundled Brotli decoder (upstream Brotli 1.0.3–1.2.0),
together with TLS hostname and DNS issues. `engines` now requires 22.23.4+,
24.22.1+ or 26.12.1+; Node 18, 20 and 25 receive no fix. Core, LB and Base
Worker Docker images pin `node:24.22.1-bookworm` to build and
`node:24.22.1-bookworm-slim` to run; the slim runtime has no system libbrotli.

Webhook delivery no longer decompresses responses, so a caller-chosen
destination cannot feed Brotli data to the decoder, even on an unpatched
runtime. Inbound Core/LB task and MCP bodies use body-parser 1.x, which rejects
`Content-Encoding: br`; the LB Bull UI uses body-parser 2.x and does decode it,
which is another reason to keep it behind the proxy restriction.

Dependencies moved past new advisories: axios 1.20.0, compression 1.8.2, MCP SDK
1.32.2 and, transitively, body-parser 1.20.9, proxy-addr 2.0.8, follow-redirects
1.16.1, hono 4.13.13 and zod 4.6.7. `npm audit` reports zero known
vulnerabilities in Core, LB and Base Worker; 20 Core and 15 LB tests pass on
Node 24.22.1. The unpublished 0.1.6 tarball was repacked and Base Worker's
lockfile integrity matches it; the release gates below still apply.

## Follow-up — cooperative cancellation (2026-09-20)

Function deadlines now abort `context.signal`, return a timeout error promptly,
and keep the Worker slot until the handler settles. Timeout attempts are never
retried; ordinary failures retain sequential retry behavior. Late stream output
is discarded. Authenticated Worker health includes `executions.timedOutRunning`
without task inputs or credentials. The LB treats HTTP 504, upstream request
timeouts and expired caller contexts as unrecoverable jobs.

Current suites: 19 Core tests and 15 LB tests. Added coverage includes cooperative
cancellation, delayed cleanup, ignored signals, late rejection/stream writes,
slot retention, REST/MCP deadlines, health privacy and LB timeout retry suppression.
The earlier audit results below describe the original review; the timeout limit
has been revised to reflect this follow-up.

## Assessment

The chosen architecture remains appropriate: an optional `/mcp` endpoint in the
Worker or LB, one dedicated bearer token, and a hot-reloaded local `mcp.json`.
The LB calls the existing Worker REST interface with server-side credentials;
it does not depend on the Worker's separate MCP configuration. No extra service
is required. MCP permissions do not restrict the ordinary REST API.

The dashboard remains token-free and exposes the limited operational summary.
Detailed MCP targets and schemas require the existing administrator credential
on `/health`. Protect the dashboard and Bull UI at the reverse proxy: neither
implements its own login.

## Confirmed problems corrected

| Area | Problem and impact | Correction and evidence |
| --- | --- | --- |
| LB capacity | HTTP/WS status updates could replace local reservations; releasing an unreserved task could inflate capacity. HTTP-only Workers retained stale slot counts. | Separate outstanding reservation counts, bounded availability, guarded release, HTTP refresh and regression tests. A saturated matching group waits without consuming an execution retry. |
| Discovery | Malformed Worker health could fail discovery; stale sockets could mark an unreachable Worker ready again. | Validate health metadata per Worker, isolate failures, reject oversized/redirected health responses, close unreachable sockets, and ignore callbacks from replaced connections. Actual LB/Redis integration covers invalid health and recovery. |
| Redis health | Queue errors lacked handlers; health reads could wait indefinitely during Redis failure. | Queue/processor error listeners, bounded read-only health probes, and integration coverage with Redis stopped. |
| Outbound credentials | HTTP redirects could forward custom headers to a different destination. | Disable redirects for dispatch, health, log proxy and webhook requests. A local redirect test verifies webhook credentials are not forwarded. |
| Worker WebSocket | Invalid/oversized authenticated frames could emit an unhandled socket error. | Authenticate the handshake, cap payload size and handle socket errors. A real-process test confirms the Worker survives an oversized frame. |
| REST validation | Unicode lengths and object enums disagreed with MCP JSON Schema; inherited input properties could be mistaken for values; mutable defaults leaked changes between calls. | Unicode code-point lengths/patterns, deep enum comparison, own-property lookup and cloned object defaults, with regression tests. Reject invalid modes, string priorities and non-string webhook headers. |
| Services | Public service helpers used a registry different from the one populated during bootstrap. | Export helpers backed by the actual loaded-service registry; test service tags and shutdown callbacks. |
| Worker health | A filesystem failure while reading tags escaped an async Express handler. | Forward errors to the sanitized error middleware; a real-process test checks safe HTTP 500 and subsequent recovery. |
| MCP names | A normalized function name could collide with an ordinary valid name. | Reserve and hash the `__andera_` namespace; test both the invalid name and its literal counterpart. Normal valid names remain unchanged. |
| MCP performance | Requests reread unchanged configuration files and recreated JSON Schema validators. | File-metadata change detection plus forced watcher reload; per-router bounded schema cache. Permission checks still use current configuration. Tests cover definition changes, malformed schemas and live revocation. |
| MCP protocol limits | Bounds and transport edge cases needed direct coverage. | Tests cover unsupported methods/versions, malformed and oversized requests, oversized results and the 32-call admission limit using the official SDK. |
| OpenAPI | Array schemas lacked `items`; required input and descriptions were incomplete. | Generate consistent array/input schemas and descriptions. |
| Dashboard | Overlapping polls and stale log requests could update the wrong drawer. | Prevent overlapping refreshes, check selected Worker before rendering logs, handle failed requests, and protect reopened drawers from an old close timer. Rebuild tracked assets. |
| Deployment | Basic auth examples conflicted with MCP's Authorization header; admin path matching missed exact/case variants; Docker still used Node 20. | Scope Basic auth to admin paths, preserve bearer forwarding, correct backend ports/timeouts, use Node 24 images and pass REQUEST_BODY_LIMIT through Compose. |
| Documentation/site | Several defaults, webhook behaviors, service-health examples and metadata were inaccurate. License wording did not match the repository text. | Correct the examples and defaults, preserve MCP prominence, use per-page metadata, and describe the project as source-available under its actual repository license. |

## Initial review validation (2026-09-19)

- Worker Core: **15 tests passing**; Load Balancer: **15 tests passing**.
  Suites run on Node 24 and Node 18; the final Worker health regression was
  also rerun on Node 18. The final WebSocket callback regression passed there too. Node 18 compatibility is not a recommendation to deploy
  an unsupported runtime.
- Integration tests run real Worker/LB processes, a local Redis instance, the
  official MCP SDK client and HTTP/WebSocket fixtures. They cover auth isolation,
  live configuration edits/deletion, slots, REST sync/stream/webhook behavior,
  metadata filtering, malformed discovery and Redis failure.
- Core/LB TypeScript builds and formatting checks pass. Base Worker builds and
  passes formatting against the exact locally packed Core 0.1.6 artifact. A clean
  temporary install using the committed lockfile (`npm ci --prefer-offline`) and
  build also passed, with the unpublished Core tarball supplied by the npm cache;
  this does not prove registry-only installation is available.
- LB dashboard build passes. Website TypeScript and production build pass on
  Node 24. Browser checks cover the homepage, MCP guide and rendered Worker
  diagram; no page errors or horizontal overflow on the checked desktop pages.
- Dependency audits: **zero known vulnerabilities** in all four repositories at
  review time. This does not audit business functions or deployed infrastructure.
- A local 500-validation microbenchmark measured approximately 84 ms with fresh
  AJV providers versus 1 ms with the bounded cache. This isolates validation
  overhead; it is not a whole-system throughput result.
- Docker runtime testing was unavailable because the local Docker daemon was
  not running. The Dockerfiles/Compose configuration were reviewed as source.
- CLI/hosted client compatibility was checked against official documentation;
  Claude, ChatGPT, Codex and Cursor were not all exercised end to end.

## Remaining limits and risks

These are explicit boundaries, not claims of completed hardening.

1. **Cancellation remains cooperative.** A function timeout aborts its signal,
   suppresses retries and returns an error, while retaining the slot until the
   handler settles. Ignoring the signal can occupy a slot indefinitely. Blocking
   JavaScript cannot be interrupted in-process, and unawaited child operations
   outlive handler accounting. Use isolated execution for hard cancellation.
   Completed external side effects are not undone. An LB/client deadline or
   disconnection does not itself send cancellation to the Worker.
2. **One active LB per queue.** Pending HTTP resolvers and Worker credentials live
   in that LB's memory. Another LB consuming the same `tasks` queue, or a restart,
   cannot resume those requests. Durable multi-LB operation needs a different
   credential/resolver design. Redis alone does not provide that capability.
3. **Admission and queues.** MCP admits at most 32 calls per router/process, but
   the ordinary REST queue has no configured length limit. Direct Worker MCP
   calls can wait for slots/services without a separate queue-wait deadline.
   There is no built-in per-token rate limiter; apply proxy limits as needed.
   LB reservations are a local estimate; the Worker owns the execution queue.
4. **Trusted outbound destinations.** Worker URLs are administrator configured.
   Authenticated webhook users can request HTTP(S) destinations including private
   addresses; redirects are blocked, but there is no destination allowlist or
   network egress sandbox. Deployments with untrusted callers need an egress
   policy. Functions themselves remain trusted code.
5. **Lifecycle.** Shutdown invokes service cleanup but does not implement full
   HTTP/job draining. A hanging service start/status/stop or tag callback has no
   general deadline. Graceful draining and callback deadlines need dedicated work.
6. **Shared credentials and visibility.** A single MCP token grants the configured
   scope; there are no per-user roles or quotas. Omitted `functions` exposes all
   functions in that scope, including future additions. Explicit allowlists are
   preferable when the function catalog can change independently. Environment
   secret rotation requires restart. The unauthenticated dashboard intentionally
   exposes operational information if the proxy does not restrict it.
7. **Client compatibility.** V1 has no OAuth, legacy SSE, resumable sessions or
   cancellation guarantee. Static bearer-compatible clients can connect;
   OAuth-only hosted connectors need additional authorization work. Do not
   advertise universal compatibility.
8. **Maintenance cost.** MCP config/schema/transport code is mirrored between
   Core and LB. Changes and regression tests must be kept aligned until a shared
   package becomes justified.
9. **License description.** `LICENCE` is titled Elastic License 2.0 but contains
   custom restrictions, including competing redistribution. The website now
   points to that text. This review did not change the license or determine legal
   validity; choosing an official standard license remains an owner decision.

## Release gates

- Core 0.1.6 was not available from the npm registry when checked. Base Worker
  depends on it, so a fresh registry-only install is not yet releasable.
- Publish the exact validated Core tarball, or regenerate Base Worker's lockfile
  against the actual published artifact. Its integrity must match that artifact.
- Upgrade the LB before mixing old/new Workers, as described in
  [MCP_IMPLEMENTATION_PLAN.md](MCP_IMPLEMENTATION_PLAN.md).
- After publication, run a fresh Base Worker `npm ci` and build; then run Docker
  and deployment smoke tests with the actual proxy, TLS, Redis and client.
- Public dashboard/Bull deployments require their proxy access restriction.
  Do not use multiple active LBs on the same queue with the present design.

## External references checked

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
- [Claude hosted connectors and headers](https://claude.com/docs/connectors/custom/remote-mcp)
- [Cursor MCP configuration](https://cursor.com/docs/mcp)
- [ChatGPT developer mode](https://developers.openai.com/api/docs/guides/developer-mode)
- [Nginx Basic authentication](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)
- [Node.js release support](https://nodejs.org/en/about/previous-releases)
