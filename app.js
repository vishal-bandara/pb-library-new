// =================================================================
// === SERVICE WORKER REGISTRATION ===
// =================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js')
            .then(function(reg) {
                console.log('Service Worker registered successfully!', reg.scope);
            })
            .catch(function(err) {
                console.error('Service Worker registration failed:', err);
            });
    });
}

// =================================================================
// === FIREBASE CONFIGURATION AND INITIALIZATION ===
// =================================================================

let db;
let storage;

var firebaseConfig = {
    apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
    authDomain: "pb-library-1501a.firebaseapp.com",
    projectId: "pb-library-1501a",
    storageBucket: "pb-library-1501a.firebasestorage.app",
    messagingSenderId: "351111194912",
    appId: "1:351111194912:web:a24d7385a22ac51e220f45"
};

if (typeof firebase === 'undefined') {
    console.error("Firebase SDK not loaded! Ensure scripts are included in index.html.");
} else {
    var app = firebase.initializeApp(firebaseConfig);
    db = app.firestore();
    storage = app.storage();
}

// =================================================================
// === DOM UTILITY ===
// =================================================================

var $ = function(selector) { return document.querySelector(selector); };
var $all = function(selector) { return document.querySelectorAll(selector); };

// =================================================================
// === GLOBAL STATE ===
// =================================================================

var MOCK_BOOKS = [];
var LIBRARY_NOTICES = [];
var ADMIN_PASSWORD = "admin";

// =================================================================
// === TIME AND DATE ===
// =================================================================

function updateTimeAndDate() {
    var now = new Date();

    var optionsDate = { weekday: 'long', year: 'numeric', month: 'long' };
    var optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };

    if ($('#date-text')) $('#date-text').textContent = now.toLocaleDateString('en-US', optionsDate);
    if ($('#day-number')) $('#day-number').textContent = now.getDate().toString().padStart(2,'0');
    if ($('#time-text')) $('#time-text').textContent = now.toLocaleTimeString('en-US', optionsTime);

    var mobileDateTimeElement = $('#mobile-date-time-line');
    if (mobileDateTimeElement) {
        var datePart = now.toLocaleDateString('en-GB');
        var optionsCompactTime = { hour:'2-digit', minute:'2-digit', hour12:true };
        var timePart = now.toLocaleTimeString('en-US', optionsCompactTime);
        mobileDateTimeElement.textContent = datePart + ' | ' + timePart;
    }
}

// =================================================================
// === FIREBASE DATA FUNCTIONS ===
// =================================================================

function setupBooksListener() {
    if (typeof db === 'undefined') { console.error("db not defined"); return; }
    var booksRef = db.collection("books").orderBy("createdAt", "desc");

    booksRef.onSnapshot(function(snapshot) {
        MOCK_BOOKS = snapshot.docs.map(function(doc) {
            return Object.assign({ id: doc.id }, doc.data());
        });

        var currentSearchQuery = $('#search-input') ? $('#search-input').value.trim() : '';
        var activeView = $all('.main-view:not(.hidden)')[0];
        var activeViewId = activeView ? activeView.id.replace('-view','') : 'home';

        if (activeViewId === 'search' && currentSearchQuery) {
            handleSearch(currentSearchQuery);
        } else {
            renderBookCards(MOCK_BOOKS, 'new-arrivals');
        }
    }, function(error) {
        console.error("Error setting up books listener:", error);
        showToast("Error loading books from database.");
    });
}

function setupNoticesListener() {
    if (typeof db === 'undefined') return;
    var noticesRef = db.collection("notices").orderBy("dateAdded","desc");

    noticesRef.onSnapshot(function(snapshot){
        LIBRARY_NOTICES = snapshot.docs.map(function(doc) {
            return Object.assign({ id: doc.id }, doc.data());
        });
        renderPublicNotices();
        if (!$('#admin-panel').classList.contains('hidden')) renderAdminNoticesList();
    }, function(error) {
        console.error("Error setting up notices listener:", error);
    });
}

// =================================================================
// === CRUD FUNCTIONS ===
// =================================================================

