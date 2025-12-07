/* app.js — PB Library (full) */
/*  - Works with Firebase compat v8 (firebase-app.js, firebase-messaging.js, firebase-firestore.js, firebase-storage.js)
    - Replace placeholders: VAPID key, and verify firebaseConfig values match your project.
*/

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
const ADMIN_PASSWORD = 'admin'; // ⚠️ WARNING: Never use hardcoded passwords in production!

/* ======================
   Firebase Config - REPLACE with your real values if needed
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
   Initialize Firebase (once)
   ====================== */
if (typeof firebase === 'undefined') {
  console.error('Firebase SDK missing. Ensure SDK scripts are added in index.html.');
  showToast && showToast('Firebase SDK missing. Check console.');
} else {
  const app = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  storage = firebase.storage();
  if (firebase.messaging) {
    try {
      messaging = firebase.messaging();
    } catch (e) {
      console.warn('Messaging init error:', e);
    }
  } else {
    console.warn('Firebase Messaging SDK not loaded.');
  }
}

/* ======================
   Service Worker & FCM setup
   ====================== */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.log('[App] Service Worker registered:', registration);
      if (messaging && registration) {
        // Link SW to messaging
        try {
          messaging.useServiceWorker(registration);
        } catch (e) {
          console.warn('messaging.useServiceWorker error:', e);
        }
      }

      // trigger permission/token function (non-blocking)
      requestNotificationPermissionAndToken().catch(err => {
        console.warn('Permission/token flow error:', err);
      });
    })
    .catch((err) => {
      console.error('[App] Service Worker registration failed:', err);
      showToast('PWA features limited: service worker failed.', 'error');
    });
} else {
  console.warn('[App] Service workers unsupported in this browser.');
}

/* ======================
   Notification Permission & Token Management
   ====================== */
async function requestNotificationPermissionAndToken() {
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted:', permission);
      return;
    }
    // NOTE: In compat v8, messaging.getToken accepts vapidKey param.
    const currentToken = await messaging.getToken({
      vapidKey: 'BFyttTg_-jthh60bjTJESAfSPiy4OMcRiSJcyCbhPYYYMvmHPgtsWG-pC35UiapR9ywrWLaDSvlwZmqOurR9-iY' // <-- REPLACE THIS
    });

    if (currentToken) {
      fcmToken = currentToken;
      console.log('FCM token:', fcmToken);
      await saveTokenToFirestore(fcmToken);
    } else {
      console.warn('No FCM token returned.');
    }

    // token refresh handling (compat v8)
    messaging.onTokenRefresh && messaging.onTokenRefresh(async () => {
      try {
        const refreshed = await messaging.getToken();
        fcmToken = refreshed;
        console.log('FCM token refreshed:', refreshed);
        await saveTokenToFirestore(refreshed);
      } catch (err) {
        console.error('Error retrieving refreshed token:', err);
      }
    });

  } catch (err) {
    console.error('Error during notification permission/token:', err);
  }
}

