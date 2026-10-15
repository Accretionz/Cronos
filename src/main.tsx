import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CoreContext, createCore } from "./core";
import { modules } from "./modules";
import { App } from "./shell/App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

createCore(modules)
  .then((core) => {
    // Handy for debugging in the browser console: window.cronos.store.query()
    (window as unknown as { cronos: typeof core }).cronos = core;
    root.render(
      <StrictMode>
        <CoreContext.Provider value={core}>
          <App />
        </CoreContext.Provider>
      </StrictMode>,
    );
  })
  .catch((err) => {
    console.error(err);
    root.render(<p style={{ padding: 24 }}>Cronos failed to start: {String(err)}</p>);
  });
