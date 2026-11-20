/* Resonance uses the standards-based Web Push API so Home Screen installs can
   receive a private-playlist alert even when the page is closed. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text?.() || "Open Resonance to view" };
  }

  const scope = self.registration.scope;
  let url = scope;
  try {
    const candidate = new URL(payload.url || "./", scope);
    if (candidate.origin === self.location.origin) url = candidate.href;
  } catch {
    // Keep the Home Screen app as the safe fallback destination.
  }

  const options = {
    body: String(payload.body || "Open Resonance to view"),
    icon: new URL("assets/disco-ball-icon.png?v=3", scope).href,
    badge: new URL("assets/disco-ball-icon.png?v=3", scope).href,
    tag: String(payload.tag || "resonance-song"),
    renotify: false,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(String(payload.title || "Resonance"), options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const url = event.notification.data?.url || scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      try {
        return new URL(client.url).origin === new URL(url).origin;
      } catch {
        return false;
      }
    });
    if (existing) {
      if ("navigate" in existing) await existing.navigate(url);
      return existing.focus();
    }
    return self.clients.openWindow(url);
  })());
});
