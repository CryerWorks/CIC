import { NavLink } from "react-router-dom";
import { DESTINATIONS } from "../navigation";
import { cx } from "../../components/ui/types";

/** Primary navigation. A <nav> landmark of NavLinks; the active link gets `aria-current="page"`
 *  from React Router plus a non-color-only indicator (weight + tinted background) for a11y. */
export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="flex w-52 shrink-0 flex-col gap-1 border-r border-line bg-surface-sunken p-3"
    >
      {DESTINATIONS.map((d) => (
        <NavLink
          key={d.path}
          to={d.path}
          end={d.path === "/"}
          className={({ isActive }) =>
            cx(
              "rounded-sm px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              isActive
                ? "bg-brand-soft font-semibold text-brand"
                : "text-text-dim hover:bg-panel-raised hover:text-text",
            )
          }
        >
          {d.label}
        </NavLink>
      ))}
    </nav>
  );
}