async function addBook(title, author, description, file) {
    if (typeof db === 'undefined') return showToast("Database not connected.");
    showToast("Adding '"+title+"'... Please wait.");

    var uploadProgress = $('#upload-progress');
    uploadProgress.classList.add('hidden');
    var coverUrl = 'https://via.placeholder.com/180x280?text=No+Cover';

    try {
        if (file && typeof storage !== 'undefined') {
            uploadProgress.classList.remove('hidden');
            var storageRef = storage.ref('covers/'+Date.now()+'_'+file.name);
            var uploadTask = storageRef.put(file);

            await new Promise(function(resolve,reject){
                uploadTask.on('state_changed', function(snapshot){
                    var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    uploadProgress.value = progress;
                }, function(error){
                    console.error("Image upload failed:",error);
                    showToast("Image upload failed. Adding book without cover.");
                    reject(error);
                }, async function() {
                    try {
                        coverUrl = await storageRef.getDownloadURL();
                        resolve();
                    } catch(e){ reject(e); }
                });
            });
            uploadProgress.classList.add('hidden');
        }

        await saveBookToFirestore(title, author, description, coverUrl);

        $('#add-title').value='';
        $('#add-author').value='';
        $('#add-description').value='';
        $('#add-cover-file').value='';

    } catch(e) {
        console.error("Error during addBook process:", e);
        showToast("An error occurred while adding the book.");
    }
}

async function saveBookToFirestore(title, author, description, coverUrl) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("books").add({
            title: title,
            author: author,
            description: description,
            cover: coverUrl,
            reserved: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Book "'+title+'" added successfully!');
    } catch(e) {
        console.error("Error saving book data:", e);
        showToast("Error saving book data to Firestore.");
    }
}

async function deleteBook(bookId, title) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("books").doc(bookId).delete();
        showAdminPanelReturnToast('Deleted: "'+title+'"');
    } catch(e) {
        console.error("Error deleting book:", e);
        showToast("Error deleting book from database.");
    }
}

async function reserveBook(bookId, name, contact, bookTitle) {
    if (typeof db === 'undefined') return;
    try {
        var dueDate = new Date();
        dueDate.setDate(dueDate.getDate()+7);

        var reservationData = {
            name: name,
            contact: contact,
            dateReserved: new Date().toLocaleDateString(),
            dueDate: dueDate.toLocaleDateString(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("books").doc(bookId).update({ reserved: reservationData });
        $('#reserve-form-modal').classList.add('hidden');
        showToast('"' + bookTitle + '" reserved by ' + name + '!');
    } catch(e) {
        console.error("Error reserving book:", e);
        showToast("Error reserving book.");
    }
}

async function releaseReservation(bookId, title) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("books").doc(bookId).update({ reserved: null });
        showToast('Reservation for "'+title+'" has been released.');
    } catch(e) {
        console.error("Error releasing reservation:", e);
        showToast("Error releasing reservation.");
    }
}

async function addNotice(title, content) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("notices").add({
            title: title,
            content: content,
            date: new Date().toLocaleDateString(),
            dateAdded: firebase.firestore.FieldValue.serverTimestamp()
        });
        $('#notice-title').value='';
        $('#notice-content').value='';
        showToast('New notice posted successfully!');
    } catch(e) {
        console.error("Error adding notice:", e);
        showToast("Error posting notice.");
    }
}

async function deleteNotice(noticeId) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("notices").doc(noticeId).delete();
        showToast('Notice deleted successfully.');
    } catch(e) {
        console.error("Error deleting notice:", e);
        showToast('Error deleting notice.');
    }
}

// =================================================================
// === SEARCH AND RENDER FUNCTIONS ===
// =================================================================

// handleSearch(), renderBookCards(), renderAdminPanelReservations(), renderAdminNoticesList(), renderPublicNotices()
// Keep the same as your original code, just ensure no spread operator is used

// =================================================================
// === MODAL, TOAST, NAVIGATION FUNCTIONS ===
// =================================================================

// showReserveFormModal(), showBookDetailModal(), showToast(), showAdminPanelReturnToast(), switchView()
// Keep the same as your original code, no changes needed

// =================================================================
// === EVENT LISTENERS AND INITIALIZATION ===
// =================================================================

document.addEventListener('DOMContentLoaded', function(){

    setupBooksListener();
    setupNoticesListener();

    updateTimeAndDate();
    setInterval(updateTimeAndDate, 1000);

    // All your navigation, admin login/logout, add book/notice, reserve form, delete mode logic
    // No changes needed

    // Optional: OneSignal initialization code can go here if you want push notifications
});
