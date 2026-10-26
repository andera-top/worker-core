<p align="center">
  <img src="https://andera.top/img/github.png" alt="Andera" style="max-width: 100%; height: auto;"/>
</p>

# Andera Worker Core

**Andera** is a source-available platform for exposing business functions as REST APIs and MCP tools for AI agents. Run a Worker directly or use the Load Balancer to route tasks across Workers; agents connect through one `/mcp` endpoint and one dedicated token.

---

## What is Andera?

Andera is composed of three main components:

- **Load Balancer:** Routes tasks, monitors Workers, and exposes functions across groups/contracts through one MCP endpoint.
- **Base Worker:** Template for building your own custom workers.
- **Worker Core:** The core engine for all workers.

Learn more: [Andera Documentation](https://andera.top/docs/)

---

## About Worker Core

Worker Core is the engine for all Andera-based workers.  
It is never used standalone, but always as a dependency of a Base Worker.  
It provides orchestration, slot management, contract validation, logging, and runtime for building high-performance, distributed workers.

---

## Native MCP

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is the standard way for AI agents such as Claude, Cursor or VS Code to discover and call tools. Worker Core lets any Worker built on it expose its functions as MCP tools at `/mcp`. Agent calls go through the same validation, queue and slots as REST requests, and function and parameter descriptions become the tool catalog, so existing handlers need no changes.

MCP is off by default. A Worker turns it on with two settings:

- `MCP_AUTH_KEY`: the bearer token agents use. It must contain no whitespace and differ from `AUTH_KEY` and `LB_AUTH_KEY`; otherwise MCP stays disabled and a warning is logged. It grants no access to REST logs or maintenance.
- `mcp.json`: the functions to expose. `{"functions":["hello"]}` exposes only `hello`; `{}` exposes every function.

`mcp.json` is read from the Worker's application root, the parent of the source directory passed to `bootstrap` (for example `src/` or `dist/`); `MCP_CONFIG_PATH` points elsewhere. The file reloads without a restart: invalid edits keep the last valid selection, and a missing or unreadable file disables MCP. Browser clients must be listed in `MCP_ALLOWED_ORIGINS`; native clients need nothing. Requests are limited to 1 MB and tool results to 1 MiB.

Setup, client configuration and limits: [Worker MCP documentation](https://andera.top/docs/base-worker/mcp).

---

## Function timeouts and cancellation

Worker Core passes an `AbortSignal` as `context.signal` to each handler attempt. Pass it to cancellable APIs such as `fetch(url, { signal: context?.signal })`, and check `context?.signal.throwIfAborted()` between steps. Existing functions remain compatible, but must use the signal to cooperate with cancellation.

At a function timeout, the caller receives an error immediately and the signal is aborted. The Worker keeps the slot until the handler settles, including cleanup. Timeout failures are never retried by the function runner; ordinary failures can still use `maxRetries`. Authenticated Worker `/health` lists lingering executions under `executions.timedOutRunning`, with function name, start/deadline timestamps and configured timeout; no inputs or credentials are included.

Direct REST calls return HTTP 504 with `code: "FUNCTION_TIMEOUT"` before any stream headers have been sent; once a stream has started, a timeout or failure simply ends the response, so stream consumers cannot distinguish truncation from completion. MCP calls return a tool error. In webhook mode, a delivery failure after the function succeeded returns HTTP 502 with `code: "WEBHOOK_FAILED"`, so callers can avoid re-running the function. Late handler stream output is discarded. A handler that ignores cancellation can keep its slot indefinitely. Blocking synchronous code cannot be interrupted this way, and completed external side effects are not undone. Handlers must await their child operations for slot accounting to cover them.

## Features

- Native MCP endpoint with one dedicated token, generated tool schemas and hot-reloaded function selection
- REST task execution
- Slot orchestration and management
- Contract validation
- Logging and monitoring
- Runtime for distributed workers

See [Worker Core Documentation](https://andera.top/docs/worker-core/introduction/).

---

## Installation

Worker Core is not meant to be used directly.  
To use it, create a new worker using the [Base Worker template](https://andera.top/docs/base-worker/introduction/).

---

## Usage

See [Base Worker Usage](https://andera.top/docs/base-worker/usage/) to run your business functions through REST or MCP. Application developers normally start from the Base Worker template.

Contributors can test Worker Core directly:

```sh
npm ci
npm test
npm run lint
```

The test suite builds TypeScript and covers the MCP protocol, authentication, live configuration changes, validation, services and actual Worker execution. See [the implementation review](IMPLEMENTATION_REVIEW.md) for validation results and release limitations.

---

## Useful Links

- [Andera Documentation](https://andera.top/docs/)
- [Worker Core Reference](https://andera.top/docs/worker-core/)

---

## Contributing

Andera makes its source available and welcomes community contributions.
See [CONTRIBUTING.md](CONTRIBUTING.md) for repository guidelines, and [How to Contribute](https://andera.top/docs/contribute) for the project's philosophy and license.

---

## License

For license details, see the [LICENCE](LICENCE) file.
