# Ablo agent coordination

Accounted remains the system of record for transactions, pending operations,
and journal entries. This subsystem uses a row-free Ablo model to decide which
agent operation may work on an Accounted conversation or resource at one time.

The public entry point is `index.ts`. `agent-turn.ts` owns in-app conversation
and context targets. `tool-call.ts` owns MCP write targets and dispatch.
`work.ts` owns admission and release policy, while `ablo/` owns the SDK schema
and client lifecycle.

## Enable it

1. Use Node.js 24 or newer and install dependencies with `npm ci`.
2. Set `ABLO_API_KEY` to a secret key for the target Ablo project. The SDK uses
   Ablo's default base URL.
3. Run `npm run ablo:push` to publish the row-free coordination schema.
4. Set `ABLO_COORDINATION_ENABLED=true` on the Accounted server.

When enabled, the invoke and ask routes claim their conversation plus any
explicit context resource before context capture or model inference. The
categorize route claims its transaction. Every MCP tool declared as a write is
dispatched through the same coordination boundary; read-only tools and explicit
dry runs do not claim. Semantic identifiers make different operations on one
resource contend. Bulk writes claim each recognized resource. When no semantic
identifier exists, the dispatcher uses a stable hash of the exact tool call, so
raw arguments are not sent to Ablo.

Claims are non-waiting. A competing request receives a structured contention
error, and the winner heartbeats its claims until success or failure. If Ablo
cannot be reached, enabled writes and agent turns fail closed instead of running
uncoordinated. Accounted does not expose a base URL setting; both session and
data clients use the Ablo SDK default service URL.

The existing Accounted commit path still re-reads the transaction, stages a
pending operation, and applies all bookkeeping invariants. No ledger data is
stored in Ablo.
