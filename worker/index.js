// Merged into the next-pwa service worker. Earlier builds cached /api/*
// responses (including profile data) in the "apis" cache for up to 24h;
// API routes are now NetworkOnly, so drop anything left behind.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("apis"));
});
