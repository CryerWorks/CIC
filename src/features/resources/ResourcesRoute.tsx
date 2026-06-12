import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { useResources, type ResourceInput } from "./useResources";
import { ResourceForm } from "./ResourceForm";
import { useRAG } from "../../ai/rag/hooks/useRAG";
import type { Resource } from "../../db";

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  epub: "EPUB",
  markdown: "Markdown",
  video_file: "Video file",
  video_url: "Video URL",
  web_page: "Web page",
  book: "Book",
  audio: "Audio",
};

/** The Resource registry (Feature 010, US4). Vault-gated; registers the sources cards cite. */
export function ResourcesRoute() {
  const vault = useVaultState();
  if (vault.status === "checking") return <p className="text-text-dim">Loading…</p>;
  if (vault.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="info" title="Connect a vault first">
          <span>
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>{" "}
            to manage resources.
          </span>
        </Callout>
      </div>
    );
  }
  return <ResourcesManager />;
}

type Editor = { mode: "new" } | { mode: "edit"; resource: Resource };

function toInput(r: Resource): ResourceInput {
  return {
    title: r.title,
    kind: r.kind,
    filePath: r.file_path,
    url: r.url,
    metadata: r.metadata as ResourceInput["metadata"],
    domainId: r.domain_id,
  };
}

function ResourcesManager() {
  const { loading, resources, courses, domains, links, add, edit, remove, reload } = useResources();
  const { ingestMarkdownResource, ingestEpubResource, unindexResource } = useRAG();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [filterDomainId, setFilterDomainId] = useState("");
  const [ingesting, setIngesting] = useState<string | null>(null);

  const submit = async (input: ResourceInput) => {
    if (editor?.mode === "edit") await edit(editor.resource.id, input);
    else await add(input);
    setEditor(null);
  };

  const visible = filterDomainId ? resources.filter((r) => r.domain_id === filterDomainId) : resources;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text">Resources</h1>
        <div className="flex items-center gap-2">
          {domains.length > 0 && (
            <select
              aria-label="Filter by domain"
              value={filterDomainId}
              onChange={(e) => setFilterDomainId(e.target.value)}
              className="rounded-sm border border-line bg-surface-sunken px-2 py-1 text-sm text-text"
            >
              <option value="">All domains</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {editor === null && <Button onClick={() => setEditor({ mode: "new" })}>Register resource</Button>}
        </div>
      </div>

      {editor && (
        <Panel title={editor.mode === "edit" ? "Edit resource" : "Register resource"} className="mb-4">
          <ResourceForm
            initial={editor.mode === "edit" ? toInput(editor.resource) : undefined}
            courses={courses}
            domains={domains}
            linkedCourseIds={editor.mode === "edit" ? (links.get(editor.resource.id) ?? []) : []}
            submitLabel={editor.mode === "edit" ? "Save resource" : "Register"}
            onSubmit={submit}
            onCancel={() => setEditor(null)}
          />
        </Panel>
      )}

      {loading ? (
        <p className="text-text-dim">Loading…</p>
      ) : resources.length === 0 && editor === null ? (
        <Panel>
          <div className="py-8 text-center">
            <p className="text-text">No resources yet.</p>
            <p className="mt-1 text-sm text-text-dim">
              Register the books, PDFs, and videos you study so cards can cite them.
            </p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setEditor({ mode: "new" })}>Register your first resource</Button>
            </div>
          </div>
        </Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-text-dim">No resources in this domain.</p>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((r) => (
            <li key={r.id}>
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-text">{r.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Tag tone="neutral">{KIND_LABEL[r.kind] ?? r.kind}</Tag>
                    {r.ingested_at && <Tag tone="brand">Ingested</Tag>}
                    {(r.kind === "markdown" || r.kind === "epub") && r.file_path && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={ingesting === r.id}
                        onClick={() => {
                          setIngesting(r.id);
                          const ingestFn = r.kind === "epub" ? ingestEpubResource : ingestMarkdownResource;
                          ingestFn(r.id)
                            .then(() => reload())
                            .finally(() => setIngesting(null));
                        }}
                      >
                        {ingesting === r.id ? "Ingesting…" : r.ingested_at ? "Re-ingest" : "Ingest"}
                      </Button>
                    )}
                    {r.ingested_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void unindexResource(r.id).then(() => reload());
                        }}
                      >
                        Remove index
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: "edit", resource: r })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
