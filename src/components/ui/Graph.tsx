import { cx, type DomainIndex } from "./types";

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  domain?: DomainIndex;
}

export interface GraphEdge {
  from: string;
  to: string;
}

interface GraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  className?: string;
}

// SVG dependency-graph viz. Static representative sample in 002 (research R6) — not an
// interactive engine. Colors reference token CSS variables (no raw hex; SC-006 holds).
const domainStroke: Record<DomainIndex, string> = {
  1: "var(--color-domain-1)",
  2: "var(--color-domain-2)",
  3: "var(--color-domain-3)",
  4: "var(--color-domain-4)",
  5: "var(--color-domain-5)",
};

export function Graph({ nodes, edges, className }: GraphProps) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox="0 0 320 160" className={cx("w-full", className)} role="img" aria-label="Dependency graph sample">
      {edges.map((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-line-bright)" strokeWidth={1.5} />;
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={8} fill="var(--color-panel-raised)" stroke={domainStroke[n.domain ?? 1]} strokeWidth={2} />
          <text x={n.x} y={n.y + 20} textAnchor="middle" fill="var(--color-text-dim)" fontSize={9} fontFamily="var(--font-mono)">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