async function saveTokenToFirestore(token) {
  if (!db) return;
  try {
    await db.collection('fcmTokens').doc(token).set({
      token,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('Saved token to Firestore.');
  } catch (e) {
    console.error('saveTokenToFirestore error:', e);
  }
}

/* ======================
   Time & Date Helpers
   ====================== */
function updateTimeAndDate() {
  const now = new Date();
  const optionsDate = { weekday: 'long', year: 'numeric', month: 'long' };
  const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };

  if ($('#date-text')) $('#date-text').textContent = now.toLocaleDateString('en-US', optionsDate);
  if ($('#day-number')) $('#day-number').textContent = now.getDate().toString().padStart(2, '0');
  if ($('#time-text')) $('#time-text').textContent = now.toLocaleTimeString('en-US', optionsTime);

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
  if (!db) {
    console.error("Firestore 'db' not initialized.");
    return;
  }
  const booksRef = db.collection('books').orderBy('createdAt', 'desc');
  booksRef.onSnapshot(snapshot => {
    MOCK_BOOKS = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const currentSearchQuery = $('#search-input') ? $('#search-input').value.trim() : '';
    const activeView = $all('.main-view:not(.hidden)')[0];
    const activeViewId = activeView ? activeView.id.replace('-view', '') : 'home';

    if (activeViewId === 'search' && currentSearchQuery) {
      handleSearch(currentSearchQuery);
    } else {
      renderBookCards(MOCK_BOOKS, 'new-arrivals');
    }
  }, error => {
    console.error('Books listener error:', error);
    showToast('Error loading books from database.');
  });
}

function setupNoticesListener() {
  if (!db) return;
  const noticesRef = db.collection('notices').orderBy('dateAdded', 'desc');
  noticesRef.onSnapshot(snapshot => {
    LIBRARY_NOTICES = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPublicNotices();
    if ($('#admin-panel') && !$('#admin-panel').classList.contains('hidden')) {
      renderAdminNoticesList();
    }
  }, error => {
    console.error('Notices listener error:', error);
  });
}

/* ======================
   CRUD: Books, Notices, Reservations
   ====================== */
async function addBook(title, author, description, file) {
  if (!db) return showToast('Database not connected.');
  showToast(`Adding "${title}"... Please wait.`);
  const uploadProgress = $('#upload-progress');
  if (uploadProgress) uploadProgress.classList.add('hidden');

  let coverUrl = 'https://via.placeholder.com/180x280?text=No+Cover';

  try {
    if (file && storage) {
      if (uploadProgress) uploadProgress.classList.remove('hidden');
      const storageRef = storage.ref(`covers/${Date.now()}_${file.name}`);
      const uploadTask = storageRef.put(file);

      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            if (uploadProgress && snapshot.totalBytes) {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              uploadProgress.value = progress;
            }
          },
          (error) => {
            console.error('Image upload failed:', error);
            showToast('Image upload failed. Adding book without cover.');
            reject(error);
          },
          async () => {
            try {
              coverUrl = await storageRef.getDownloadURL();
              resolve();
            } catch (e) {
              reject(e);
            }
          });
      });

      if (uploadProgress) uploadProgress.classList.add('hidden');
    }

    await db.collection('books').add({
      title,
      author,
      description,
      cover: coverUrl,
      reserved: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    $('#add-title') && ($('#add-title').value = '');
    $('#add-author') && ($('#add-author').value = '');
    $('#add-description') && ($('#add-description').value = '');
    $('#add-cover-file') && ($('#add-cover-file').value = '');

    showToast(`Book "${title}" added!`);
  } catch (e) {
    console.error('addBook error:', e);
    showToast('Error adding book.');
  }
}

async function deleteBook(bookId, title) {
  if (!db) return;
  try {
    await db.collection('books').doc(bookId).delete();
    showAdminPanelReturnToast(`Deleted: "${title}"`);
  } catch (e) {
    console.error('deleteBook error:', e);
    showToast('Error deleting book.');
  }
}

