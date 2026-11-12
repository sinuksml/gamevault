import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startSync } from "./lib/drive";
import { hydrate, settings } from "./lib/store";
import "./styles/app.css";

const theme = settings.get("next-theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

// The IndexedDB copy can be newer than localStorage's; settle that before syncing.
void hydrate().finally(startSync);

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
