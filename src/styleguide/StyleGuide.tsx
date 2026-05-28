import { PaletteSection } from "./sections/PaletteSection";
import { TypeSection } from "./sections/TypeSection";
import { ScaleSection } from "./sections/ScaleSection";
import { ComponentsDisplaySection } from "./sections/ComponentsDisplaySection";
import { ComponentsDataSection } from "./sections/ComponentsDataSection";
import { ComponentsControlsSection } from "./sections/ComponentsControlsSection";

// The living design reference (FR-008). Mounts as the app root view today; becomes the
// /style route once routing lands (FR-009 / research R7).
export function StyleGuide() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 border-b border-line pb-6">
        <p className="text-2xs font-semibold uppercase tracking-widest text-brand">CIC Platform</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text">Design System</h1>
        <p className="mt-2 max-w-2xl text-md text-text-dim">
          The Obsidian visual language — role tokens and accessible component primitives. Living reference (Feature 002).
        </p>
      </header>
      <div className="flex flex-col gap-12">
        <PaletteSection />
        <TypeSection />
        <ScaleSection />
        <ComponentsDisplaySection />
        <ComponentsDataSection />
        <ComponentsControlsSection />
      </div>
    </div>
  );
}
