// =================================================================
// === SERVICE WORKER: FCM, CACHING, AND PUSH NOTIFICATION HANDLER ===
// =================================================================

// 1. IMPORT FIREBASE MESSAGING LIBRARIES
// These SDKs are required for Firebase Cloud Messaging in the Service Worker
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');


// --- CACHE CONFIGURATION ---
const CACHE_NAME = 'library-pwa-v2'; // <--- UPDATED CACHE NAME (for immediate activation)
const ASSETS = [
    // Ensure all these paths are correct and return a 200 status code
    '/',
    '/index.html',
    '/style.css',
    '/app.js', // This should be app.js if that's the main script name
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// --- FIREBASE CONFIGURATION (Must match app.js config) ---
const firebaseConfig = {
    apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
    authDomain: "pb-library-1501a.firebaseapp.com",
    projectId: "pb-library-1501a",
    storageBucket: "pb-library-1501a.firebasestorage.app",
    messagingSenderId: "351111194912",
    appId: "1:351111194912:web:a24d7385a22ac51e220f45"
};

// 2. INITIALIZE FIREBASE MESSAGING
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 3. LISTEN FOR BACKGROUND PUSH MESSAGES (FCM)
// ... (No change to this section, it's correct)
messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background push message: ', payload);

    const notificationTitle = payload.notification.title || 'New Library Alert';
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icons/icon-192.png',
        data: payload.data 
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 4. HANDLE NOTIFICATION CLICKS
// ... (No change to this section, it's correct)
self.addEventListener('notificationclick', (e) => {
    const notification = e.notification;
    notification.close();

    const data = notification.data || {};

    e.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes('/index.html') || client.url === location.origin + '/') {
                    client.focus();
                    return;
                }
            }
            if (clients.openWindow) {
                // If opening a new window, navigate directly to the notices view
                return clients.openWindow('/#notices'); 
            }
        })
    );
});


// --- PWA CACHING LOGIC (Install, Activate, Fetch) ---

self.addEventListener('install', (e) => {
    console.log('[sw.js] Install started. Attempting to cache assets...');
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // 🔥 CRITICAL FIX: Use map/Promise.all to catch individual errors.
            // This ensures the service worker installs even if one file is missing.
            const successfulCaches = ASSETS.map(url => {
                return cache.add(url).catch(err => {
                    // Log the specific asset that failed but continue installation
                    console.warn(`[sw.js] Failed to cache: ${url}`, err); 
                });
            });
            // Wait for all attempts (successful or failed) to complete
            return Promise.all(successfulCaches); 
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(k => {
                if (k !== CACHE_NAME) {
                    console.log('[sw.js] Deleting old cache:', k);
                    return caches.delete(k);
                }
            })
        ))
    );
    self.clients.claim();
});

// ... (No change to the fetch listener, it remains correct and robust)
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    
    // Strategy: Network-only for external resources (Firebase, other origins)
    if (url.origin !== location.origin) {
      if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
        return; 
      }
      return fetch(e.request).catch(() => caches.match('/index.html'));
    }

    // Strategy: Cache-first, falling back to Network, then caching new responses (for ASSETS)
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(resp => {
          if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
          
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          
          return resp;
        }).catch(() => {
            return caches.match('/index.html');
        });
      })
    );
});
