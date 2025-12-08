// =================================================================
// === SERVICE WORKER REGISTRATION ===
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
// === FIREBASE CONFIGURATION AND INITIALIZATION ===
// =================================================================
let db;
let storage;

const firebaseConfig = {
    apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
    authDomain: "pb-library-1501a.firebaseapp.com",
    projectId: "pb-library-1501a",
    storageBucket: "pb-library-1501a.appspot.com", // fixed URL
    messagingSenderId: "351111194912",
    appId: "1:351111194912:web:a24d7385a22ac51e220f45"
};

if (typeof firebase === 'undefined') {
    console.error("Firebase SDK not loaded! Ensure firebase-app, firestore, and storage scripts are linked.");
} else {
    const app = firebase.initializeApp(firebaseConfig);
    db = app.firestore();
    storage = app.storage();
}

// =================================================================
// === DOM UTILITY FUNCTIONS ===
// =================================================================
const $ = (selector) => document.querySelector(selector);
const $all = (selector) => document.querySelectorAll(selector);

// =================================================================
// === GLOBAL STATE & CONSTANTS ===
// =================================================================
let MOCK_BOOKS = [];
let LIBRARY_NOTICES = [];
const ADMIN_PASSWORD = "admin";

// =================================================================
// === TIME & DATE HELPERS ===
// =================================================================
function updateTimeAndDate() {
    const now = new Date();

    // Desktop
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    if ($('#date-text')) $('#date-text').textContent = now.toLocaleDateString('en-US', optionsDate);
    if ($('#day-number')) $('#day-number').textContent = now.getDate().toString().padStart(2, '0');
    if ($('#time-text')) $('#time-text').textContent = now.toLocaleTimeString('en-US', optionsTime);

    // Mobile single-line
    const mobileDateTimeElement = $('#mobile-date-time-line');
    if (mobileDateTimeElement) {
        const datePart = now.toLocaleDateString('en-GB');
        const optionsCompactTime = { hour: '2-digit', minute: '2-digit', hour12: true };
        const timePart = now.toLocaleTimeString('en-US', optionsCompactTime);
        mobileDateTimeElement.textContent = `${datePart} | ${timePart}`;
    }
}

// =================================================================
// === FIREBASE DATA FUNCTIONS (EMPTY TEMPLATES) ===
// =================================================================
function setupBooksListener() {
    console.log("setupBooksListener called");
}

function setupNoticesListener() {
    console.log("setupNoticesListener called");
}

async function addBook(title, author, description, file) {
    console.log("addBook called", title, author);
}

async function saveBookToFirestore(title, author, description, coverUrl) {
    console.log("saveBookToFirestore called", title, author, coverUrl);
}

async function deleteBook(bookId, title) {
    console.log("deleteBook called", bookId, title);
}

async function reserveBook(bookId, name, contact, bookTitle) {
    console.log("reserveBook called", bookId, name);
}

async function releaseReservation(bookId, title) {
    console.log("releaseReservation called", bookId, title);
}

async function addNotice(title, content) {
    console.log("addNotice called", title, content);
}

async function deleteNotice(noticeId) {
    console.log("deleteNotice called", noticeId);
}

function handleSearch(query) {
    console.log("handleSearch called", query);
}

function renderBookCards(books, containerId) {
    console.log("renderBookCards called", containerId);
}

function renderAdminPanelReservations() {
    console.log("renderAdminPanelReservations called");
}

function renderAdminNoticesList() {
    console.log("renderAdminNoticesList called");
}

function renderPublicNotices() {
    console.log("renderPublicNotices called");
}

function showReserveFormModal(book) {
    console.log("showReserveFormModal called", book);
}

function showBookDetailModal(book) {
    console.log("showBookDetailModal called", book);
}

function showToast(msg) {
    console.log("Toast:", msg);
}

function showAdminPanelReturnToast(msg) {
    console.log("Admin Toast:", msg);
}

function switchView(viewName) {
    console.log("switchView called", viewName);
}

// =================================================================
// === ONE SIGNAL INTEGRATION ===
// =================================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.action === "openNoticePanel") {
            openNoticePanel();
        }
    });
}

function openNoticePanel() {
    const noticesView = document.getElementById("notices-view");
    if (noticesView) {
        $all('.main-view').forEach(v => v.classList.add('hidden'));
        noticesView.classList.remove('hidden');
        const panel = $('#notices-view .notice-area') || noticesView;
        panel.scrollIntoView({ behavior: "smooth" });
        console.log("openNoticePanel triggered");
    }
}

// =================================================================
// === EVENT LISTENERS & INITIALIZATION ===
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    setupBooksListener();
    setupNoticesListener();

    const params = new URLSearchParams(window.location.search);
    if (params.get("openNotice") === "true") {
        openNoticePanel();
    }

    updateTimeAndDate();
    setInterval(updateTimeAndDate, 1000);

    $all('.nav-btn').forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            switchView(view);
        });
    });

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
// === PRELOADER HIDING LOGIC ===
// ====================================================================
window.addEventListener('load', function() {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.classList.add('hidden-preloader');
        setTimeout(() => { preloader.remove(); }, 500);
    }
});
