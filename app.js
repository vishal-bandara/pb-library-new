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
        // Date part: dd/mm/yyyy
        const datePart = now.toLocaleDateString('en-GB'); // 'en-GB' format gives dd/mm/yyyy

        // Time part: hh:mm AM/PM (short format)
        const optionsCompactTime = { hour: '2-digit', minute: '2-digit', hour12: true };
        const timePart = now.toLocaleTimeString('en-US', optionsCompactTime);
        
        mobileDateTimeElement.textContent = `${datePart} | ${timePart}`;
    }
}

// ------------------------------------------------------------------
// --- FIREBASE DATA FUNCTIONS ---
// ------------------------------------------------------------------

/**
 * Loads books and sets up real-time listener.
 */
function setupBooksListener() {
    if (typeof db === 'undefined') {
        console.error("Firebase 'db' is not defined. Initialization failed.");
        return;
    }
    const booksRef = db.collection("books").orderBy("createdAt", "desc");

    booksRef.onSnapshot(snapshot => {
        MOCK_BOOKS = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // When books are loaded/updated, re-render based on current search query (if any)
        const currentSearchQuery = $('#search-input') ? $('#search-input').value.trim() : '';
        
        // Find the currently active view
        const activeView = $all('.main-view:not(.hidden)')[0];
        const activeViewId = activeView ? activeView.id.replace('-view', '') : 'home';


        if (activeViewId === 'search' && currentSearchQuery) {
            handleSearch(currentSearchQuery); // Re-run search if on search view with a query
        } else {
            // Default to rendering new arrivals on the home view
            renderBookCards(MOCK_BOOKS, 'new-arrivals');
        }
        
    }, error => {
        console.error("Error setting up books listener:", error);
        showToast("Error loading books from database.");
    });
}

/**
 * Loads notices and sets up real-time listener.
 */
function setupNoticesListener() {
    if (typeof db === 'undefined') return;

    const noticesRef = db.collection("notices").orderBy("dateAdded", "desc");

    noticesRef.onSnapshot(snapshot => {
        LIBRARY_NOTICES = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderPublicNotices();
        if (!$('#admin-panel').classList.contains('hidden')) renderAdminNoticesList();
    }, error => {
        console.error("Error setting up notices listener:", error);
    });
}


/**
 * Saves a new book to Firestore and handles image upload to Storage.
 */
async function addBook(title, author, description, file) {
    if (typeof db === 'undefined') return showToast("Database not connected.");

    showToast(`Adding "${title}"... Please wait.`);
    const uploadProgress = $('#upload-progress');
    uploadProgress.classList.add('hidden');

    let coverUrl = 'https://via.placeholder.com/180x280?text=No+Cover';

    try {
        if (file && typeof storage !== 'undefined') {
            uploadProgress.classList.remove('hidden');

            const storageRef = storage.ref(`covers/${Date.now()}_${file.name}`);
            const uploadTask = storageRef.put(file);

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        uploadProgress.value = progress;
                    },
                    (error) => {
                        console.error("Image upload failed:", error);
                        showToast("Image upload failed. Adding book without cover.");
                        reject(error);
                    },
                    async () => {
                        try {
                            coverUrl = await storageRef.getDownloadURL();
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
            uploadProgress.classList.add('hidden');
        }

        await saveBookToFirestore(title, author, description, coverUrl);

        // Clear form fields
        $('#add-title').value = '';
        $('#add-author').value = '';
        $('#add-description').value = '';
        $('#add-cover-file').value = '';

    } catch (e) {
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
        showToast(`Book "${title}" added successfully!`);
    } catch (e) {
        console.error("Error saving book data:", e);
        showToast("Error saving book data to Firestore.");
    }
}


/**
 * Deletes a book from Firestore.
 */
async function deleteBook(bookId, title) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("books").doc(bookId).delete();
        showAdminPanelReturnToast(`Deleted: "${title}"`);
    } catch (e) {
        console.error("Error deleting book:", e);
        showToast("Error deleting book from database.");
    }
}


/**
 * Reserves a book in Firestore.
 */
