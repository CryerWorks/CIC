import { Section, Demo } from "./Section";
import { Checklist, Stepper, Heatmap, Graph, Card } from "../../components/ui";

export function ComponentsDataSection() {
  return (
    <Section title="Components · progress & data" note="Static representative samples — not wired to live data in this feature.">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Checklist">
          <Checklist
            items={[
              { id: "1", label: "Read §1", done: true },
              { id: "2", label: "Derive the limit" },
              { id: "3", label: "Practice 5 problems" },
            ]}
          />
        </Demo>
        <Demo label="Stepper">
          <Stepper
            steps={[
              { label: "Pretest", state: "done" },
              { label: "Study", state: "active" },
              { label: "Recall", state: "todo" },
              { label: "Rate", state: "todo" },
            ]}
          />
        </Demo>
        <Demo label="Heatmap">
          <Heatmap
            label="Review activity"
            data={[
              [0, 1, 2, 3, 1, 0, 2],
              [1, 2, 3, 2, 1, 3, 0],
              [2, 0, 1, 3, 2, 1, 1],
            ]}
          />
        </Demo>
        <Demo label="Card (shell)">
          <Card question="State the fundamental theorem of calculus." hint="recall before reveal" />
        </Demo>
        <Demo label="Graph">
          <Graph
            nodes={[
              { id: "a", label: "Limits", x: 40, y: 40, domain: 1 },
              { id: "b", label: "Derivatives", x: 150, y: 28, domain: 2 },
              { id: "c", label: "Integrals", x: 270, y: 55, domain: 3 },
              { id: "d", label: "FTC", x: 175, y: 120, domain: 4 },
            ]}
            edges={[
              { from: "a", to: "b" },
              { from: "b", to: "c" },
              { from: "b", to: "d" },
              { from: "c", to: "d" },
            ]}
          />
        </Demo>
      </div>
    </Section>
  );
}
