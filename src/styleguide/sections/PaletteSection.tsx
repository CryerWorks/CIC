import { Section } from "./Section";

interface Swatch {
  name: string;
  note?: string;
}
interface Group {
  title: string;
  subtitle?: string;
  items: Swatch[];
}

const groups: Group[] = [
  { title: "Surfaces", items: [{ name: "surface" }, { name: "surface-sunken" }, { name: "panel" }, { name: "panel-header" }, { name: "panel-raised" }] },
  { title: "Lines", items: [{ name: "line" }, { name: "line-bright" }] },
  { title: "Brand", subtitle: "purple — links · active · primary", items: [{ name: "brand" }, { name: "brand-dim" }, { name: "brand-soft" }] },
  { title: "AI", subtitle: "cyan — AI OUTPUT ONLY · never used for brand/interactive", items: [{ name: "ai" }] },
  { title: "Semantic", items: [{ name: "success" }, { name: "warn" }, { name: "danger" }, { name: "info" }] },
  { title: "Text", items: [{ name: "text" }, { name: "text-dim" }, { name: "text-faint", note: "large/decorative only" }, { name: "text-faint-aa" }] },
  { title: "Domain cycle", items: [{ name: "domain-1" }, { name: "domain-2" }, { name: "domain-3" }, { name: "domain-4" }, { name: "domain-5" }] },
];

export function PaletteSection() {
  return (
    <Section title="Color" note="Role tokens. Purple is brand; cyan is reserved for AI output and never reused.">
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="text-sm font-semibold text-text">{g.title}</h3>
              {g.subtitle && <span className="text-2xs text-text-dim">{g.subtitle}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {g.items.map((s) => (
                <div key={s.name} className="overflow-hidden rounded-md border border-line">
                  <div className="h-12" style={{ backgroundColor: `var(--color-${s.name})` }} />
                  <div className="px-2.5 py-2">
                    <div className="text-xs font-semibold text-text">{s.name}</div>
                    <div className="font-mono text-2xs text-text-dim">--color-{s.name}</div>
                    {s.note && <div className="mt-0.5 text-2xs text-warn">{s.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
