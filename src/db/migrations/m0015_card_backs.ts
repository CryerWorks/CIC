import type { Migration } from "../migrate";

export const m0015CardBacks: Migration = {
  version: 15,
  name: "card_backs",
  sql: `
-- Backfill existing cards with empty or whitespace-only backs
UPDATE cards SET back = '[back not yet provided]' WHERE back IS NULL OR trim(back) = '';
`.trim(),
};
