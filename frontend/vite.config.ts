import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Canonical public URL for the og:url tag. Set VITE_SITE_URL at build time to the
// domain the app is actually served from (wallet security providers compare it to
// the page's real origin). Until a site is hosted it falls back to the repository.
const SITE_URL = process.env.VITE_SITE_URL || "https://github.com/moltaphet/Apexrisk";

const siteUrl = (): Plugin => ({
  name: "apexrisk-site-url",
  transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL),
});

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl()],
  build: { chunkSizeWarningLimit: 1500 },
});
