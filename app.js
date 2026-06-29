pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// DOM Elements
const fileSelector = document.getElementById('file-selector');
const bookContainer = document.getElementById('book');
const libraryDrawer = document.getElementById('library-drawer');
const bookList = document.getElementById('book-list');
const sidebar = document.getElementById('ai-sidebar');
const aiResponseContent = document.getElementById('ai-response-content');
const popupBtn = document.getElementById('gemini-popup-btn');
const flipSound = document.getElementById('flip-sound');

let pageFlipInstance = null;
let currentSelectedText = "";

// Initialize Local Storage (IndexedDB)
localforage.config({ name: 'StudioAI_Library' });

// Load Library on App Start
window.addEventListener('DOMContentLoaded', loadLibraryShelf);

// --- 1. SAVING DATA TO YOUR DEVICE ---
fileSelector.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const arrayBuffer = this.result;
            const bookId = 'book_' + Date.now();
            
            // Save to browser's permanent database
            await localforage.setItem(bookId, {
                name: file.name,
                data: arrayBuffer
            });
            
            loadLibraryShelf();
            renderBook(arrayBuffer);
        };
        fileReader.readAsArrayBuffer(file);
    }
});

async function loadLibraryShelf() {
    bookList.innerHTML = '';
    const keys = await localforage.keys();
    
    if (keys.length === 0) {
        bookList.innerHTML = '<p style="color:#888;">Shelf is empty.</p>';
        return;
    }

    for (let key of keys) {
        const bookObj = await localforage.getItem(key);
        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `<h3>📄 ${bookObj.name}</h3>`;
        
        // Open Book Event
        card.addEventListener('click', () => {
            renderBook(bookObj.data);
            libraryDrawer.classList.remove('open');
        });

        // Delete Book Event
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerText = 'Remove from device';
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            await localforage.removeItem(key);
            loadLibraryShelf();
        };
        
        card.appendChild(delBtn);
        bookList.appendChild(card);
    }
}

// --- 2. THE 3D BOOK ENGINE (PageFlip) ---
async function renderBook(pdfArrayBuffer) {
    // Destroy previous book instance if exists
    if (pageFlipInstance) { pageFlipInstance.destroy(); }
    bookContainer.innerHTML = ''; 

    const pdf = await pdfjsLib.getDocument(pdfArrayBuffer).promise;
    const totalPages = pdf.numPages;

    // Create pages in DOM
    const pagesHTML = [];
    
    for (let i = 1; i <= totalPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-wrapper';
        
        const canvas = document.createElement('canvas');
        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';

        pageDiv.appendChild(canvas);
        pageDiv.appendChild(textLayer);
        bookContainer.appendChild(pageDiv);
        pagesHTML.push(pageDiv);

        // Render PDF to Canvas
        pdf.getPage(i).then(page => {
            const viewport = page.getViewport({ scale: 1.2 }); // Higher res
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport })
            .promise.then(() => page.getTextContent())
            .then(textContent => {
                pdfjsLib.renderTextLayer({
                    textContentSource: textContent, container: textLayer, viewport: viewport, textDivs: []
                });
            });
        });
    }

    // Initialize the smooth 3D engine
    pageFlipInstance = new St.PageFlip(bookContainer, {
        width: 450, height: 600,
        size: "fixed",
        display: "double",
        showCover: true,
        maxShadowOpacity: 0.3
    });

    pageFlipInstance.loadFromHTML(document.querySelectorAll('.page-wrapper'));

    // Sound effect trigger
    pageFlipInstance.on('flip', (e) => {
        flipSound.currentTime = 0;
        flipSound.play().catch(()=>{});
    });
}

// --- 3. GEMINI AI HIGHLIGHT INTEGRATION ---

// UI Toggles
document.getElementById('toggle-library').onclick = () => libraryDrawer.classList.add('open');
document.getElementById('close-library').onclick = () => libraryDrawer.classList.remove('open');
document.getElementById('close-sidebar').onclick = () => sidebar.classList.remove('open');

// Save API Key locally
const keyInput = document.getElementById('gemini-key-input');
document.getElementById('save-key-btn').onclick = () => {
    if(keyInput.value) {
        localStorage.setItem('gemini_key', keyInput.value);
        keyInput.value = 'Saved Successfully!';
        setTimeout(()=> keyInput.value = '', 2000);
    }
};

// Track Text Selection
document.addEventListener('mouseup', (e) => {
    const text = window.getSelection().toString().trim();
    if (text.length > 5) {
        currentSelectedText = text;
        popupBtn.style.display = 'block';
        popupBtn.style.left = `${e.clientX + 15}px`;
        popupBtn.style.top = `${e.clientY - 30}px`;
    } else if (e.target !== popupBtn) {
        popupBtn.style.display = 'none';
    }
});

// Call Gemini
popupBtn.addEventListener('click', async () => {
    popupBtn.style.display = 'none';
    sidebar.classList.add('open');
    aiResponseContent.innerHTML = "<em style='color:#a8b2d1;'>Scanning and analyzing text...</em>";

    const apiKey = localStorage.getItem('gemini_key');
    if (!apiKey) {
        aiResponseContent.innerHTML = "<span style='color:#ff4757;'>Please paste your Gemini API key at the top of this sidebar and click Save.</span>";
        return;
    }

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Act as a helpful tutor. Explain this concept clearly: "${currentSelectedText}"` }] }]
            })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        let answer = data.candidates[0].content.parts[0].text;
        answer = answer.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff;">$1</strong>');
        aiResponseContent.innerHTML = `<p>${answer}</p>`;
    } catch (err) {
        aiResponseContent.innerHTML = `<span style="color:#ff4757;">API Error: ${err.message}</span>`;
    }
});