async function reserveBook(bookId, name, contact, bookTitle) {
    if (typeof db === 'undefined') return;
    try {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const reservationData = {
            name: name,
            contact: contact,
            dateReserved: new Date().toLocaleDateString(),
            dueDate: dueDate.toLocaleDateString(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("books").doc(bookId).update({
            reserved: reservationData
        });

        $('#reserve-form-modal').classList.add('hidden');
        showToast(`"${bookTitle}" reserved by ${name}!`);

    } catch (e) {
        console.error("Error reserving book:", e);
        showToast("Error reserving book.");
    }
}

/**
 * Releases a book reservation in Firestore.
 */
async function releaseReservation(bookId, title) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("books").doc(bookId).update({
            reserved: null
        });
        showToast(`Reservation for "${title}" has been released.`);
    } catch (e) {
        console.error("Error releasing reservation:", e);
        showToast("Error releasing reservation.");
    }
}

/**
 * Adds a new notice to Firestore.
 */
async function addNotice(title, content) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("notices").add({
            title: title,
            content: content,
            date: new Date().toLocaleDateString(),
            dateAdded: firebase.firestore.FieldValue.serverTimestamp()
        });

        $('#notice-title').value = '';
        $('#notice-content').value = '';

        showToast('New notice posted successfully!');

    } catch (e) {
        console.error("Error adding notice:", e);
        showToast("Error posting notice.");
    }
}

/**
 * Deletes a notice from Firestore.
 */
async function deleteNotice(noticeId) {
    if (typeof db === 'undefined') return;
    try {
        await db.collection("notices").doc(noticeId).delete();
        showToast('Notice deleted successfully.');
    } catch (e) {
        console.error("Error deleting notice:", e);
        showToast('Error deleting notice.');
    }
}

// ------------------------------------------------------------------
// --- VOICE SEARCH SETUP ---
// ------------------------------------------------------------------

function setupVoiceSearch() {
    const searchInput = document.getElementById('search-input');
    const voiceBtn = document.getElementById('voice-btn');
    const langSelect = document.getElementById('voice-lang'); 

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && voiceBtn && langSelect) {
        const recognition = new SpeechRecognition();
        
        recognition.continuous = false;

        // START LISTENING
        voiceBtn.addEventListener('click', () => {
            // Get language from dropdown (Default to Sinhala if missing)
            recognition.lang = langSelect.value || 'si-LK'; 
            recognition.start();
        });

        // VISUAL FEEDBACK
        recognition.onstart = () => {
            voiceBtn.style.transform = "scale(1.2)";
            searchInput.placeholder = (recognition.lang === 'si-LK') ? "කතා කරන්න..." : "Listening...";
        };

        recognition.onend = () => {
            voiceBtn.style.transform = "scale(1)";
            searchInput.placeholder = "Search by title or author...";
        };

        // HANDLING RESULTS
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            
            // 1. Show text in box
            searchInput.value = transcript;
            
            // 2. Run Search
            handleSearch(transcript);
        };

    } else {
        console.warn("Voice search failed: Browser not supported or elements missing.");
        if(voiceBtn) voiceBtn.style.display = 'none';
    }
}

// ------------------------------------------------------------------
// --- SEARCH LOGIC (FIXED) ---
// ------------------------------------------------------------------

function handleSearch(query) {
    const trimmedQuery = query.toLowerCase().replace(/\.$/, "").trim();
    const resultsContainerId = 'search-results-list';

    if (trimmedQuery.length > 0) {
        const filteredBooks = MOCK_BOOKS.filter(book => {
            const titleMatch = book.title && book.title.toLowerCase().includes(trimmedQuery);
            const authorMatch = book.author && book.author.toLowerCase().includes(trimmedQuery);
            return titleMatch || authorMatch;
        });
        
        // Ensure renderBookCards is defined in your code!
        if (typeof renderBookCards === "function") {
            renderBookCards(filteredBooks, resultsContainerId);
        }
        
    } else {
        // --- THE FIX IS HERE ---
        // Old code: const container = $(`#${resultsContainerId}`);  <-- CAUSED CRASH
        // New code:
        const container = document.getElementById(resultsContainerId);
        
        if (container) {
            container.innerHTML = `
                <p style="text-align: center; color: var(--muted); padding: 20px;">
                    Search New Arrivals.
                </p>
            `;
        }
    }
}

