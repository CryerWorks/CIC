import "./App.css";

// Feature 001 — static placeholder only. No Tauri command invocation, no theme,
// no chrome, no routing (those arrive in Features 002+). This component exists to
// prove the React app renders inside the Tauri webview.
const APP_NAME = "CIC";
const VERSION = "0.1.0";

function App() {
  return (
    <main className="container">
      <h1>{APP_NAME}</h1>
      <p>hello — the desktop shell is running.</p>
      <p>
        Feature 001 · Tauri + React + Vite · v{VERSION}
      </p>
    </main>
  );
}

export default App;
