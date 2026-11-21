/* Resonance uses the standards-based Web Push API so Home Screen installs can
   receive a private-playlist alert even when the page is closed. */
self.addEventListener("install", (event) => {
  // This worker only handles notification events, so it is safe to make a
  // newly published handler available as soon as it has installed.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
  let url = scope;
  try {
    const candidate = new URL(event.notification.data?.url || scope, scope);
    if (candidate.origin === self.location.origin) url = candidate.href;
  } catch {
    // Use the app root if an old notification contains a malformed link.
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const scopeUrl = new URL(scope);
    const existing = windows.find((client) => {
      try {
        const clientUrl = new URL(client.url);
        return clientUrl.origin === scopeUrl.origin && clientUrl.pathname.startsWith(scopeUrl.pathname);
      } catch {
        return false;
      }
    });
    if (existing) {
      try {
        if ("navigate" in existing) await existing.navigate(url);
        return await existing.focus();
      } catch {
        // A stale Home Screen window may no longer be focusable. Open a fresh
        // app window instead of losing the notification tap.
      }
    }
    return self.clients.openWindow(url);
  })());
});
