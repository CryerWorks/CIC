import { StyleGuide } from "./styleguide/StyleGuide";

// Feature 002 — the app's root view is the living StyleGuide (the design reference).
// No router yet (Feature 004); when routing lands, the StyleGuide becomes the /style route.
function App() {
  return <StyleGuide />;
}

export default App;