async function reserveBook(bookId, name, contact, bookTitle) {
  if (!db) return;
  try {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const reservationData = {
      name,
      contact,
      dateReserved: new Date().toLocaleDateString(),
      dueDate: dueDate.toLocaleDateString(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('books').doc(bookId).update({ reserved: reservationData });
    $('#reserve-form-modal') && $('#reserve-form-modal').classList.add('hidden');
    showToast(`"${bookTitle}" reserved by ${name}!`);
  } catch (e) {
    console.error('reserveBook error:', e);
    showToast('Error reserving book.');
  }
}

async function releaseReservation(bookId, title) {
  if (!db) return;
  try {
    await db.collection('books').doc(bookId).update({ reserved: null });
    showToast(`Reservation for "${title}" released.`);
  } catch (e) {
    console.error('releaseReservation error:', e);
    showToast('Error releasing reservation.');
  }
}

async function addNotice(title, content) {
  if (!db) return;
  try {
    // The Firestore document creation here is the ONLY action needed.
    // The deployed Cloud Function handles the push notification trigger.
    await db.collection('notices').add({
      title: title || 'Library Update',
      content,
      date: new Date().toLocaleDateString(),
      dateAdded: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#notice-title') && ($('#notice-title').value = '');
    $('#notice-content') && ($('#notice-content').value = '');
    showToast('New notice posted! Push notifications sent via server.'); // Updated message
  
  } catch (e) {
    console.error('addNotice error:', e);
    showToast('Error posting notice.');
  }
}

async function deleteNotice(noticeId) {
  if (!db) return;
  try {
    await db.collection('notices').doc(noticeId).delete();
    showToast('Notice deleted.');
  } catch (e) {
    console.error('deleteNotice error:', e);
    showToast('Error deleting notice.');
  }
}

/* ======================
   Search
   ====================== */
function handleSearch(query) {
  const trimmed = query.trim().toLowerCase();
  const resultsContainerId = 'search-results-list';
  const container = $(`#${resultsContainerId}`);
  if (!container) return;

  if (trimmed.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--muted);padding:20px;">Start typing above to search the library catalogue.</p>`;
    return;
  }

  const results = MOCK_BOOKS.filter(book => {
    const t = (book.title || '').toLowerCase();
    const a = (book.author || '').toLowerCase();
    return t.includes(trimmed) || a.includes(trimmed);
  });

  renderBookCards(results, resultsContainerId);
}

/* ======================
   UI Rendering
   ====================== */
function renderBookCards(books, containerId) {
  const container = $(`#${containerId}`);
  if (!container) return;
  container.innerHTML = '';

  const isDeleteMode = (containerId === 'new-arrivals') &&
    $('#toggle-delete-mode') && $('#toggle-delete-mode').classList.contains('active');

  if (!books || books.length === 0) {
    const searchQuery = $('#search-input') ? $('#search-input').value.trim() : '';
    let message = '<p style="color:var(--muted);padding:20px 0;">No books found in the library.</p>';
    if (containerId === 'search-results-list' && searchQuery) {
      message = `<p style="color:var(--muted);padding:20px 0;">No books found matching "${searchQuery}".</p>`;
    } else if (containerId === 'search-results-list') {
      message = `<p style="color:var(--muted);padding:20px 0;">Start typing above to search the library catalogue.</p>`;
    }
    container.innerHTML = message;
    return;
  }

  books.forEach(book => {
    const card = document.createElement('div');
    card.className = 'card';
    if (book.reserved) card.classList.add('reserved');
    card.dataset.bookId = book.id;

    const deleteBtnHtml = isDeleteMode ? `<button class="delete-book-btn" data-id="${book.id}" data-title="${escapeHtml(book.title || '')}" title="Delete"><i class="fas fa-trash"></i></button>` : '';
    const reservedHtml = book.reserved ? `<div class="reserved-overlay">RESERVED</div>` : '';

    card.innerHTML = `
      ${deleteBtnHtml}
      ${reservedHtml}
      <div class="cover" style="background-image:url('${escapeHtml(book.cover || 'https://via.placeholder.com/180x280?text=No+Cover')}')"></div>
      <div class="meta">
        <p class="title">${escapeHtml(book.title || 'Untitled')}</p>
        <p class="author">${escapeHtml(book.author || '')}</p>
      </div>
    `;

    if (!isDeleteMode) {
      card.addEventListener('click', () => showBookDetailModal(book));
    }

    container.appendChild(card);
  });

  if (isDeleteMode) {
    $all('.delete-book-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const title = e.currentTarget.dataset.title;
        if (confirm(`Are you sure you want to delete the book: ${title}?`)) {
          deleteBook(id, title);
        }
      });
    });
  }
}

function renderAdminPanelReservations() {
  const listContainer = $('#reservations-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  const reserved = MOCK_BOOKS.filter(b => b.reserved);
  if (reserved.length === 0) {
    listContainer.innerHTML = '<p style="color:#ccc">No active reservations found.</p>';
    return;
  }
  reserved.forEach(book => {
    const div = document.createElement('div');
    div.className = 'reservation-details';
    div.innerHTML = `
      <p><strong>Book:</strong> ${escapeHtml(book.title)}</p>
      <p><strong>Reserved By:</strong> ${escapeHtml(book.reserved.name)}</p>
      <p><strong>Contact:</strong> ${escapeHtml(book.reserved.contact)}</p>
      <p><strong>Due:</strong> ${escapeHtml(book.reserved.dueDate)}</p>
      <button class="primary release-reservation-btn" data-book-id="${book.id}" data-title="${escapeHtml(book.title)}">Release Book</button>
    `;
    listContainer.appendChild(div);
  });

  $all('.release-reservation-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.bookId;
      const title = e.currentTarget.dataset.title;
      releaseReservation(id, title);
    });
  });
}

