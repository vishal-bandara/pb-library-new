// OneSignal worker — place at repo root
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// Optional: notificationclick handler for older browsers fallback
self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes("/pb-library-new/") && 'focus' in client) {
          client.focus();
          client.postMessage({ action: "openNoticePanel" });
          return;
        }
      }
      return clients.openWindow("/pb-library-new/?openNotice=true");
    })
  );
});
