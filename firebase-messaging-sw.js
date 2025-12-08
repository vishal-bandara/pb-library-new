importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
    authDomain: "pb-library-1501a.firebaseapp.com",
    projectId: "pb-library-1501a",
    messagingSenderId: "351111194912",
    appId: "1:351111194912:web:a24d7385a22ac51e220f45"
});

const messaging = firebase.messaging();

// Background notifications
messaging.onBackgroundMessage((payload) => {
    self.registration.showNotification(payload.notification.title, {
        body: payload.notification.body,
        icon: 'logo.png'
    });
});
