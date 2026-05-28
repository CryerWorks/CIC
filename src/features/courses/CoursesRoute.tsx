import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { useCourses, type CourseInput, type CourseEditData } from "./useCourses";
import { CourseForm } from "./CourseForm";

/** The Courses screen. Gates on a connected vault (Courses materialize into the vault), then
 *  delegates to the manager subtree that may call `useVault()`. */
export function CoursesRoute() {
  const vault = useVaultState();

  if (vault.status === "checking") {
    return <p className="text-text-dim">Loading…</p>;
  }
  if (vault.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="info" title="Connect a vault first">
          <span>
            Courses are written as Markdown MOCs into your Obsidian vault.{" "}
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>{" "}
            to start.
          </span>
        </Callout>
      </div>
    );
  }
  return <CoursesManager />;
}

type Editor = { mode: "new" } | { mode: "edit"; courseId: string; data: CourseEditData };

function CoursesManager() {
  const {
    loading,
    domains,
    groups,
    campaignsFor,
    create,
    edit,
    loadCourseForEdit,
    resolveDrift,
    rescan,
    hasPendingReapply,
  } = useCourses();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  const handleSave = async (input: CourseInput) => {
    const result = editor?.mode === "edit" ? await edit(editor.courseId, input) : await create(input);
    if (!result.ok) return { ok: false as const, error: result.error };
    setEditor(null); // a drift conflict (if any) is surfaced by the callout below
    return { ok: true as const };
  };

  const handleRescan = async () => {
    const r = await rescan();
    const parts = [`imported ${r.imported}`, `updated ${r.updated}`];
    if (r.skipped) parts.push(`skipped ${r.skipped}`);
    setRescanMsg(`Rescan complete — ${parts.join(", ")}.`);
  };

  const openEdit = async (courseId: string) => {
    const data = await loadCourseForEdit(courseId);
    if (data) setEditor({ mode: "edit", courseId, data });
  };

  const totalCourses = groups.reduce((n, g) => n + g.courses.length, 0);
  const showEmpty = !loading && totalCourses === 0 && editor === null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Courses</h1>
        {editor === null && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void handleRescan()}>
              Rescan vault
            </Button>
            {domains.length > 0 && (
              <Button onClick={() => setEditor({ mode: "new" })}>New course</Button>
            )}
          </div>
        )}
      </div>

      {rescanMsg && (
        <Callout variant="note" className="mb-4">
          {rescanMsg}
        </Callout>
      )}

      {hasPendingReapply && (
        <Callout variant="warn" title="MOC changed in Obsidian" className="mb-4">
          <div className="flex flex-col gap-2">
            <span>
              The course was saved, but its MOC was edited outside the app since the last save — so
              it wasn&apos;t overwritten. Reload &amp; reapply re-reads the file and re-applies the
              app-managed sections without touching your own edits.
            </span>
            <div>
              <Button
                size="sm"
                onClick={() => {
                  void resolveDrift();
                }}
              >
                Reload &amp; reapply
              </Button>
            </div>
          </div>
        </Callout>
      )}

      {domains.length === 0 ? (
        <Callout variant="info" title="Create a domain first">
          <span>
            A Course belongs to a Domain.{" "}
            <Link to="/domains" className="font-medium text-brand underline">
              Create your first domain
            </Link>{" "}
            to get started.
          </span>
        </Callout>
      ) : (
        <>
          {editor && (
            <Panel title={editor.mode === "edit" ? "Edit course" : "New course"} className="mb-4">
              <CourseForm
                domains={domains}
                campaignsFor={campaignsFor}
                initial={editor.mode === "edit" ? editor.data : undefined}
                onSubmit={handleSave}
                onCancel={() => setEditor(null)}
              />
            </Panel>
          )}

          {loading ? (
            <p className="text-text-dim">Loading…</p>
          ) : showEmpty ? (
            <Panel>
              <div className="py-8 text-center">
                <p className="text-text">No courses yet.</p>
                <p className="mt-1 text-sm text-text-dim">
                  Create a Course and it appears as a MOC in your vault.
                </p>
                <div className="mt-4 flex justify-center">
                  <Button onClick={() => setEditor({ mode: "new" })}>Create your first course</Button>
                </div>
              </div>
            </Panel>
          ) : (
            <div className="flex flex-col gap-5">
              {groups
                .filter((g) => g.courses.length > 0)
                .map((g) => (
                  <section key={g.domain.id} className="flex flex-col gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-text-dim">
                      <span
                        aria-hidden
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: g.domain.color }}
                      />
                      {g.domain.name}
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {g.courses.map((c) => (
                        <li key={c.id}>
                          <Panel>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-text">{c.title}</span>
                              <div className="flex items-center gap-2">
                                {c.moc_path && <Tag tone="neutral">MOC</Tag>}
                                <Button size="sm" variant="secondary" onClick={() => void openEdit(c.id)}>
                                  Edit
                                </Button>
                              </div>
                            </div>
                          </Panel>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
