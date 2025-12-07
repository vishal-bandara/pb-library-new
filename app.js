/* app.js — PB Library (full) */
/* Works with Firebase compat v8 (firebase-app.js, firebase-messaging.js, firebase-firestore.js, firebase-storage.js) */

'use strict';

/* ======================
   Utilities
====================== */
const $ = (sel) => document.querySelector(sel);
const $all = (sel) => Array.from(document.querySelectorAll(sel));

/* ======================
   Global State
====================== */
let db;
let storage;
let messaging;
let fcmToken = null;
let MOCK_BOOKS = [];
let LIBRARY_NOTICES = [];
const ADMIN_PASSWORD = 'admin'; // ⚠️ Never hardcode in production

/* ======================
   Firebase Config
====================== */
const firebaseConfig = {
  apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
  authDomain: "pb-library-1501a.firebaseapp.com",
  projectId: "pb-library-1501a",
  storageBucket: "pb-library-1501a.firebasestorage.app",
  messagingSenderId: "351111194912",
  appId: "1:351111194912:web:a24d7385a22ac51e220f45"
};

/* ======================
   Initialize Firebase
====================== */
if (typeof firebase === 'undefined') {
  console.error('Firebase SDK missing.');
} else {
  const app = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  storage = firebase.storage();
  if (firebase.messaging) {
    try { messaging = firebase.messaging(); } 
    catch (e) { console.warn('Messaging init error:', e); }
  } else { console.warn('Firebase Messaging SDK not loaded.'); }
}

/* ======================
   Service Worker & FCM setup
====================== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('[App] Service Worker registered:', registration);
      if (messaging && registration) {
        try { messaging.useServiceWorker(registration); } 
        catch(e) { console.warn('messaging.useServiceWorker error:', e); }
      }
      requestNotificationPermissionAndToken().catch(err => console.warn(err));
    })
    .catch(err => console.error('Service Worker registration failed:', err));
} else { console.warn('Service workers unsupported in this browser.'); }

/* ======================
   Notification Permission & Token
====================== */
async function requestNotificationPermissionAndToken() {
  if (!messaging) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const currentToken = await messaging.getToken({
      vapidKey: 'BFyttTg_-jthh60bjTJESAfSPiy4OMcRiSJcyCbhPYYYMvmHPgtsWG-pC35UiapR9ywrWLaDSvlwZmqOurR9-iY'
    });

    if (currentToken) {
      fcmToken = currentToken;
      await saveTokenToFirestore(fcmToken);
    }

    messaging.onTokenRefresh && messaging.onTokenRefresh(async () => {
      const refreshed = await messaging.getToken();
      fcmToken = refreshed;
      await saveTokenToFirestore(refreshed);
    });

  } catch (err) { console.error('Notification permission/token error:', err); }
}

async function saveTokenToFirestore(token) {
  if (!db) return;
  try {
    await db.collection('fcmTokens').doc(token).set({
      token,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('Saved token to Firestore.');
  } catch (e) { console.error('saveTokenToFirestore error:', e); }
}

/* ======================
   Time & Date Helpers
====================== */
function updateTimeAndDate() {
  const now = new Date();
  const optionsDate = { weekday: 'long', year: 'numeric', month: 'long' };
  const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };

  $('#date-text') && ($('#date-text').textContent = now.toLocaleDateString('en-US', optionsDate));
  $('#day-number') && ($('#day-number').textContent = now.getDate().toString().padStart(2, '0'));
  $('#time-text') && ($('#time-text').textContent = now.toLocaleTimeString('en-US', optionsTime));

  const mobileDateTimeElement = $('#mobile-date-time-line');
  if (mobileDateTimeElement) {
    const datePart = now.toLocaleDateString('en-GB');
    const timePart = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    mobileDateTimeElement.textContent = `${datePart} | ${timePart}`;
  }
}

/* ======================
   Firestore Listeners
====================== */
function setupBooksListener() {
  if (!db) return;
  const booksRef = db.collection('books').orderBy('createdAt', 'desc');
  booksRef.onSnapshot(snapshot => {
    MOCK_BOOKS = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const activeView = $all('.main-view:not(.hidden)')[0];
    const activeViewId = activeView ? activeView.id.replace('-view','') : 'home';
    if (activeViewId === 'search' && $('#search-input') && $('#search-input').value.trim()) {
      handleSearch($('#search-input').value.trim());
    } else {
      renderBookCards(MOCK_BOOKS, 'new-arrivals');
    }
  });
}

function setupNoticesListener() {
  if (!db) return;
  const noticesRef = db.collection('notices').orderBy('dateAdded','desc');
  noticesRef.onSnapshot(snapshot => {
    LIBRARY_NOTICES = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPublicNotices();
    if ($('#admin-panel') && !$('#admin-panel').classList.contains('hidden')) {
      renderAdminNoticesList();
    }
  });
}

/* ======================
   CRUD: Books & Notices
====================== */
async function addBook(title, author, description, file) {
  if (!db) return showToast('Database not connected.');
  let coverUrl = 'https://via.placeholder.com/180x280?text=No+Cover';
  try {
    if (file && storage) {
      const storageRef = storage.ref(`covers/${Date.now()}_${file.name}`);
      const uploadTask = storageRef.put(file);
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          snapshot => {},
          error => { console.error(error); reject(error); },
          async () => { coverUrl = await storageRef.getDownloadURL(); resolve(); }
        );
      });
    }
    await db.collection('books').add({
      title, author, description, cover: coverUrl,
      reserved: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#add-title') && ($('#add-title').value='');
    $('#add-author') && ($('#add-author').value='');
    $('#add-description') && ($('#add-description').value='');
    $('#add-cover-file') && ($('#add-cover-file').value='');
    showToast(`Book "${title}" added!`);
  } catch(e) { console.error('addBook error:', e); showToast('Error adding book.'); }
}

