# Ablo agent coordination

Accounted remains the system of record for transactions, pending operations,
and journal entries. This subsystem uses a row-free Ablo model only to decide
which agent conversation may prepare a categorization for a bank transaction.

The public entry point is `index.ts`. Transaction categorization owns target
selection, while `ablo/` owns the SDK schema and client lifecycle.

## Enable it

1. Use Node.js 24 or newer and install dependencies with `npm ci`.
2. Set `ABLO_API_KEY` to a secret key for the target Ablo project. The SDK uses
   Ablo's default base URL.
3. Run `npm run ablo:push` to publish the row-free coordination schema.
4. Set `ABLO_COORDINATION_ENABLED=true` on the Accounted server.

When enabled, the invoke route creates a scoped agent session for the Accounted
conversation. It attempts a non-waiting claim on
`companyId:transactionId` before context capture or model inference. A competing
turn receives HTTP 409. The winner heartbeats the claim through the streamed
turn and releases it on success or failure. If Ablo cannot be reached, the route
fails closed with HTTP 503 instead of running uncoordinated.

The existing Accounted commit path still re-reads the transaction, stages a
pending operation, and applies all bookkeeping invariants. No ledger data is
stored in Ablo.