function renderAdminNoticesList() {
  const listContainer = $('#active-notices-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  if (!LIBRARY_NOTICES || LIBRARY_NOTICES.length === 0) {
    listContainer.innerHTML = '<p style="color:#ccc;font-size:0.9em;">(No active notices)</p>';
    return;
  }
  LIBRARY_NOTICES.forEach(n => {
    const div = document.createElement('div');
    div.className = 'reservation-details';
    div.innerHTML = `
      <p><strong>Title:</strong> ${escapeHtml(n.title || 'N/A')}</p>
      <p style="font-size:13px;">${escapeHtml((n.content || '').substring(0, 40))}...</p>
      <button class="primary delete-notice-btn" data-id="${n.id}" style="background:#e85d3f;">Delete Notice</button>
    `;
    listContainer.appendChild(div);
  });

  $all('.delete-notice-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('Are you sure you want to delete this notice?')) {
        deleteNotice(id);
      }
    });
  });
}

function renderPublicNotices() {
  const container = $('#notices-view .notice-area');
  if (!container) return;
  container.innerHTML = '';
  if (!LIBRARY_NOTICES || LIBRARY_NOTICES.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px;">No active library notices at this time.</p>';
    return;
  }
  LIBRARY_NOTICES.forEach(notice => {
    const el = document.createElement('div');
    el.className = 'notice-area';
    el.style.background = 'white';
    el.style.borderLeft = '4px solid var(--accent)';
    el.style.marginBottom = '10px';
    el.innerHTML = `
      <p style="margin:0;font-weight:700;color:var(--accent);font-size:14px;">${escapeHtml(notice.title || 'Library Update')}</p>
      <p style="margin:5px 0 0 0;font-size:16px;">${escapeHtml(notice.content)}</p>
      <p style="margin:10px 0 0 0;font-size:11px;color:var(--muted);text-align:right;">Posted: ${escapeHtml(notice.date)}</p>
    `;
    container.appendChild(el);
  });
}

/* ======================
   Modals & Small UI Helpers
   ====================== */
function showReserveFormModal(book) {
  const modal = $('#reserve-form-modal');
  if (!modal) return;
  $('#reserve-modal-title') && ($('#reserve-modal-title').textContent = `Reserve Book: ${book.title}`);
  $('#book-id-to-reserve') && ($('#book-id-to-reserve').value = book.id);
  $('#reserve-name') && ($('#reserve-name').value = '');
  $('#reserve-contact') && ($('#reserve-contact').value = '');
  modal.classList.remove('hidden');
  $('#reserve-name') && $('#reserve-name').focus();
}

function showBookDetailModal(book) {
  const modal = $('#book-detail-modal');
  const panel = $('#book-detail-panel');
  if (!modal || !panel) return;

  panel.innerHTML = `
    <div class="book-details-content">
      <div class="book-cover-display" style="background-image: url('${escapeHtml(book.cover || 'https://via.placeholder.com/180x280?text=No+Cover')}'); height:220px;background-size:cover;border-radius:8px"></div>
      <div class="book-info" style="padding-top:12px">
        <h3>${escapeHtml(book.title)}</h3>
        <p class="author-text">by ${escapeHtml(book.author || '')}</p>
        <p class="description-text">${escapeHtml(book.description || '')}</p>
        ${book.reserved ? `<p class="reserved-status-text">Reserved until: ${escapeHtml(book.reserved.dueDate)}</p>` : `<button class="primary" id="reserve-btn">Reserve This Book</button>`}
      </div>
    </div>
    <button class="link" id="close-detail-modal" style="margin-top:20px;">Close</button>
  `;

  if (!book.reserved) {
    const reserveBtn = $('#reserve-btn');
    if (reserveBtn) {
      reserveBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        showReserveFormModal(book);
      });
    }
  }

  const closeBtn = $('#close-detail-modal');
  closeBtn && closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  const bg = modal.querySelector('.modal-bg');
  bg && bg.addEventListener('click', () => modal.classList.add('hidden'));

  modal.classList.remove('hidden');
}

