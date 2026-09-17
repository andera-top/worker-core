# Native MCP implementation plan

## Agreed design

One optional `/mcp` endpoint in Worker Core and the Load Balancer, using the official MCP TypeScript 1.x SDK (Node 18.14.1+/CommonJS compatible). No additional service. Clients use one dedicated `MCP_AUTH_KEY`; REST and internal credentials keep their existing roles.

Worker `mcp.json`: optional `functions` allowlist. LB `mcp.json`: `targets` with `group`, positive integer `contract`, `workerAuthKeyEnv`, optional `functions`. Omitted functions means all in the selected scope; `[]` means none. The files are independent. LB targets require a shared Worker key across replicas of a group/contract.

## Implementation and validation

- [x] Strict configuration validation and atomic hot reload, including file creation, replacement and deletion. Preserve the last valid configuration on malformed edits; disable access on deletion. Sanitize configuration errors.
- [x] Stateless Streamable HTTP with bearer auth, origin validation, bounded requests/results, synchronous tools and fresh permission checks on every call.
- [x] Worker adapter using the existing execution engine and slot queue; optional function/parameter descriptions and matching JSON Schema.
- [x] LB adapter using discovery and BullMQ routing; stable unique tool names; server-side Worker credentials; reliable error propagation/credential cleanup; fix workers.json watcher path.
- [x] Authenticated health metadata: enabled state, endpoint path, transport, tools, schemas, availability and sanitized reload errors. Public health remains minimal.
- [x] LB dashboard: token-free MCP summary with endpoint copy, enabled state, tool titles and availability. Detailed targets, schemas and reload errors stay in authenticated health metadata.
- [x] Packaging: lockfiles, examples, environment variables, Docker opt-in configuration mounts, Worker template upgrade path. Disabled by default.
- [x] Website: full MCP setup/client guide, LB/Worker configuration and usage, dashboard documentation, deployment, function descriptions, sidebar and homepage feature. Document token/OAuth client compatibility accurately.
- [x] Tests: SDK-client HTTP calls, auth isolation, filtering, schema validation, hot reload/revocation/deletion/invalid edits, naming collisions, routing and failures; real Worker and LB/Redis integration; TypeScript and dashboard builds; website build/typecheck and browser review.

## Behavior and boundaries

- `MCP_CONFIG_PATH` defaults to the application's root `mcp.json`. Without a valid configuration and a dedicated key, MCP is disabled.
- Bad startup configuration leaves MCP disabled. Invalid edits retain the previous configuration and report a sanitized error. Removing the file disables new access. Environment-secret rotation requires restart.
- Already dispatched jobs can finish. Clients may need to refresh their displayed tool catalog after changes. Calls always enforce the current server-side allowlist.
- Routing comes from the tool registry, not user-supplied routing fields. Credentials never enter tool schemas, discovery metadata, Redis job payloads or dashboard responses.
- MCP settings do not change REST access. A LB uses Workers via REST and does not inspect their independent MCP settings.
- V1 excludes OAuth, legacy SSE, streamed business output, resumable jobs, cancellation guarantees and per-user permissions.
- The dashboard exposes only a token-free operational summary. Detailed MCP metadata remains available in authenticated `/health` using the existing LB administrator credential, separately from the MCP-only credential.

## Delivery

Update the separate worker-core, load-balancer, base-worker and website repositories. Prepare source, tests, builds and local previews. Publishing packages, pushing commits and public deployment are separate release actions.

## Results

- Worker Core: 8 passing tests, including actual-process MCP and REST sync/stream/webhook execution, slot limits, maintenance, health permissions, safe errors and revocation.
- Load Balancer: 9 passing tests, including an actual LB process, Redis, HTTP/WebSocket Worker fixture, credential forwarding, stream lifetime reservation, error propagation, the limited dashboard summary and mixed-version contract compatibility.
- Dependency audits report zero known vulnerabilities in all four repositories. The website uses Docusaurus 3.10.2 on Node 20 with audited transitive overrides; Worker Core, Load Balancer and Base Worker support Node 18.14.1+.
- Dashboard build and browser review cover the token-free endpoint/catalog summary. Website production build, TypeScript check and rendered MCP guide review passed.
- The broader review also fixed malformed-body error handling, configuration validation, discovery serialization/parallelism, stale heartbeat timers, maintenance/service queue resumption, log URL SSRF, stream slot races, logger escape sequences and import-time background timers.
- Client protocol tested with the official MCP SDK. Claude Code/Codex/Cursor settings are documented from official client documentation; those applications were not individually exercised. Hosted OAuth-only clients are outside V1.
- Base Worker builds against the locally packed Worker Core 0.1.6. Prepared versions: Worker Core 0.1.6, Load Balancer 0.1.3, Base Worker 0.1.2. These changes have not been published or deployed.

## Release order and local development

1. Release the LB first when upgrading an existing cluster. Its contract comparison ignores optional descriptions so old and new Worker replicas can coexist. LB-only MCP works with existing Workers via REST.
2. Publish the prepared Worker Core 0.1.6 package before releasing the updated Base Worker template. Its committed dependency is `^0.1.6`; a fresh registry-based install requires that release to exist.
3. After publishing Core, run `npm ci` and `npm run build` in Base Worker, then release the template and any Workers needing direct MCP.
4. Deploy the website after the corresponding releases are available. Activate MCP explicitly with a dedicated token and a local configuration. Smoke-test discovery, one safe tool call, authenticated health and the dashboard in the deployment environment.

For local validation before npm publication, from the sibling repositories:

```sh
cd worker-core
npm run clean
npm pack
cd ../base-worker
npm install --no-save --package-lock=false ../worker-core/andera-top-worker-core-0.1.6.tgz
npm run build
```

The generated tarball is ignored by Git. Publish the exact validated tarball, or regenerate the template lockfile against the registry if the released package differs. Publishing, pushing and deployment remain separate actions.
