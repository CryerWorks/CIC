import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useDb } from "../../providers/DbProvider";
import { useActiveVaultId } from "../../providers/VaultProvider";
import {
  createDomain,
  listDomains,
  updateDomain,
  deleteDomain,
  type Domain,
} from "../../../db";
import { PALETTE_HEXES } from "./palette";

/**
 * Domains list state + optimistic mutations (research R4). Validation runs BEFORE the optimistic
 * apply, so the only failures to reconcile are genuine persistence errors — on which we revert to
 * the pre-mutation snapshot and surface the message. Mutations return a result rather than
 * throwing, so screens can show inline errors.
 */
export interface DomainInput {
  name: string;
  color: string;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(60, "Name is too long (60 characters max)");
const colorSchema = z.enum(PALETTE_HEXES as [string, ...string[]]);

function validate(input: DomainInput, existing: Domain[], excludeId?: string): string | null {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return name.error.issues[0].message;
  if (!colorSchema.safeParse(input.color).success) return "Choose a color from the palette";
  const clash = existing.some(
    (d) => d.id !== excludeId && d.name.toLowerCase() === name.data.toLowerCase(),
  );
  if (clash) return "A domain with that name already exists";
  return null;
}

const msgOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function useDomains() {
  const db = useDb();
  // The Domains screen is vault-gated (FR-006), so the id is non-null at runtime; keyed on it so a
  // vault switch re-scopes the list (FR-007).
  const vaultId = useActiveVaultId();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!vaultId) return;
    setDomains(await listDomains(db, vaultId));
  }, [db, vaultId]);

  useEffect(() => {
    if (!vaultId) return;
    let active = true;
    listDomains(db, vaultId)
      .then((rows) => active && setDomains(rows))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [db, vaultId]);

  const create = useCallback(
    async (input: DomainInput): Promise<MutationResult> => {
      if (!vaultId) return { ok: false, error: "Connect a vault first" };
      const name = input.name.trim();
      const invalid = validate({ name, color: input.color }, domains);
      if (invalid) return { ok: false, error: invalid };

      const snapshot = domains;
      const optimistic: Domain = {
        id: `optimistic-${crypto.randomUUID()}`,
        name,
        color: input.color,
        vault_id: vaultId,
      };
      setDomains([...snapshot, optimistic]);
      try {
        const saved = await createDomain(db, vaultId, { name, color: input.color });
        setDomains((cur) => cur.map((d) => (d.id === optimistic.id ? saved : d)));
        return { ok: true };
      } catch (e) {
        setDomains(snapshot); // reconcile: drop the phantom row
        return { ok: false, error: msgOf(e, "Failed to save the domain") };
      }
    },
    [db, vaultId, domains],
  );

  const edit = useCallback(
    async (id: string, input: DomainInput): Promise<MutationResult> => {
      const name = input.name.trim();
      const invalid = validate({ name, color: input.color }, domains, id);
      if (invalid) return { ok: false, error: invalid };

      const snapshot = domains;
      setDomains(snapshot.map((d) => (d.id === id ? { ...d, name, color: input.color } : d)));
      try {
        const saved = await updateDomain(db, id, { name, color: input.color });
        setDomains((cur) => cur.map((d) => (d.id === id ? saved : d)));
        return { ok: true };
      } catch (e) {
        setDomains(snapshot); // reconcile: restore prior values
        return { ok: false, error: msgOf(e, "Failed to update the domain") };
      }
    },
    [db, domains],
  );

  const remove = useCallback(
    async (id: string): Promise<MutationResult> => {
      const snapshot = domains;
      setDomains(snapshot.filter((d) => d.id !== id));
      try {
        await deleteDomain(db, id);
        return { ok: true };
      } catch (e) {
        setDomains(snapshot); // reconcile: row reappears
        return { ok: false, error: msgOf(e, "Failed to delete the domain") };
      }
    },
    [db, domains],
  );

  return { domains, loading, create, edit, remove, refresh };
}
