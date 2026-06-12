import { useState, useCallback, useEffect, type FormEvent } from "react";
import { Panel, Button, Callout, Tag } from "../../components/ui";
import { useVaultState, useVault } from "../../app/providers/VaultProvider";
import { useRAG } from "../../ai/rag/hooks/useRAG";
import { SearchFilters } from "./SearchFilters";
import { SearchResults } from "./SearchResults";
import type { ChunkSourceKind, SearchResult } from "../../ai/rag/types";

interface IndexedNote {
  notePath: string;
  title: string;
  chunkCount: number;
  lastIndexedAt: string;
}

export function SearchCorpusRoute() {
  const vault = useVaultState();
  if (vault.status === "checking") return <p className="text-text-dim">Loading…</p>;
  if (vault.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="info" title="Connect a vault first">
          Connect a vault to search your knowledge corpus.
        </Callout>
      </div>
    );
  }
  return <SearchCorpusView />;
}

function SearchCorpusView() {
  const { search, fetchIndexedNotes, indexVaultNote, unindexVaultNote, checkNoteIndexed, inProgress } = useRAG();
  const vault = useVault();
  const [query, setQuery] = useState("");
  const [sourceKind, setSourceKind] = useState<ChunkSourceKind | "all">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Note indexing state
  const [indexedNotes, setIndexedNotes] = useState<IndexedNote[]>([]);
  const [vaultNotes, setVaultNotes] = useState<string[]>([]);
  const [indexedSet, setIndexedSet] = useState<Set<string>>(new Set());
  const [indexingNote, setIndexingNote] = useState<string | null>(null);

  const refreshIndexedNotes = useCallback(async () => {
    try {
      const notes = await fetchIndexedNotes();
      setIndexedNotes(notes);
      setIndexedSet(new Set(notes.map((n) => n.notePath)));
    } catch {
      // Ignore — vault may not be ready
    }
  }, [fetchIndexedNotes]);

  const refreshVaultNotes = useCallback(async () => {
    try {
      const listed = await vault.reader.list();
      setVaultNotes(listed);
      for (const notePath of listed) {
        const indexed = await checkNoteIndexed(notePath);
        setIndexedSet((prev) => {
          const next = new Set(prev);
          if (indexed) {
            next.add(notePath);
          } else {
            next.delete(notePath);
          }
          return next;
        });
      }
    } catch {
      // Ignore
    }
  }, [vault.reader, checkNoteIndexed]);

  useEffect(() => {
    refreshIndexedNotes();
    refreshVaultNotes();
  }, [refreshIndexedNotes, refreshVaultNotes]);

  const handleIndexNote = useCallback(
    async (notePath: string) => {
      setIndexingNote(notePath);
      try {
        const { data, body } = await vault.reader.readNote(notePath);
        const title = (data?.title as string) || notePath.replace(/\.md$/, "").split("/").pop() || notePath;
        await indexVaultNote(notePath, title, `${data ? `---\n${JSON.stringify(data)}\n---\n` : ""}${body}`);
        await refreshIndexedNotes();
        setIndexedSet((prev) => new Set(prev).add(notePath));
      } catch (err) {
        console.error("Failed to index note:", err);
      } finally {
        setIndexingNote(null);
      }
    },
    [vault.reader, indexVaultNote, refreshIndexedNotes],
  );

  const handleUnindexNote = useCallback(
    async (notePath: string) => {
      try {
        await unindexVaultNote(notePath);
        await refreshIndexedNotes();
        setIndexedSet((prev) => {
          const next = new Set(prev);
          next.delete(notePath);
          return next;
        });
      } catch (err) {
        console.error("Failed to unindex note:", err);
      }
    },
    [unindexVaultNote, refreshIndexedNotes],
  );

  const handleSearch = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const res = await search(
          trimmed,
          20,
          sourceKind === "all" ? undefined : { sourceKind },
        );
        setResults(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [query, sourceKind, search],
  );

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <Panel title="Search Corpus">
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your knowledge corpus…"
              className="flex-1 rounded-sm border border-line bg-surface-sunken px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-brand"
              aria-label="Search query"
            />
            <Button type="submit" disabled={loading || !query.trim()}>
              Search
            </Button>
          </div>
          <SearchFilters
            sourceKind={sourceKind}
            onSourceKindChange={setSourceKind}
            disabled={loading}
          />
        </form>
      </Panel>

      {error && <Callout variant="danger" title="Search error">{error}</Callout>}

      {searched && !loading && !error && (
        <SearchResults results={results} loading={loading} />
      )}

      {/* Note Indexing */}
      <Panel title="Indexed Notes">
        {indexedNotes.length === 0 ? (
          <p className="text-sm text-text-dim">No notes indexed yet. Index a vault note below to add it to the search corpus.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {indexedNotes.map((note) => (
              <li key={note.notePath} className="flex items-center justify-between rounded-sm bg-surface-sunken px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">{note.title}</span>
                  <span className="text-xs text-text-dim">{note.notePath} · {note.chunkCount} chunk{note.chunkCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag tone="neutral">Note</Tag>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!!inProgress}
                    onClick={() => handleUnindexNote(note.notePath)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <hr className="border-line my-4" />

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Vault Notes</h3>
          <p className="text-xs text-text-dim">Click &ldquo;Index&rdquo; to add a note to the search corpus.</p>
          {vaultNotes.length === 0 ? (
            <p className="text-xs text-text-dim">No Markdown notes found in the vault.</p>
          ) : (
            <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {vaultNotes.map((notePath) => (
                <li key={notePath} className="flex items-center justify-between rounded-sm px-2 py-1 hover:bg-surface-sunken/50">
                  <span className="text-sm text-text">{notePath}</span>
                  {indexedSet.has(notePath) ? (
                    <Tag tone="success">Indexed</Tag>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={indexingNote === notePath || !!inProgress}
                      onClick={() => handleIndexNote(notePath)}
                    >
                      {indexingNote === notePath ? "Indexing…" : "Index"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
