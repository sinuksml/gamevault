import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base: the same build works at the site root, under /gamevault/, or
// under a preview path such as /gamevault/next/. Routing is hash-based for the
// same reason — GitHub Pages cannot rewrite deep links.
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "3.0.0") },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.png"],
      manifest: {
        name: "Sinu Game Vault",
        short_name: "Game Vault",
        description: "A private library for games, movies and TV shows.",
        display: "standalone",
        start_url: ".",
        background_color: "#0b0d12",
        theme_color: "#0b0d12",
        icons: [{ src: "icon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // Artwork is cached as it is viewed, so the library still has pictures offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === "image.tmdb.org" || url.hostname === "media.rawg.io",
            handler: "CacheFirst",
            options: { cacheName: "artwork", expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: { target: "es2023", sourcemap: true },
  test: { environment: "node" },
});
