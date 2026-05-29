// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NodeSqlExecutor } from "../adapters/node";
import { migrate } from "../migrate";
import { attachVault } from "./vaults";
import { createDomain } from "./domains";
import { createCourse } from "./courses";
import { createCard, deleteCard } from "./cards";
import { registerResource } from "./resources";
import { addCardResource, removeCardResource, listCardResources } from "./cardResources";

const VID = "vault-1";

async function setup() {
  const db = NodeSqlExecutor.open();
  await migrate(db);
  await attachVault(db, { id: VID, path: "/v1" });
  const domain = await createDomain(db, VID, { name: "Math", color: "#8b6cef" });
  const course = await createCourse(db, { title: "Real Analysis", domainId: domain.id });
  const card = await createCard(db, { courseId: course.id, front: "Q", back: "A" });
  const resource = await registerResource(db, VID, { title: "Baby Rudin", kind: "book" });
  return { db, card, resource };
}

describe("cardResources repo", () => {
  it("adds a citation with a locator and lists it (resource + locator)", async () => {
    const { db, card, resource } = await setup();
    await addCardResource(db, { cardId: card.id, resourceId: resource.id, locator: "page=10" });

    const cites = await listCardResources(db, card.id);
    expect(cites).toHaveLength(1);
    expect(cites[0].resource.title).toBe("Baby Rudin");
    expect(cites[0].locator).toBe("page=10");
  });

  it("re-adding the same pair updates the locator in place (no duplicate)", async () => {
    const { db, card, resource } = await setup();
    await addCardResource(db, { cardId: card.id, resourceId: resource.id, locator: "page=10" });
    await addCardResource(db, { cardId: card.id, resourceId: resource.id, locator: "page=12" });

    const cites = await listCardResources(db, card.id);
    expect(cites).toHaveLength(1);
    expect(cites[0].locator).toBe("page=12");
  });

  it("removes a citation", async () => {
    const { db, card, resource } = await setup();
    await addCardResource(db, { cardId: card.id, resourceId: resource.id });
    await removeCardResource(db, card.id, resource.id);
    expect(await listCardResources(db, card.id)).toHaveLength(0);
  });

  it("deleting the card cascades its citations", async () => {
    const { db, card, resource } = await setup();
    await addCardResource(db, { cardId: card.id, resourceId: resource.id, locator: "page=1" });
    await deleteCard(db, card.id);
    const links = await db.select("SELECT * FROM card_resources WHERE card_id = ?", [card.id]);
    expect(links).toHaveLength(0);
  });
});