// ------------------------------------------------------------------
// --- INITIALIZATION (CRITICAL STEP) ---
// ------------------------------------------------------------------

// You must call this so the button actually starts working!
document.addEventListener('DOMContentLoaded', () => {
    setupVoiceSearch();
});

// ------------------------------------------------------------------
// --- UI Rendering Functions (REFACTORED) ---
// ------------------------------------------------------------------

/**
 * Renders the book cards into a specified container.
 * @param {Array} books The array of book objects to render.
 * @param {string} containerId The ID of the HTML element to render into (e.g., 'new-arrivals', 'search-results-list').
 */
function renderBookCards(books, containerId) {
    const container = $(`#${containerId}`);
    if (!container) return;

    container.innerHTML = '';

    // Only apply delete mode logic if the rendering container is for the home view
    const isDeleteMode = (containerId === 'new-arrivals') && 
                         $('#toggle-delete-mode') && 
                         $('#toggle-delete-mode').classList.contains('active');

    if (books.length === 0) {
        const searchQuery = $('#search-input') ? $('#search-input').value.trim() : '';
        let message = '<p style="color: var(--muted); width: 100%; padding: 20px 0;">No books found in the library.</p>';

        if (containerId === 'search-results-list' && searchQuery) {
             message = `<p style="color: var(--muted); width: 100%; padding: 20px 0;">No books found matching "${searchQuery}".</p>`;
        } else if (containerId === 'search-results-list' && !searchQuery) {
            // Already handled by handleSearch for empty query, but as a fallback:
             message = `<p style="color: var(--muted); width: 100%; padding: 20px 0;">Start typing above to search the library catalogue.</p>`;
        }
        
        container.innerHTML = message;
        return;
    }

    books.forEach((book) => {
        const card = document.createElement('div');
        card.classList.add('card');
        card.dataset.bookId = book.id;

        if (book.reserved) {
            card.classList.add('reserved');
        }

        if (isDeleteMode) {
            card.classList.add('delete-mode');
        }

        card.innerHTML = `
            ${isDeleteMode ? `<button class="delete-book-btn" data-id="${book.id}" data-title="${book.title}"><i class="fas fa-trash"></i></button>` : ''}
            ${book.reserved ? `<div class="reserved-overlay">RESERVED</div>` : ''}
            <div class="cover" style="background-image: url('${book.cover}');"></div>
            <div class="meta">
                <p class="title">${book.title}</p>
                <p class="author">${book.author}</p>
            </div>
        `;

        if (!isDeleteMode) {
            card.addEventListener('click', () => showBookDetailModal(book));
        }

        container.appendChild(card);
    });

    // Attach delete listeners only if in delete mode
    if (isDeleteMode) {
        $all('.delete-book-btn').forEach(button => {
            button.addEventListener('click', (e) => {
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


/**
 * Renders the content of the Reservation Management section in the Admin Panel.
 */
function renderAdminPanelReservations() {
    const listContainer = $('#reservations-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const reservedBooks = MOCK_BOOKS.filter(book => book.reserved);

    if (reservedBooks.length === 0) {
        listContainer.innerHTML = '<p style="color: #ccc;">No active reservations found.</p>';
        return;
    }

    reservedBooks.forEach((book) => {
        const detailDiv = document.createElement('div');
        detailDiv.classList.add('reservation-details');
        detailDiv.innerHTML = `
            <p><strong>Book:</strong> ${book.title}</p>
            <p><strong>Reserved By:</strong> ${book.reserved.name}</p>
            <p><strong>Contact:</strong> ${book.reserved.contact}</p>
            <p><strong>Due:</strong> ${book.reserved.dueDate}</p>
            <button class="primary release-reservation-btn" data-book-id="${book.id}" data-title="${book.title}">Release Book</button>
        `;
        listContainer.appendChild(detailDiv);
    });

    $all('.release-reservation-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.bookId;
            const title = e.currentTarget.dataset.title;
            releaseReservation(id, title);
        });
    });
}

/**
 * Renders the list of active notices in the Admin Panel for deletion.
 */
function renderAdminNoticesList() {
    const listContainer = $('#active-notices-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (LIBRARY_NOTICES.length === 0) {
        listContainer.innerHTML = '<p style="color: #ccc; font-size: 0.9em;">(No active notices)</p>';
        return;
    }

    LIBRARY_NOTICES.forEach((notice) => {
        const noticeDiv = document.createElement('div');
        noticeDiv.classList.add('reservation-details');
        noticeDiv.innerHTML = `
            <p><strong>Title:</strong> ${notice.title || 'N/A'}</p>
            <p style="font-size: 13px;">${notice.content.substring(0, 40)}...</p>
            <button class="primary release-reservation-btn delete-notice-btn" data-id="${notice.id}" style="background: #e85d3f;">Delete Notice</button>
        `;
        listContainer.appendChild(noticeDiv);
    });

    $all('.delete-notice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm(`Are you sure you want to delete this notice?`)) {
                deleteNotice(id);
            }
        });
    });
}

