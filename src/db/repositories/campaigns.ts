import type { SqlExecutor } from "../executor";
import { CampaignSchema, type Campaign } from "../models/campaign";
import { insert, selectParsed } from "./query";

/** Create a Campaign (id generated app-side). Returns the parsed, validated row. */
export async function createCampaign(
  db: SqlExecutor,
  input: { title: string; domainId: string },
): Promise<Campaign> {
  const row: Campaign = { id: crypto.randomUUID(), title: input.title, domain_id: input.domainId };
  await insert(db, "campaigns", row);
  return CampaignSchema.parse(row);
}

export async function getCampaign(db: SqlExecutor, id: string): Promise<Campaign | null> {
  const rows = await selectParsed(db, CampaignSchema, "SELECT * FROM campaigns WHERE id = ?", [id]);
  return rows[0] ?? null;
}

/** Campaigns within a Domain (the authoring form's campaign picker). Ordered by title. */
export async function listCampaignsByDomain(db: SqlExecutor, domainId: string): Promise<Campaign[]> {
  return selectParsed(
    db,
    CampaignSchema,
    "SELECT * FROM campaigns WHERE domain_id = ? ORDER BY title",
    [domainId],
  );
}
