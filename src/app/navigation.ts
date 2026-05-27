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
  { path: "/courses", label: "Courses", implemented: false },
  { path: "/review", label: "Review", implemented: false },
  { path: "/style", label: "Style guide", implemented: true },
];
