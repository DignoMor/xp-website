import { defineConfig } from "astro/config";

// Static Foundation Release — no server adapter, no integrations.
export default defineConfig({
  output: "static",
});
