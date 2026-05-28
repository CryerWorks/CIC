import type { ReactNode } from "react";

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-text">{title}</h2>
        {note && <p className="mt-1 text-sm text-text-dim">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <div className="mb-3 text-2xs font-semibold uppercase tracking-wider text-brand">{label}</div>
      {children}
    </div>
  );
}
