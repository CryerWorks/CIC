import { Section } from "./Section";

const radii = [
  { cls: "rounded-sm", label: "sm · 5px" },
  { cls: "rounded-md", label: "md · 8px" },
  { cls: "rounded-full", label: "full · pill" },
];

export function ScaleSection() {
  return (
    <Section title="Radius & spacing" note="8px soft-radius family; Tailwind's default 4px-step spacing.">
      <div className="flex flex-wrap gap-6">
        {radii.map((r) => (
          <div key={r.cls} className="flex flex-col items-center gap-2">
            <div className={`size-14 border border-line-bright bg-panel ${r.cls}`} />
            <span className="font-mono text-2xs text-text-dim">{r.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-end gap-3">
        {[1, 2, 3, 4, 6, 8].map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            <div className="h-6 rounded-sm bg-brand-soft" style={{ width: `${n * 4}px` }} />
            <span className="font-mono text-2xs text-text-dim">{n}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
