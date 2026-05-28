import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { useCourses, type CourseInput } from "./useCourses";
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

function CoursesManager() {
  const { loading, domains, groups, campaignsFor, create } = useCourses();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleCreate = async (input: CourseInput) => {
    const result = await create(input);
    if (!result.ok) return { ok: false as const, error: result.error };
    setCreating(false);
    setNotice(
      result.materialize.status === "conflict"
        ? `Saved, but the MOC file at ${result.materialize.mocPath} couldn't be written (${result.materialize.reason}). A file may already exist there — resolve it in your vault.`
        : null,
    );
    return { ok: true as const };
  };

  const totalCourses = groups.reduce((n, g) => n + g.courses.length, 0);
  const showEmpty = !loading && totalCourses === 0 && !creating;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">Courses</h1>
        {!creating && domains.length > 0 && (
          <Button onClick={() => setCreating(true)}>New course</Button>
        )}
      </div>

      {notice && (
        <Callout variant="warn" title="MOC not written" className="mb-4">
          {notice}
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
          {creating && (
            <Panel title="New course" className="mb-4">
              <CourseForm
                domains={domains}
                campaignsFor={campaignsFor}
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
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
                  <Button onClick={() => setCreating(true)}>Create your first course</Button>
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
                              {c.moc_path && <Tag tone="neutral">MOC</Tag>}
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
