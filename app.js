// =================================================================
// === SERVICE WORKER REGISTRATION (NEW CODE ADDED HERE) ===
// =================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker registered successfully!', reg.scope);
            })
            .catch(err => {
                console.error('Service Worker registration failed:', err);
            });
    });
}

// =================================================================
// === FIREBASE CONFIGURATION AND INITIALIZATION (START) ===
// =================================================================

// 1. Declare db and storage globally using 'let'
let db;
let storage;

const firebaseConfig = {
    // ⚠️ REPLACE ALL PLACEHOLDER VALUES WITH YOUR ACTUAL CREDENTIALS ⚠️
    apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
    authDomain: "pb-library-1501a.firebaseapp.com",
    projectId: "pb-library-1501a",
    storageBucket: "pb-library-1501a.firebasestorage.app",
    messagingSenderId: "351111194912",
    appId: "1:351111194912:web:a24d7385a22ac51e220f45"
};

// Check if Firebase is available (it should be loaded via <script> tags in index.html)
if (typeof firebase === 'undefined') {
    console.error("Firebase SDK not loaded! Ensure you have linked firebase-app, firestore, and storage scripts in your index.html.");
} else {
    // Initialize Firebase App
    const app = firebase.initializeApp(firebaseConfig);

    // 2. Initialize and assign to the global 'let' variables
    db = app.firestore();
    storage = app.storage();
}

// =================================================================
// === FIREBASE CONFIGURATION AND INITIALIZATION (END) ===
// =================================================================


// --- DOM Utility Functions ---
const $ = (selector) => document.querySelector(selector);
const $all = (selector) => document.querySelectorAll(selector);

// ✅ ONE SIGNAL INTEGRATION: Message listener from SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.action === "openNoticePanel") {
      openNoticePanel();
    }
  });
}

// --- GLOBAL STATE and Constants ---
let MOCK_BOOKS = [];
let LIBRARY_NOTICES = [];
const ADMIN_PASSWORD = "admin";

// --- Time and Date Helpers ---
function updateTimeAndDate() {
    const now = new Date();

    // 1. Desktop elements
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };

    if ($('#date-text')) $('#date-text').textContent = now.toLocaleDateString('en-US', optionsDate);
    if ($('#day-number')) $('#day-number').textContent = now.getDate().toString().padStart(2, '0'); // Ensures DD format
    if ($('#time-text')) $('#time-text').textContent = now.toLocaleTimeString('en-US', optionsTime);

    // 2. NEW: Mobile Single-Line Date/Time (dd/mm/yyyy | hh:mm AM/PM)
    const mobileDateTimeElement = $('#mobile-date-time-line');
    if (mobileDateTimeElement) {
        const datePart = now.toLocaleDateString('en-GB'); // 'en-GB' format gives dd/mm/yyyy
        const optionsCompactTime = { hour: '2-digit', minute: '2-digit', hour12: true };
        const timePart = now.toLocaleTimeString('en-US', optionsCompactTime);
        mobileDateTimeElement.textContent = `${datePart} | ${timePart}`;
    }
}

// ------------------------------------------------------------------
// --- FIREBASE DATA FUNCTIONS ---
// ------------------------------------------------------------------

function setupBooksListener() { ... } // (kept unchanged)
function setupNoticesListener() { ... } // (kept unchanged)
async function addBook(title, author, description, file) { ... } // (kept unchanged)
async function saveBookToFirestore(title, author, description, coverUrl) { ... } // (kept unchanged)
async function deleteBook(bookId, title) { ... } // (kept unchanged)
async function reserveBook(bookId, name, contact, bookTitle) { ... } // (kept unchanged)
async function releaseReservation(bookId, title) { ... } // (kept unchanged)
async function addNotice(title, content) { ... } // (kept unchanged)
async function deleteNotice(noticeId) { ... } // (kept unchanged)
function handleSearch(query) { ... } // (kept unchanged)
function renderBookCards(books, containerId) { ... } // (kept unchanged)
function renderAdminPanelReservations() { ... } // (kept unchanged)
function renderAdminNoticesList() { ... } // (kept unchanged)
function renderPublicNotices() { ... } // (kept unchanged)
function showReserveFormModal(book) { ... } // (kept unchanged)
function showBookDetailModal(book) { ... } // (kept unchanged)
function showToast(msg) { ... } // (kept unchanged)
function showAdminPanelReturnToast(msg) { ... } // (kept unchanged)
function switchView(viewName) { ... } // (kept unchanged)

// ✅ ONE SIGNAL INTEGRATION: Function to open notice panel
function openNoticePanel() {
    const noticesView = document.getElementById("notices-view");
    if (noticesView) {
        $all('.main-view').forEach(v => v.classList.add('hidden'));
        noticesView.classList.remove('hidden');

        const panel = $('#notices-view .notice-area') || noticesView;
        panel.scrollIntoView({ behavior: "smooth" });
        console.log("openNoticePanel triggered"); // Debug log
    }
}

// ------------------------------------------------------------------
// --- Event Listeners and Initialization ---
// ------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {

    // 1. Data Initialization (Start Firebase Listeners)
    setupBooksListener();
    setupNoticesListener();

    // ✅ ONE SIGNAL INTEGRATION: auto-open if query param ?openNotice=true
    const params = new URLSearchParams(window.location.search);
    if (params.get("openNotice") === "true") {
        openNoticePanel();
    }

    updateTimeAndDate();
    setInterval(updateTimeAndDate, 1000);

    // 2. Navigation Event Listeners
    $all('.nav-btn').forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            switchView(view);
        });
    });

    // 3. Admin Login/Logout logic (kept unchanged)
    // 4. Add Book logic (kept unchanged)
    // 5. Delete Mode Toggle logic (kept unchanged)
    // 6. Add Notice logic (kept unchanged)
    // 7. Reservation Form Modal logic (kept unchanged)

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

// ====================================================================
// === PRELOADER HIDING LOGIC (PLACED OUTSIDE DOMContentLoaded) ===
// ====================================================================

window.addEventListener('load', function() {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.classList.add('hidden-preloader');
        setTimeout(() => { preloader.remove(); }, 500);
    }
});
