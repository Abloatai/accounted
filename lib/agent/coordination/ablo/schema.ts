import { defineSchema, model } from '@abloatai/ablo/schema'

// This is a row-free coordination namespace. Accounted's Supabase rows remain
// authoritative and are never copied to or mutated through Ablo.
export const schema = defineSchema({
  transactionCategorizations: model({}),
})
