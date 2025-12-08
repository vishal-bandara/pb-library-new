// =================================================================
// === GLOBAL VARIABLES & DOM HELPERS ===
// =================================================================
let db;
let storage;
let MOCK_BOOKS = [];
let LIBRARY_NOTICES = [];
const ADMIN_PASSWORD = "admin";

const $ = selector => document.querySelector(selector);
const $all = selector => document.querySelectorAll(selector);

// =================================================================
// === FIREBASE CONFIGURATION ===
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyC8_9CMdG2MyS-P9XGYRtd1K_9kNaEQSyc",
    authDomain: "pb-library-1501a.firebaseapp.com",
    projectId: "pb-library-1501a",
    storageBucket: "pb-library-1501a.appspot.com",
    messagingSenderId: "351111194912",
    appId: "1:351111194912:web:a24d7385a22ac51e220f45"
};

if(typeof firebase === 'undefined'){
    console.error("Firebase SDK not loaded! Add scripts in index.html.");
} else {
    const app = firebase.initializeApp(firebaseConfig);
    db = app.firestore();
    storage = app.storage();
}

// =================================================================
// === TIME & DATE ===
// =================================================================
function updateTimeAndDate(){
    const now = new Date();
    if($('#date-text')) $('#date-text').textContent = now.toDateString();
    if($('#time-text')) $('#time-text').textContent = now.toLocaleTimeString();
}

// =================================================================
// === FIREBASE DATA LISTENERS ===
// =================================================================
function setupBooksListener(){
    if(!db) return;

    const booksRef = db.collection("books").orderBy("createdAt", "desc");
    booksRef.onSnapshot(function(snapshot){
        MOCK_BOOKS = snapshot.docs.map(function(doc){
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'No Title',
                author: data.author || 'Unknown',
                description: data.description || '',
                cover: data.cover || 'https://via.placeholder.com/180x280?text=No+Cover',
                reserved: data.reserved || null
            };
        });
        console.log("Books loaded:", MOCK_BOOKS);
        renderBookCards(MOCK_BOOKS, 'new-arrivals');
    }, function(error){
        console.error("Error loading books:", error);
    });
}

function setupNoticesListener(){
    if(!db) return;

    const noticesRef = db.collection("notices").orderBy("dateAdded", "desc");
    noticesRef.onSnapshot(function(snapshot){
        LIBRARY_NOTICES = snapshot.docs.map(function(doc){
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'Notice',
                content: data.content || '',
                date: data.date || ''
            };
        });
        console.log("Notices loaded:", LIBRARY_NOTICES);
        renderPublicNotices();
    }, function(error){
        console.error("Error loading notices:", error);
    });
}

// =================================================================
// === RENDER FUNCTIONS ===
// =================================================================
function renderBookCards(books, containerId){
    const container = $( "#" + containerId );
    if(!container) return;
    container.innerHTML = '';

    if(books.length === 0){
        container.innerHTML = "<p style='text-align:center;color:#999;'>No books found.</p>";
        return;
    }

    books.forEach(function(book){
        const card = document.createElement('div');
        card.classList.add('card');
        if(book.reserved) card.classList.add('reserved');

        card.dataset.bookId = book.id;

        card.innerHTML = `
            <div class="cover" style="background-image: url('${book.cover}');"></div>
            <div class="meta">
                <p class="title">${book.title}</p>
                <p class="author">${book.author}</p>
            </div>
        `;

        card.addEventListener('click', function(){
            showBookDetailModal(book);
        });

        container.appendChild(card);
    });
}

function renderPublicNotices(){
    const container = $('#notices-view .notice-area');
    if(!container) return;
    container.innerHTML = '';

    if(LIBRARY_NOTICES.length === 0){
        container.innerHTML = "<p style='text-align:center;color:#999;'>No active notices.</p>";
        return;
    }

    LIBRARY_NOTICES.forEach(function(notice){
        const div = document.createElement('div');
        div.classList.add('notice-item');
        div.innerHTML = `
            <strong>${notice.title}</strong>
            <p>${notice.content}</p>
            <small>${notice.date}</small>
        `;
        container.appendChild(div);
    });
}

// =================================================================
// === MODALS ===
// =================================================================
function showBookDetailModal(book){
    const modal = $('#book-detail-modal');
    const panel = $('#book-detail-panel');
    if(!modal || !panel) return;

    panel.innerHTML = `
        <div class="book-details-content">
            <div class="book-cover-display" style="background-image: url('${book.cover}');"></div>
            <div class="book-info">
                <h3>${book.title}</h3>
                <p>by ${book.author}</p>
                <p>${book.description}</p>
                ${book.reserved ? `<p>Reserved until: ${book.reserved.dueDate}</p>` : `<button id="reserve-btn">Reserve</button>`}
            </div>
        </div>
        <button id="close-detail-modal">Close</button>
    `;

    if(!book.reserved){
        const btn = $('#reserve-btn');
        if(btn){
            btn.addEventListener('click', function(){
                modal.classList.add('hidden');
                showReserveFormModal(book);
            });
        }
    }

    $('#close-detail-modal').addEventListener('click', function(){
        modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
}

function showReserveFormModal(book){
    const modal = $('#reserve-form-modal');
    if(!modal) return;
    $('#book-id-to-reserve').value = book.id;
    modal.classList.remove('hidden');
}

// =================================================================
// === EVENT LISTENERS ===
// =================================================================
function setupEventListeners(){
    // Navigation buttons
    $all('.nav-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
            const view = btn.dataset.view;
            switchView(view);
        });
    });

    // Reserve submit
    const reserveSubmit = $('#reserve-submit');
    if(reserveSubmit){
        reserveSubmit.addEventListener('click', function(){
            const bookId = $('#book-id-to-reserve').value;
            const name = $('#reserve-name').value.trim();
            const contact = $('#reserve-contact').value.trim();
            if(!name || !contact){ alert("Fill both fields"); return; }

            reserveBook(bookId, name, contact);
        });
    }
}

// =================================================================
// === SWITCH VIEWS ===
// =================================================================
function switchView(view){
    $all('.main-view').forEach(v => v.classList.add('hidden'));
    const container = $('#' + view + '-view');
    if(container) container.classList.remove('hidden');
}

// =================================================================
// === RESERVE BOOK ===
// =================================================================
function reserveBook(bookId, name, contact){
    if(!db) return;
    const due = new Date(); due.setDate(due.getDate()+7);

    const reservationData = {
        name: name,
        contact: contact,
        dateReserved: new Date().toLocaleDateString(),
        dueDate: due.toLocaleDateString(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection("books").doc(bookId).update({
        reserved: reservationData
    }).then(function(){
        alert("Book reserved successfully!");
        $('#reserve-form-modal').classList.add('hidden');
    }).catch(function(err){
        console.error("Error reserving book:", err);
    });
}

// =================================================================
// === INITIALIZE ===
// =================================================================
document.addEventListener('DOMContentLoaded', function(){
    setupBooksListener();
    setupNoticesListener();
    updateTimeAndDate();
    setInterval(updateTimeAndDate,1000);
});
