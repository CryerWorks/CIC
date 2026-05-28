import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { DashboardRoute } from "../features/dashboard/DashboardRoute";
import { CoursesRoute } from "../features/courses/CoursesRoute";
import { ReviewRoute } from "./routes/ReviewRoute";
import { DomainsRoute } from "./routes/domains/DomainsRoute";
import { VaultRoute } from "./routes/vault/VaultRoute";
import { StyleGuide } from "../styleguide/StyleGuide";

/**
 * The route table. Every screen is a child of the AppShell layout route, so the shell + the
 * store-health gate wrap them all. Declarative `<Routes>` (research R1): HashRouter in the app
 * (robust inside the packaged webview, no server path resolution), MemoryRouter in tests — and
 * `<Navigate>` updates history directly without the data-router's fetch machinery.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardRoute />} />
        <Route path="domains" element={<DomainsRoute />} />
        <Route path="vault" element={<VaultRoute />} />
        <Route path="courses" element={<CoursesRoute />} />
        <Route path="review" element={<ReviewRoute />} />
        <Route path="style" element={<StyleGuide />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
