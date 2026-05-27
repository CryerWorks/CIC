import { Section } from "./Section";

const sizes: { token: string; use: string }[] = [
  { token: "3xl", use: "Display / page title" },
  { token: "2xl", use: "Stat value" },
  { token: "xl", use: "Section title" },
  { token: "lg", use: "Card question" },
  { token: "md", use: "Lead" },
  { token: "base", use: "Body (default)" },
  { token: "sm", use: "Secondary" },
  { token: "xs", use: "Label" },
  { token: "2xs", use: "Micro / meta" },
];

export function TypeSection() {
  return (
    <Section title="Typography" note="Inter for UI; JetBrains Mono for code & data.">
      <div className="flex flex-col gap-2">
        {sizes.map((s) => (
          <div key={s.token} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
            <span className="text-text" style={{ fontSize: `var(--text-${s.token})` }}>
              The quick brown fox
            </span>
            <span className="shrink-0 font-mono text-2xs text-text-dim">
              text-{s.token} · {s.use}
            </span>
          </div>
        ))}
        <p className="mt-2 font-mono text-sm text-text-dim">const mono = "JetBrains Mono"; // code &amp; data</p>
      </div>
    </Section>
  );
}
