/** A routable section of the app. The single source for the sidebar and the route table. */
export interface NavDestination {
  path: string;
  label: string;
  /** false → renders the shared Placeholder for now. */
  implemented: boolean;
}

export const DESTINATIONS: NavDestination[] = [
  { path: "/", label: "Dashboard", implemented: false },
  { path: "/domains", label: "Domains", implemented: true },
  { path: "/courses", label: "Courses", implemented: true },
  { path: "/loop", label: "Daily Loop", implemented: true },
  { path: "/review", label: "Review", implemented: true },
  { path: "/resources", label: "Resources", implemented: true },
  { path: "/search", label: "Search", implemented: true },
  { path: "/vault", label: "Vault", implemented: true },
  { path: "/settings", label: "Settings", implemented: true },
  { path: "/style", label: "Style guide", implemented: true },
];
