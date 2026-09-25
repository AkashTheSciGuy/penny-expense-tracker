import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "@/app/page";
import { PennyThemeProvider } from "@/components/penny/theme";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PennyThemeProvider>
      <Home />
    </PennyThemeProvider>
  </StrictMode>,
);
