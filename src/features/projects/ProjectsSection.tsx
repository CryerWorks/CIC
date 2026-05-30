import { useState } from "react";
import { Panel, Button, Tag, Callout } from "../../components/ui";
import { useProjects, type ProjectEditData } from "./useProjects";
import { ProjectForm } from "./ProjectForm";
import { CloseProjectDialog } from "./CloseProjectDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import type { Project } from "../../db";

// UI label only — the DB/vault enum stays `open`/`in-progress`/`complete`/`abandoned`. "new" reads
// as a state rather than the imperative "open!", which a Tag chip next to real buttons can suggest.
const STATUS_LABEL: Record<Project["status"], string> = {
  open: "new",
  "in-progress": "in progress",
  complete: "complete",
  abandoned: "set aside",
};

/**
 * The Course's Projects (Feature 015, PRD F11) — applied practice. Author a Project (it materializes
 * as a vault note), advance it (a session planned against it, or "Start"), and close it with a
 * reflection that can spawn cards. Optional per Course: zero Projects is a perfectly valid, calm
 * empty state (no nudge, no fabricated data — Constitution III). Mounted inside CourseDetailRoute.
 */
export function ProjectsSection({ courseId }: { courseId: string }) {
  const {
    loading,
    projects,
    milestones,
    resources,
    create,
    loadProjectForEdit,
    edit,
    markInProgress,
    close,
    remove,
    resolveDrift,
    hasPendingReapply,
  } = useProjects(courseId);

  const [editor, setEditor] = useState<{ mode: "new" } | { mode: "edit"; id: string; data: ProjectEditData } | null>(null);
  const [closing, setClosing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  if (loading) return null;

  const openEditor = async (project: Project) => {
    const data = await loadProjectForEdit(project.id);
    if (data) setEditor({ mode: "edit", id: project.id, data });
  };

  const active = (p: Project) => p.status === "open" || p.status === "in-progress";

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-dim">Projects ({projects.length})</h2>
        {editor === null && <Button onClick={() => setEditor({ mode: "new" })}>New project</Button>}
      </div>

      {hasPendingReapply && (
        <Callout variant="warn" title="Project note changed in Obsidian" className="mb-4">
          <span>
            The note drifted from what CIC last wrote.{" "}
            <button className="font-medium text-brand underline" onClick={() => void resolveDrift()}>
              Reload &amp; reapply
            </button>
          </span>
        </Callout>
      )}

      {editor && (
        <Panel title={editor.mode === "edit" ? "Edit project" : "New project"} className="mb-4">
          <ProjectForm
            milestones={milestones}
            resources={resources}
            initial={editor.mode === "edit" ? editor.data : undefined}
            submitLabel={editor.mode === "edit" ? "Save project" : "Create project"}
            onSubmit={async (input) => {
              const result = editor.mode === "edit" ? await edit(editor.id, input) : await create(input);
              if (result.ok) setEditor(null);
              return result;
            }}
            onCancel={() => setEditor(null)}
          />
        </Panel>
      )}

      {projects.length === 0 && editor === null ? (
        <Panel>
          <div className="py-6 text-center">
            <p className="text-text">No projects yet.</p>
            <p className="mt-1 text-sm text-text-dim">
              Projects are optional — applied practice for when you want to put a milestone to work.
            </p>
          </div>
        </Panel>
      ) : (
        projects.length > 0 && (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Panel>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-text">{p.title}</p>
                      <p className="truncate text-sm text-text-dim">{p.capability}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Tag tone="neutral">{STATUS_LABEL[p.status]}</Tag>
                      {active(p) ? (
                        <>
                          {p.status === "open" && (
                            <Button size="sm" variant="secondary" onClick={() => void markInProgress(p.id)}>
                              Start
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => void openEditor(p)}>
                            Edit
                          </Button>
                          <Button size="sm" onClick={() => setClosing(p)}>
                            Close…
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )
      )}

      {closing && (
        <CloseProjectDialog
          title={closing.title}
          resources={resources}
          onCancel={() => setClosing(null)}
          onConfirm={async (input) => {
            await close(closing.id, input);
            setClosing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteProjectDialog
          title={deleting.title}
          projectPath={deleting.project_path}
          onCancel={() => setDeleting(null)}
          onConfirm={async (mode, opts) => {
            const result = await remove(deleting.id, mode, opts);
            if (result.status === "removed") setDeleting(null);
            return result;
          }}
        />
      )}
    </div>
  );
}
