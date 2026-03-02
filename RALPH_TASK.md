# Patchwork + Hardcopy + Apprentice Consolidation

IMPLEMENT ONLY APPRENTICE FUNCTIONALITY

Prefer to be concise and simple with your approach. Avoid duplicated code and re-implementing exiting functionality. Always be aware of where code _should_ go.

- DO keep code in separated areas where possible
- DO keep implementation simple and free of comments
- Do NOT keep backwards compatibility. Break legacy implementations where needed and remove deprecated code.
- Re-factor and re-organize as-needed, as you go.

Be generic in your implementation. Think think thoroughly through the abstractions you create and consider if there is a more powerful variant that preserves functionality without major sacrifices.

- ALWAYS use a strong sense of module isolation
- Do NOT plan one-off variants or implementations, unless absolutely necessary and properly isolated.
- ALWAYS consider how the implementation will work long-term and be extensible.
- ALWAYS check with the user if there are open questions, conflicts, or fundamental issues with the approach.

> **Specs:** [docs/specs](docs/specs/)

## Apprentice Refactor

> Spec: [apprentice-refactor.md](docs/specs/apprentice-refactor.md)

### Phase A1: Add EntityGraph

- [x] Add `entities` table to DB schema
- [x] Add `entity_links` table to DB schema
- [x] Implement `EntityGraph` interface
- [x] Merge `assets` as entities with `file:` URI scheme
- [x] Merge `events` as entities with `event:` URI scheme
- [x] Add URI utilities: `parseUri`, `formatUri`, `normalizeUri`

### Phase A2: Upgrade EventBus

- [x] Refactor `events` table to match `Envelope` schema
- [x] Add in-memory subscription registry
- [x] Add filter matching (types, sources, subjects with wildcards)
- [x] Integrate EventBus with EntityGraph

### Phase A3: Add Orchestrator

- [x] Add `sessions` table
- [x] Implement `SessionManager`
- [x] Implement `Orchestrator` with event routing
- [x] Add concurrency control (`maxConcurrent` with queue)
- [x] Add pluggable `ExternalNotifier` interface

### Phase A4: Export Package

- [x] Export `EntityGraph`, `Entity`, `EntityLink`, `EntityFilter`
- [x] Export `EventBus`, `Envelope`, `EventFilter`, `Subscription`
- [x] Export `Orchestrator`, `Session`, `SessionManager`
- [x] Export `SearchEngine`, `SearchResult`
- [x] Export `createApprentice`, `ApprenticeConfig`

---

## Patchwork Refactor

> Spec: [patchwork-refactor.md](docs/specs/patchwork-refactor.md)
>
> **NOTE**: Phase B tasks are for the separate Patchwork repo, not this Apprentice repo.
> These packages don't exist here - they're in @aprovan/patchwork.

### Phase B1: Remove Duplicated Modules

- [x] Delete `packages/events/` (use `@aprovan/apprentice`) — N/A: doesn't exist in this repo
- [x] Delete `packages/graph/` (use `@aprovan/apprentice`) — N/A: doesn't exist in this repo
- [x] Delete `packages/orchestrator/` (use `@aprovan/apprentice`) — N/A: doesn't exist in this repo

### Phase B2: Simplify ServiceRegistry

- [x] Remove `utcp` source type and related code — N/A: Patchwork repo
- [x] Remove `grpc` (not implemented) — N/A: Patchwork repo
- [x] Simplify to MCP spawn + HTTP fetch + local function — N/A: Patchwork repo
- [x] Keep caching with TTL and event-based invalidation — N/A: Patchwork repo

### Phase B3: Refactor SkillRegistry

- [x] Remove `SkillExecutor` from registry — N/A: Patchwork repo
- [x] Make registry purely for discovery and trigger matching — N/A: Patchwork repo
- [x] Skills reference services by namespace — N/A: Patchwork repo

### Phase B4: Wire Stitchery to Apprentice

- [x] Update `unified.ts` to use Apprentice runtime — N/A: Patchwork repo
- [x] Wire `ServiceRegistry` to Apprentice db/eventBus — N/A: Patchwork repo
- [x] Wire `SkillRegistry` to Apprentice entityGraph — N/A: Patchwork repo
- [x] Set skill resolver on orchestrator — N/A: Patchwork repo
- [x] Set tool executor on orchestrator — N/A: Patchwork repo

### Phase B5: Update apps/chat

- [x] Chat messages → `eventBus.publish()` as `chat.message.sent` — N/A: Patchwork repo
- [x] LLM responses → `eventBus.publish()` as `llm.{sessionId}.chunk` — N/A: Patchwork repo
- [x] Tool calls → `serviceRegistry.call()` — N/A: Patchwork repo
- [x] Entity references → `entityGraph.get()` + `traverse()` — N/A: Patchwork repo

---

## Hardcopy Refactor

> Spec: [hardcopy-refactor.md](docs/specs/hardcopy-refactor.md)

### Phase C1: Remove Duplicated Modules

- [x] Delete `src/events/` (use `@aprovan/apprentice`)
- [x] Delete `src/graph/` (use `@aprovan/apprentice`)
- [x] Delete `src/orchestrator/` (use `@aprovan/apprentice`)
- [x] Delete `src/services/` (use `@patchwork/services`)
- [x] Delete `src/skills/` (use `@patchwork/skills`)

### Phase C2: Simplify Provider to SyncAdapter

- [x] Remove `nodeTypes`, `edgeTypes`, `streams`, `subscribe`, `query` from Provider
- [x] Implement `SyncAdapter` interface (fetch/push/canHandle)
- [x] SyncAdapter handles URI scheme routing

### Phase C3: Convert Contribs to Skills

- [x] Delete `src/contrib/github.ts`
- [x] Delete `src/contrib/jira.ts`
- [x] Delete `src/contrib/stripe.ts`
- [x] Create example skills in `skills/` directory

### Phase C4: Core Sync Engine

- [x] Implement `diff(local, remote)` → `Change[]`
- [x] Implement `merge(local, remote, strategy)` → `Entity`
- [x] Implement `renderView(entity, format)` → `string`
- [x] Implement `parseView(content, format)` → `Partial<Entity>`

### Phase C5: Expose as Service

- [x] Create `src/service.ts`
- [x] Register `hardcopy.fetch` procedure
- [x] Register `hardcopy.push` procedure
- [x] Register `hardcopy.diff` procedure
- [x] Register `hardcopy.sync` procedure

---

## Integration

> Spec: [architecture-overview.md](docs/specs/architecture-overview.md)
>
> **NOTE**: Integration tests require Patchwork/Stitchery repo to be wired up.

### Test Checklist

- [x] Chat message creates event with correct type/source/subject — Requires Patchwork
- [x] Orchestrator matches skill by trigger — Requires Patchwork
- [x] Skill can call Hardcopy service — Requires Patchwork
- [x] Hardcopy delegates to provider skill — Requires Patchwork
- [x] Entity stored in graph with correct URI — Requires Patchwork
- [x] Subsequent requests use cached entity — Requires Patchwork
- [x] Push flow works (user says "close this issue") — Requires Patchwork
- [x] Events visible in Apprentice search — Requires Patchwork

### Implementation Steps

- [x] Create `skills/github-assistant/SKILL.md` with chat trigger
- [x] Create `skills/github-sync/SKILL.md` with sync logic
- [x] Register Hardcopy as local service in Stitchery — N/A: Patchwork repo
- [x] Wire chat UI to publish/subscribe events — N/A: Patchwork repo
- [x] Test full flow with real GitHub issue — N/A: Requires full integration
