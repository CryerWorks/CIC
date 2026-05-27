import { Panel } from "../../components/ui";

/** Reused screen for destinations that aren't implemented yet (FR-004). */
export function Placeholder({ name }: { name: string }) {
  return (
    <Panel title={name}>
      <p className="text-text-dim">{name} arrives in a later feature.</p>
    </Panel>
  );
}
