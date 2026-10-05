// Mesh's service worker. It shows push notifications and opens Mesh when one
// is tapped. It doesn't cache pages or intercept requests, so new versions of
// Mesh arrive exactly as they do without it.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const calling = data.kind === "calls";
  event.waitUntil(self.registration.showNotification(data.title || "Mesh", {
    body: data.body || "",
    icon: "/icon-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    timestamp: data.ts || Date.now(),
    data: { url: data.url || "/" },
    // A call keeps ringing on screen until it's answered or dismissed.
    requireInteraction: calling,
    vibrate: calling ? [250, 120, 250, 120, 250] : undefined,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      // The open app moves to the page itself, keeping its state.
      open.postMessage({ type: "mesh:open", url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