function showToast(msg, type = 'info') {
  const t = $('#toast');
  if (!t) return;
  clearTimeout(t._to);
  t.classList.remove('admin-return');
  t.innerHTML = msg;
  t.classList.add('show');
  t._to = setTimeout(() => { t.classList.remove('show'); }, 3000);
}

function showAdminPanelReturnToast(msg) {
  const t = $('#toast');
  if (!t) return;
  clearTimeout(t._to);
  t.classList.remove('show');
  t.classList.add('admin-return');
  t.innerHTML = `${msg} <button id="return-admin-btn" class="return-admin-btn">OK (Go to Admin)</button>`;
  t.classList.add('show');

  const btn = $('#return-admin-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      t.classList.remove('show');
      t.classList.remove('admin-return');
      const deleteToggle = $('#toggle-delete-mode');
      if (deleteToggle && deleteToggle.classList.contains('active')) {
        deleteToggle.classList.remove('active');
        deleteToggle.textContent = 'Delete Book Mode';
      }
      $all('.main-view').forEach(v => v.classList.add('hidden'));
      $('#admin-panel') && $('#admin-panel').classList.remove('hidden');
      $('#bottom-nav') && $('#bottom-nav').classList.add('hidden');
      renderBookCards(MOCK_BOOKS, 'new-arrivals');
      renderAdminPanelReservations();
      renderAdminNoticesList();
    });
  }

  t._to = setTimeout(() => { t.classList.remove('show'); t.classList.remove('admin-return'); }, 5000);
}