/**
 * Renders the public library notices on the notices view.
 */
function renderPublicNotices() {
    const container = $('#notices-view .notice-area');
    if (!container) return;

    container.innerHTML = '';

    if (LIBRARY_NOTICES.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 20px;">No active library notices at this time.</p>';
        return;
    }

    LIBRARY_NOTICES.forEach(notice => {
        const noticeElement = document.createElement('div');
        noticeElement.classList.add('notice-area');
        noticeElement.style.background = 'white';
        noticeElement.style.borderLeft = '4px solid var(--accent)';
        noticeElement.style.marginBottom = '10px';
        noticeElement.innerHTML = `
            <p style="margin: 0; font-weight: 700; color: var(--accent); font-size: 14px;">${notice.title || 'Library Update'}</p>
            <p style="margin: 5px 0 0 0; font-size: 16px;">${notice.content}</p>
            <p style="margin: 10px 0 0 0; font-size: 11px; color: var(--muted); text-align: right;">Posted: ${notice.date}</p>
        `;
        container.appendChild(noticeElement);
    });
}


// ------------------------------------------------------------------
// --- Modal and View Functions ---
// ------------------------------------------------------------------

function showReserveFormModal(book) {
    const modal = $('#reserve-form-modal');
    if (!modal) return;

    $('#reserve-modal-title').textContent = `Reserve Book: ${book.title}`;
    $('#book-id-to-reserve').value = book.id;
    $('#reserve-name').value = '';
    $('#reserve-contact').value = '';

    modal.classList.remove('hidden');
    $('#reserve-name').focus();
}

