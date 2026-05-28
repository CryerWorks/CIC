import { useState } from "react";
import { Section, Demo } from "./Section";
import { Button, Segmented, Scratchpad, Rating } from "../../components/ui";

export function ComponentsControlsSection() {
  const [face, setFace] = useState("front");
  return (
    <Section title="Components · controls" note="Interactive primitives — keyboard-operable with a visible focus ring.">
      <div className="grid gap-4 md:grid-cols-2">
        <Demo label="Button">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="sm">Small</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Demo>
        <Demo label="Segmented">
          <Segmented
            ariaLabel="card face"
            value={face}
            onChange={setFace}
            options={[
              { value: "front", label: "Front" },
              { value: "back", label: "Back" },
              { value: "both", label: "Both" },
            ]}
          />
        </Demo>
        <Demo label="Scratchpad">
          <Scratchpad id="demo-scratch" label="Working" placeholder="Work the problem here…" />
        </Demo>
        <Demo label="Rating (shell)">
          <Rating />
        </Demo>
      </div>
    </Section>
  );
}
