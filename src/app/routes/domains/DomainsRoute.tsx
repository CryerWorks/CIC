import { useState } from "react";
import { Panel, Button } from "../../../components/ui";
import { useDomains } from "./useDomains";
import { DomainForm } from "./DomainForm";
import { DeleteDomainDialog } from "./DeleteDomainDialog";
import type { Domain } from "../../../db";

/** The first data-backed screen: list / create / edit / delete user-defined Domains. */
export function DomainsRoute() {
  const { domains, loading, create, edit, remove } = useDomains();
  const [editing, setEditing] = useState<Domain | "new" | null>(null);
  const [deleting, setDeleting] = useState<Domain | null>(null);

  const showEmpty = !loading && domains.length === 0 && editing === null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Domains</h1>
        {editing === null && <Button onClick={() => setEditing("new")}>New domain</Button>}
      </div>

      {editing === "new" && (
        <Panel title="New domain" className="mb-4">
          <DomainForm
            onSubmit={async (input) => {
              const result = await create(input);
              if (result.ok) setEditing(null);
              return result;
            }}
            onCancel={() => setEditing(null)}
          />
        </Panel>
      )}

      {editing !== null && editing !== "new" && (
        <Panel title={`Edit ${editing.name}`} className="mb-4">
          <DomainForm
            initial={editing}
            onSubmit={async (input) => {
              const result = await edit(editing.id, input);
              if (result.ok) setEditing(null);
              return result;
            }}
            onCancel={() => setEditing(null)}
          />
        </Panel>
      )}

      {loading ? (
        <p className="text-text-dim">Loading…</p>
      ) : showEmpty ? (
        <Panel>
          <div className="py-8 text-center">
            <p className="text-text">No domains yet.</p>
            <p className="mt-1 text-sm text-text-dim">
              Create your first subject area to start organizing your learning.
            </p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setEditing("new")}>Create your first domain</Button>
            </div>
          </div>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {domains.map((d) => (
            <li key={d.id}>
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="text-text">{d.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <DeleteDomainDialog
          domain={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await remove(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
