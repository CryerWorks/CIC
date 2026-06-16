import { Link } from "react-router-dom";

/**
 * Quick Actions bar — one-click entry points to all active study features.
 * Always visible when a vault is connected (not gated on data).
 */
export function QuickActions() {
  const actions = [
    { label: "Daily Loop", to: "/loop", emoji: "🔄" },
    { label: "Review Cards", to: "/review", emoji: "🧠" },
    { label: "Feynman", to: "/search", emoji: "💬" },
    { label: "Search", to: "/search", emoji: "🔍" },
    { label: "Research", to: "/research", emoji: "🔬" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.label}
          to={a.to}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-xs text-text hover:border-line-bright hover:bg-surface-sunken"
        >
          <span aria-hidden>{a.emoji}</span>
          {a.label}
        </Link>
      ))}
    </div>
  );
}