function switchView(viewName) {
  const deleteToggle = $('#toggle-delete-mode');
  if (deleteToggle && deleteToggle.classList.contains('active')) {
    showToast('Exit Delete Mode first.');
    return;
  }
  $all('.main-view').forEach(v => v.classList.add('hidden'));
  const viewEl = $(`#${viewName}-view`);
  viewEl && viewEl.classList.remove('hidden');

  if (viewName !== 'search' && $('#search-input')) {
    $('#search-input').value = '';
    handleSearch('');
  }

  if (viewName === 'home') renderBookCards(MOCK_BOOKS, 'new-arrivals');
  else if (viewName === 'notices') renderPublicNotices();

  $all('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const navBtn = $(`.nav-btn[data-view="${viewName}"]`);
  navBtn && navBtn.classList.add('active');
}

/* ======================
   Small safe helper
   ====================== */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=\/]/g, function (s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

/* ======================
   Event Listeners & Init
   ====================== */
document.addEventListener('DOMContentLoaded', () => {
  // Start Firestore listeners
  setupBooksListener();
  setupNoticesListener();

  // Time updater
  updateTimeAndDate();
  setInterval(updateTimeAndDate, 1000);

  // Nav buttons
  $all('.nav-btn').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      switchView(view);
    });
  });

  // Admin login flow
  const adminLoginBtn = $('#admin-login-btn');
  if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () => {
      $('#login-modal') && $('#login-modal').classList.remove('hidden');
      $('#admin-password') && ($('#admin-password').value = '');
      $('#admin-password') && $('#admin-password').focus();
    });
  }

  const loginCancel = $('#login-cancel');
  loginCancel && loginCancel.addEventListener('click', () => $('#login-modal') && $('#login-modal').classList.add('hidden'));

  const loginSubmit = $('#login-submit');
  loginSubmit && loginSubmit.addEventListener('click', () => {
    const inputPass = $('#admin-password') ? $('#admin-password').value : '';
    if (inputPass === ADMIN_PASSWORD) {
      $('#login-modal') && $('#login-modal').classList.add('hidden');
      $('#admin-panel') && $('#admin-panel').classList.remove('hidden');
      $all('.main-view').forEach(v => v.classList.add('hidden'));
      $('#bottom-nav') && $('#bottom-nav').classList.add('hidden');
      renderAdminPanelReservations();
      renderAdminNoticesList();
      showToast('Admin access granted.');
    } else {
      showToast('Incorrect password.');
    }
  });

  const adminLogout = $('#admin-logout');
  adminLogout && adminLogout.addEventListener('click', () => {
    $('#admin-panel') && $('#admin-panel').classList.add('hidden');
    $('#bottom-nav') && $('#bottom-nav').classList.remove('hidden');
    switchView('home');
    const deleteToggle = $('#toggle-delete-mode');
    if (deleteToggle) {
      deleteToggle.classList.remove('active');
      deleteToggle.textContent = 'Delete Book Mode';
    }
    renderBookCards(MOCK_BOOKS, 'new-arrivals');
    showToast('Logged out successfully.');
  });

  // Add book
  const addBookBtn = $('#add-book-submit');
  addBookBtn && addBookBtn.addEventListener('click', () => {
    const title = $('#add-title') ? $('#add-title').value.trim() : '';
    const author = $('#add-author') ? $('#add-author').value.trim() : '';
    const description = $('#add-description') ? $('#add-description').value.trim() : '';
    const fileInput = $('#add-cover-file');
    const file = (fileInput && fileInput.files && fileInput.files.length > 0) ? fileInput.files[0] : null;
    if (!title || !author) {
      showToast('Title and Author required!');
      return;
    }
    addBook(title, author, description, file);
  });

  // Delete mode toggle
  const toggleDelete = $('#toggle-delete-mode');
  toggleDelete && toggleDelete.addEventListener('click', function () {
    const isActive = this.classList.toggle('active');
    this.textContent = isActive ? 'Exit Delete Mode' : 'Delete Book Mode';
    renderBookCards(MOCK_BOOKS, 'new-arrivals');
    if (isActive) {
      $all('.main-view').forEach(v => v.classList.add('hidden'));
      $('#home-view') && $('#home-view').classList.remove('hidden');
      $('#bottom-nav') && $('#bottom-nav').classList.add('hidden');
      $('#admin-panel') && $('#admin-panel').classList.add('hidden');
      showToast('Delete Mode ON. Click trash to delete books.');
    } else {
      $('#admin-panel') && $('#admin-panel').classList.remove('hidden');
      showToast('Delete Mode OFF.');
    }
  });

  // Add notice
  const addNoticeBtn = $('#add-notice-submit');
  addNoticeBtn && addNoticeBtn.addEventListener('click', () => {
    const title = $('#notice-title') ? $('#notice-title').value.trim() : '';
    const content = $('#notice-content') ? $('#notice-content').value.trim() : '';
    if (!content) {
      showToast('Notice content cannot be empty.');
      return;
    }
    addNotice(title, content);
  });

  // Reservation modal submit/cancel
  $('#reserve-submit') && $('#reserve-submit').addEventListener('click', () => {
    const bookId = $('#book-id-to-reserve') ? $('#book-id-to-reserve').value : '';
    const name = $('#reserve-name') ? $('#reserve-name').value.trim() : '';
    const contact = $('#reserve-contact') ? $('#reserve-contact').value.trim() : '';
    if (!name || !contact) {
      showToast('Please fill name and contact.');
      return;
    }
    const book = MOCK_BOOKS.find(b => b.id === bookId);
    if (book) {
      reserveBook(book.id, name, contact, book.title);
    } else {
      showToast('Error: Book not found.');
    }
  });
  $('#reserve-cancel') && $('#reserve-cancel').addEventListener('click', () => {
    $('#reserve-form-modal') && $('#reserve-form-modal').classList.add('hidden');
    showToast('Reservation cancelled.');
  });

  // Modal background click handlers
  const reserveModal = $('#reserve-form-modal');
  reserveModal && reserveModal.querySelector('.modal-bg') && reserveModal.querySelector('.modal-bg').addEventListener('click', () => {
    reserveModal.classList.add('hidden');
    showToast('Reservation cancelled.');
  });

  const loginModal = $('#login-modal');
  loginModal && loginModal.querySelector('.modal-bg') && loginModal.querySelector('.modal-bg').addEventListener('click', () => {
    loginModal.classList.add('hidden');
  });

  // Search input listener
  const searchInput = $('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchView = $('#search-view');
      if (searchView && !searchView.classList.contains('hidden')) {
        handleSearch(e.target.value);
      }
    });
  }
});

/* ======================
   End of file
   ====================== */