function showBookDetailModal(book) {
    const modal = $('#book-detail-modal');
    const panel = $('#book-detail-panel');
    if (!modal || !panel) return;

    panel.innerHTML = `
        <div class="book-details-content">
            <div class="book-cover-display" style="background-image: url('${book.cover}');"></div>
            <div class="book-info">
                <h3>${book.title}</h3>
                <p class="author-text">by ${book.author}</p>
                <p class="description-text">${book.description}</p>
                ${book.reserved
                    ? `<p class="reserved-status-text">Reserved until: ${book.reserved.dueDate}</p>`
                    : `<button class="primary" id="reserve-btn">Reserve This Book</button>`
                }
            </div>
        </div>
        <button class="link" id="close-detail-modal" style="margin-top: 20px;">Close</button>
    `;

    if (!book.reserved) {
        $('#reserve-btn').addEventListener('click', () => {
            modal.classList.add('hidden');
            showReserveFormModal(book);
        });
    }

    $('#close-detail-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.querySelector('.modal-bg').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
}

function showToast(msg) {
    const t = $("#toast");
    if (!t) return;
    clearTimeout(t._to);
    t.classList.remove('admin-return');
    t.innerHTML = msg;
    t.classList.add('show');
    t._to = setTimeout(() => {
        t.classList.remove('show');
    }, 3000);
}

function showAdminPanelReturnToast(msg) {
    const t = $("#toast");
    if (!t) return;
    clearTimeout(t._to);
    t.classList.remove('show');
    t.classList.add('admin-return');

    t.innerHTML = `${msg} <button id="return-admin-btn" class="return-admin-btn">OK (Go to Admin)</button>`;
    t.classList.add('show');

    $('#return-admin-btn').addEventListener('click', () => {
        t.classList.remove('show');
        t.classList.remove('admin-return');

        const deleteToggle = $('#toggle-delete-mode');
        if (deleteToggle && deleteToggle.classList.contains('active')) {
            deleteToggle.classList.remove('active');
            deleteToggle.textContent = 'Delete Book Mode';
        }

        $all('.main-view').forEach(v => v.classList.add('hidden'));
        $('#admin-panel').classList.remove('hidden');
        $('#bottom-nav').classList.add('hidden');

        renderBookCards(MOCK_BOOKS, 'new-arrivals');
        renderAdminPanelReservations();
        renderAdminNoticesList();
    });

    t._to = setTimeout(() => {
        t.classList.remove('show');
        t.classList.remove('admin-return');
    }, 5000);
}


function switchView(viewName) {
    const deleteToggle = $('#toggle-delete-mode');

    if (deleteToggle && deleteToggle.classList.contains('active')) {
        showToast("Exit Delete Mode first.");
        return;
    }

    $all('.main-view').forEach(view => view.classList.add('hidden'));
    $(`#${viewName}-view`).classList.remove('hidden');
    
    // Clear search input and results when switching away from search view
    const searchInput = $('#search-input');
    if (viewName !== 'search' && searchInput) {
        searchInput.value = '';
        handleSearch(''); // Clears search results list
    }
    
    // Re-render books in the current view
    if (viewName === 'home') {
        renderBookCards(MOCK_BOOKS, 'new-arrivals');
    } else if (viewName === 'notices') {
        renderPublicNotices();
    }


    $all('.nav-btn').forEach(btn => btn.classList.remove('active'));
    $(`.nav-btn[data-view="${viewName}"]`).classList.add('active');
}

// ------------------------------------------------------------------
// --- Event Listeners and Initialization ---
// ------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {

    // 1. Data Initialization (Start Firebase Listeners)
    setupBooksListener();
    setupNoticesListener();

    updateTimeAndDate();
    setInterval(updateTimeAndDate, 1000);

    // 2. Navigation Event Listeners
    $all('.nav-btn').forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            switchView(view);
        });
    });

    // 3. Admin Login/Logout
    $('#admin-login-btn').addEventListener('click', () => {
        $('#login-modal').classList.remove('hidden');
        $('#admin-password').value = '';
        $('#admin-password').focus();
    });

    $('#login-cancel').addEventListener('click', () => {
        $('#login-modal').classList.add('hidden');
    });

    $('#login-submit').addEventListener('click', () => {
        const inputPass = $('#admin-password').value;
        if (inputPass === ADMIN_PASSWORD) {
            $('#login-modal').classList.add('hidden');

            $('#admin-panel').classList.remove('hidden');
            $all('.main-view').forEach(v => v.classList.add('hidden'));
            $('#bottom-nav').classList.add('hidden');

            renderAdminPanelReservations();
            renderAdminNoticesList();

            showToast('Admin access granted.');
        } else {
            showToast('Incorrect password.');
        }
    });

    $('#admin-logout').addEventListener('click', () => {
        $('#admin-panel').classList.add('hidden');
        $('#bottom-nav').classList.remove('hidden');
        switchView('home');

        const deleteToggle = $('#toggle-delete-mode');
        if (deleteToggle) {
            deleteToggle.classList.remove('active');
            deleteToggle.textContent = 'Delete Book Mode';
        }
        renderBookCards(MOCK_BOOKS, 'new-arrivals');

        showToast('Logged out successfully.');
    });

    // 4. Add Book Logic
    $('#add-book-submit').addEventListener('click', () => {
        const title = $('#add-title').value.trim();
        const author = $('#add-author').value.trim();
        const description = $('#add-description').value.trim();
        const fileInput = $('#add-cover-file');
        const file = fileInput.files.length > 0 ? fileInput.files[0] : null;

        if (!title || !author) {
            showToast('Title and Author are required!');
            return;
        }

        addBook(title, author, description, file);
    });
 // app.js

