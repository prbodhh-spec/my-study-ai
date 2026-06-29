pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Elements
const fileSelector = document.getElementById('file-selector');
const magazine = document.getElementById('magazine');
const popupBtn = document.getElementById('gemini-popup-btn');
const sidebar = document.getElementById('ai-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');
const aiResponseContent = document.getElementById('ai-response-content');
const flipSound = document.getElementById('flip-sound');

const libraryShelf = document.getElementById('library-shelf');
const libraryToggleBtn = document.getElementById('library-toggle-btn');
const closeShelfBtn = document.getElementById('close-shelf');
const bookListContainer = document.getElementById('book-list');
const fullscreenBtn = document.getElementById('fullscreen-btn');

let globalLibrary = {}; // Local structural storage to swap books instantly
let currentSelectedText = "";

// --- 1. MULTI-BOOK LIBRARY ARCHITECTURE ---
fileSelector.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            const bookId = 'book_' + Date.now();
            
            // Add to library runtime
            globalLibrary[bookId] = {
                name: file.name,
                data: typedarray
            };
            
            updateLibraryShelfUI();
            loadBookEngine(bookId);
        };
        fileReader.readAsArrayBuffer(file);
    }
});

function updateLibraryShelfUI() {
    bookListContainer.innerHTML = '';
    const keys = Object.keys(globalLibrary);
    
    if(keys.length === 0) {
        bookListContainer.innerHTML = '<div class="empty-shelf-notice">Your library is empty.</div>';
        return;
    }

    keys.forEach(key => {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerText = globalLibrary[key].name;
        card.addEventListener('click', () => {
            loadBookEngine(key);
            libraryShelf.classList.remove('open');
        });
        bookListContainer.appendChild(card);
    });
}

// --- 2. ENGINE LOADER & RENDER MASK ---
async function loadBookEngine(bookId) {
    if ($(magazine).turn('is')) {
        $(magazine).turn('destroy');
    }
    magazine.innerHTML = '';
    
    // Add visual loading state animation
    magazine.style.opacity = '0.5';

    const targetBook = globalLibrary[bookId];
    const pdf = await pdfjsLib.getDocument(targetBook.data).promise;
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const pageFrame = document.createElement('div');
        pageFrame.className = 'page-frame';
        magazine.appendChild(pageFrame);

        const page = await pdf.getPage(pageNum);
        const desiredWidth = 525; // Adjusted to safely fit scaling profiles
        const tempViewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / tempViewport.width;
        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageFrame.appendChild(canvas);

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        pageFrame.appendChild(textLayerDiv);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const textContent = await page.getTextContent();
        
        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        });
    }

    magazine.style.opacity = '1';

    // Build 3D Core Layout
    $(magazine).turn({
        width: 1050,
        height: 700,
        autoCenter: true,
        display: 'double',
        duration: 800,
        when: {
            turning: function() {
                flipSound.currentTime = 0;
                flipSound.play().catch(() => {});
            }
        }
    });
}

// --- 3. SELECTION EXTRACTION ---
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
        currentSelectedText = text;
        popupBtn.style.display = 'block';
        popupBtn.style.left = `${e.clientX + 10}px`;
        popupBtn.style.top = `${e.clientY + 10}px`;
    } else if (e.target !== popupBtn) {
        popupBtn.style.display = 'none';
    }
});

// --- 4. INTEGRATED GEMINI ASSISTANT API ---
popupBtn.addEventListener('click', async () => {
    popupBtn.style.display = 'none';
    sidebar.classList.add('open');
    aiResponseContent.innerHTML = "<em>Analyzing selected passage...</em>";

    let apiKey = sessionStorage.getItem('gemini_api_key');
    if (!apiKey) {
        apiKey = prompt("Enter your Google Gemini API Key:");
        if (apiKey) sessionStorage.setItem('gemini_api_key', apiKey);
        else {
            aiResponseContent.innerHTML = "API Key authentication missing.";
            return;
        }
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `I am looking at my textbook and don't understand this context or question. Please break down and explain: "${currentSelectedText}"` }] }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const answer = data.candidates[0].content.parts[0].text;
        const formattedAnswer = answer.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        aiResponseContent.innerHTML = `<p>${formattedAnswer}</p>`;
    } catch (error) {
        aiResponseContent.innerHTML = `<span style="color: red;">Error processing request: ${error.message}</span>`;
    }
});

// --- 5. INTERFACE UTILITIES ---
libraryToggleBtn.addEventListener('click', () => libraryShelf.classList.toggle('open'));
closeShelfBtn.addEventListener('click', () => libraryShelf.classList.remove('open'));
closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));

// Fullscreen API Hook
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
        document.exitFullscreen();
    }
});