async function addNotice(title, content) {
  if (!db) return;
  try {
    await db.collection('notices').add({
      title: title || 'Library Update',
      content,
      date: new Date().toLocaleDateString(),
      dateAdded: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#notice-title') && ($('#notice-title').value='');
    $('#notice-content') && ($('#notice-content').value='');
    showToast('Notice posted! Users will receive push notifications.');
  } catch(e) { console.error('addNotice error:', e); showToast('Error posting notice.'); }
}

/* ======================
   Search
====================== */
function handleSearch(query) {
  const trimmed = query.trim().toLowerCase();
  const container = $('#search-results-list');
  if (!container) return;
  if (!trimmed) {
    container.innerHTML = `<p style="text-align:center;color:var(--muted);padding:20px;">Start typing above to search.</p>`;
    return;
  }
  const results = MOCK_BOOKS.filter(b => (b.title||'').toLowerCase().includes(trimmed) || (b.author||'').toLowerCase().includes(trimmed));
  renderBookCards(results, 'search-results-list');
}

/* ======================
   Render Functions
====================== */
function renderBookCards(books, containerId) {
  const container = $(`#${containerId}`);
  if (!container) return;
  container.innerHTML = '';
  if (!books.length) return container.innerHTML = `<p style="color:var(--muted);padding:20px 0;">No books found.</p>`;
  books.forEach(book => {
    const card = document.createElement('div');
    card.className='card'; if(book.reserved) card.classList.add('reserved');
    card.innerHTML=`
      <div class="cover" style="background-image:url('${book.cover||'https://via.placeholder.com/180x280'}')"></div>
      <div class="meta">
        <p class="title">${book.title}</p>
        <p class="author">${book.author}</p>
      </div>
    `;
    card.addEventListener('click',()=>showBookDetailModal(book));
    container.appendChild(card);
  });
}

function renderPublicNotices() {
  const container = $('#notices-view .notice-area');
  if (!container) return;
  container.innerHTML='';
  if (!LIBRARY_NOTICES.length) return container.innerHTML='<p style="text-align:center;color:var(--muted);padding:20px;">No notices.</p>';
  LIBRARY_NOTICES.forEach(n => {
    const el = document.createElement('div');
    el.className='notice-area';
    el.style.background='white';
    el.style.borderLeft='4px solid var(--accent)';
    el.style.marginBottom='10px';
    el.innerHTML=`
      <p style="margin:0;font-weight:700;color:var(--accent);font-size:14px;">${n.title||'Library Update'}</p>
      <p style="margin:5px 0 0 0;font-size:16px;">${n.content}</p>
      <p style="margin:10px 0 0 0;font-size:11px;color:var(--muted);text-align:right;">Posted: ${n.date}</p>
    `;
    container.appendChild(el);
  });
}

/* ======================
   Modals & UI Helpers
====================== */
function showBookDetailModal(book) {
  const modal = $('#book-detail-modal');
  const panel = $('#book-detail-panel');
  if (!modal || !panel) return;
  panel.innerHTML=`
    <div class="book-details-content">
      <div class="book-cover-display" style="background-image:url('${book.cover||'https://via.placeholder.com/180x280'}');height:220px;"></div>
      <div class="book-info">
        <h3>${book.title}</h3>
        <p class="author-text">by ${book.author}</p>
        <p class="description-text">${book.description}</p>
      </div>
    </div>
    <button id="close-detail-modal">Close</button>
  `;
  $('#close-detail-modal') && $('#close-detail-modal').addEventListener('click',()=>modal.classList.add('hidden'));
  modal.classList.remove('hidden');
}

function showToast(msg){const t=$('#toast');if(!t)return;t.innerHTML=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}

/* ======================
   Event Listeners & Init
====================== */
document.addEventListener('DOMContentLoaded',()=>{
  setupBooksListener();
  setupNoticesListener();
  updateTimeAndDate();
  setInterval(updateTimeAndDate,1000);

  $all('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));

  $('#add-book-submit') && $('#add-book-submit').addEventListener('click',()=>{
    const title = $('#add-title') ? $('#add-title').value.trim():'';
    const author = $('#add-author') ? $('#add-author').value.trim():'';
    const description = $('#add-description') ? $('#add-description').value.trim():'';
    const fileInput = $('#add-cover-file');
    const file = fileInput && fileInput.files.length>0 ? fileInput.files[0]:null;
    if(!title||!author)return showToast('Title & Author required!');
    addBook(title,author,description,file);
  });

  $('#add-notice-submit') && $('#add-notice-submit').addEventListener('click',()=>{
    const title = $('#notice-title') ? $('#notice-title').value.trim():'';
    const content = $('#notice-content') ? $('#notice-content').value.trim():'';
    if(!content)return showToast('Notice content cannot be empty.');
    addNotice(title,content);
  });
});

/* ======================
   End of file
====================== */