/**
 * Executes when all resources (images, scripts, CSS) have finished loading.
 * This is perfect for the preloader, as it ensures the page is fully ready.
 */
window.addEventListener('load', function() {
    // 1. Get the preloader element
    const preloader = document.getElementById('preloader');

    if (preloader) {
        // 2. Add the class that starts the fade-out transition (opacity: 0)
        preloader.classList.add('hidden-preloader');

        // 3. Remove the preloader from the DOM after the transition finishes (0.5s)
        // This ensures the element doesn't capture clicks even though it's invisible.
        setTimeout(() => {
            preloader.remove(); // Use .remove() for a cleaner approach
        }, 500); // MUST match the CSS transition duration
    }
});

// --- Your other main application functions would follow here ---
// e.g., initApp();
// e.g., function initApp() { ... }
    // 5. Delete Mode Toggle Logic
    $('#toggle-delete-mode').addEventListener('click', function() {
        const isActive = this.classList.toggle('active');

        this.textContent = isActive ? 'Exit Delete Mode' : 'Delete Book Mode';

        renderBookCards(MOCK_BOOKS, 'new-arrivals');

        if (isActive) {
            $all('.main-view').forEach(v => v.classList.add('hidden'));
            $('#home-view').classList.remove('hidden');
            $('#bottom-nav').classList.add('hidden');
            $('#admin-panel').classList.add('hidden');

            showToast('Delete Mode ON. Click the trash icon to delete books.');
        } else {
            $('#admin-panel').classList.remove('hidden');
            showToast('Delete Mode OFF.');
        }
    });

    // 6. Add Notice Logic
    $('#add-notice-submit').addEventListener('click', () => {
        const title = $('#notice-title').value.trim();
        const content = $('#notice-content').value.trim();

        if (!content) {
            showToast('Notice content cannot be empty.');
            return;
        }

        addNotice(title, content);
    });

    // 7. Reservation Form Modal Logic
    $('#reserve-submit').addEventListener('click', () => {
        const bookId = $('#book-id-to-reserve').value;
        const name = $('#reserve-name').value.trim();
        const contact = $('#reserve-contact').value.trim();

        if (!name || !contact) {
            showToast("Please fill in both name and contact details.");
            return;
        }

        const book = MOCK_BOOKS.find(b => b.id === bookId);

        if (book) {
            reserveBook(book.id, name, contact, book.title);
        } else {
            showToast("Error: Book not found.");
        }
    });

    $('#reserve-cancel').addEventListener('click', () => {
        $('#reserve-form-modal').classList.add('hidden');
        showToast("Reservation cancelled.");
    });

    // Background click closes the reserve modal
    const reserveModal = $('#reserve-form-modal');
    if (reserveModal) {
        reserveModal.querySelector('.modal-bg').addEventListener('click', () => {
            reserveModal.classList.add('hidden');
            showToast("Reservation cancelled.");
        });
    }

    // Background click closes the login modal
    const loginModal = $('#login-modal');
    if (loginModal) {
        loginModal.querySelector('.modal-bg').addEventListener('click', () => {
            loginModal.classList.add('hidden');
        });
    }

    const searchInput = $('#search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            // Only perform search if the 'search-view' is currently visible
            const searchView = $('#search-view');
            if (searchView && !searchView.classList.contains('hidden')) {
                handleSearch(e.target.value);
            }
        });
    }
}); // <--- END OF DOMCONTENTLOADED BLOCK

// ====================================================================
// === PRELOADER HIDING LOGIC (PLACED OUTSIDE DOMContentLoaded) ===
// ====================================================================

/**
 * Executes when all resources (images, scripts, CSS) have finished loading.
 * This should be at the top level of the script to ensure it runs correctly.
 */
window.addEventListener('load', function() {
    const preloader = document.getElementById('preloader');

    // Check for Firebase initialization success before proceeding (optional, but good practice)
    if (typeof db === 'undefined') { 
        console.warn("Preloader hiding early due to Firebase error.");
    }
    
    if (preloader) {
        preloader.classList.add('hidden-preloader');
        setTimeout(() => {
            preloader.remove(); 
        }, 500); // MUST match the CSS transition
    }
});
