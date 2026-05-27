/** The app's top bar. Calm and minimal (Obsidian theme) — identity now; actions land later. */
export function Topbar() {
  return (
    <header className="flex h-12 shrink-0 items-center border-b border-line bg-panel-header px-4">
      <span className="font-semibold text-text">CIC</span>
      <span className="ml-2 text-xs text-text-dim">Learning Platform</span>
    </header>
  );
}
