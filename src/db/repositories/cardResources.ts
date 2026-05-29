import type { SqlExecutor } from "../executor";
import { ResourceSchema, type Resource } from "../models/resource";
import { upsert } from "./query";

/** A card's citation to a Resource: the Resource plus the optional locator for that citation. */
export interface CardCitation {
  resource: Resource;
  locator: string | null;
}

/**
 * Card ↔ Resource citations (Feature 010, F3.7). The `card_resources` M:N link with an optional
 * locator (page / timestamp / anchor). Cascades from either side, so deleting a card or a Resource
 * drops the citation without orphaning the other.
 */
export async function addCardResource(
  db: SqlExecutor,
  input: { cardId: string; resourceId: string; locator?: string | null },
): Promise<void> {
  await upsert(
    db,
    "card_resources",
    { card_id: input.cardId, resource_id: input.resourceId, locator: input.locator ?? null },
    ["card_id", "resource_id"],
  );
}

export async function removeCardResource(
  db: SqlExecutor,
  cardId: string,
  resourceId: string,
): Promise<void> {
  await db.execute("DELETE FROM card_resources WHERE card_id = ? AND resource_id = ?", [
    cardId,
    resourceId,
  ]);
}

export async function listCardResources(db: SqlExecutor, cardId: string): Promise<CardCitation[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT r.*, cr.locator AS _locator
     FROM card_resources cr
     JOIN resources r ON r.id = cr.resource_id
     WHERE cr.card_id = ?
     ORDER BY r.title`,
    [cardId],
  );
  return rows.map((row) => {
    const { _locator, ...resource } = row;
    return { resource: ResourceSchema.parse(resource), locator: (_locator as string | null) ?? null };
  });
}
