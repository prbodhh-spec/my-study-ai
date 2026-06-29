// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// DOM Elements
const fileSelector = document.getElementById('file-selector');
const viewerContainer = document.getElementById('viewer-container');
const popupBtn = document.getElementById('gemini-popup-btn');
const sidebar = document.getElementById('ai-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');
const aiResponseContent = document.getElementById('ai-response-content');

let currentSelectedText = "";
const SCALE = 1.5; // Adjust for clarity vs performance

// --- 1. LOAD PDF ---
fileSelector.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            loadPDF(typedarray);
        };
        fileReader.readAsArrayBuffer(file);
    }
});

function loadPDF(data) {
    viewerContainer.innerHTML = ''; // Clear previous
    pdfjsLib.getDocument(data).promise.then(pdf => {
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            renderPage(pdf, pageNum);
        }
    }).catch(error => console.error("Error loading PDF: ", error));
}

// --- 2. RENDER CANVAS & TEXT LAYER ---
function renderPage(pdf, pageNum) {
    pdf.getPage(pageNum).then(page => {
        const viewport = page.getViewport({ scale: SCALE });

        // Create Container
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        // Create Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageContainer.appendChild(canvas);

        // Create Text Layer Div
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        pageContainer.appendChild(textLayerDiv);

        viewerContainer.appendChild(pageContainer);

        // Render Canvas content
        const renderContext = { canvasContext: ctx, viewport: viewport };
        page.render(renderContext).promise.then(() => {
            // Render Text Layer for highlighting
            return page.getTextContent();
        }).then(textContent => {
            pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            });
        });
    });
}

// --- 3. SELECTION & POPUP LOGIC ---
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
        currentSelectedText = text;
        // Show button near cursor
        popupBtn.style.display = 'block';
        popupBtn.style.left = `${e.clientX + 10}px`;
        popupBtn.style.top = `${e.clientY + 10}px`;
    } else if (e.target !== popupBtn) {
        // Hide button if clicking elsewhere
        popupBtn.style.display = 'none';
        currentSelectedText = "";
    }
});

// Hide popup when scrolling
window.addEventListener('scroll', () => {
    popupBtn.style.display = 'none';
});

// --- 4. GEMINI API INTEGRATION ---
popupBtn.addEventListener('click', async () => {
    popupBtn.style.display = 'none'; // Hide button after clicking
    sidebar.classList.add('open');
    aiResponseContent.innerHTML = "<em>Thinking...</em>";

    // Secure API Key Handling
    let apiKey = sessionStorage.getItem('gemini_api_key');
    if (!apiKey) {
        apiKey = prompt("Please enter your Gemini API Key (It will be saved for this session only):");
        if (apiKey) {
            sessionStorage.setItem('gemini_api_key', apiKey);
        } else {
            aiResponseContent.innerHTML = "API Key is required to ask Gemini.";
            return;
        }
    }

    // Call Gemini
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Please explain this text from my study material clearly and concisely: "${currentSelectedText}"`
                    }]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        // Extract text and display
        const answer = data.candidates[0].content.parts[0].text;
        
        // Simple Markdown bold to HTML conversion for readability
        const formattedAnswer = answer.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        aiResponseContent.innerHTML = `<p>${formattedAnswer}</p>`;

    } catch (error) {
        console.error("Gemini API Error:", error);
        aiResponseContent.innerHTML = `<span style="color: red;">Error: ${error.message}</span><br><br><small>If you entered a wrong key, refresh the page to reset it.</small>`;
    }
});

// Close Sidebar logic
closeSidebarBtn.addEventListener('click', () => {
    sidebar.classList.remove('open');
});