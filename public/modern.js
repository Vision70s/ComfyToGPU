// API Configuration
const API_URL = 'http://localhost:3000/api';
let API_KEY = localStorage.getItem('apiKey') || '';

// Job Queue
let jobs = [];
let nextJobId = 1;

// Character Reference State
let referencePhotos = [];
let selectedModel = 'nana'; // 'nana' or 'nana-pro'

// DOM Elements
const promptInput = document.getElementById('prompt');
const addToQueueBtn = document.getElementById('add-to-queue-btn');
const loadDemoBtn = document.getElementById('load-demo-btn');
const queueSection = document.getElementById('queue-section');
const queueBody = document.getElementById('queue-body');
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const closeModalBtn = document.getElementById('close-modal');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkApiKey();
});

function setupEventListeners() {
    // Add to queue
    addToQueueBtn.addEventListener('click', addJobToQueue);

    // Load demo
    loadDemoBtn.addEventListener('click', loadDemoData);

    // Modal close
    closeModalBtn.addEventListener('click', closeImageModal);
    imageModal.addEventListener('click', (e) => {
        if (e.target === imageModal) closeImageModal();
    });
}

function checkApiKey() {
    if (!API_KEY) {
        const key = prompt('Enter your API key:');
        if (key) {
            API_KEY = key;
            localStorage.setItem('apiKey', key);
            updateStatus('connected', 'Connected');
        } else {
            updateStatus('disconnected', 'No API Key');
        }
    } else {
        updateStatus('connected', 'Connected');
    }
}

function updateStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    indicator.className = `w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'
        }`;
    statusText.textContent = text;
}

async function addJobToQueue() {
    const prompt = promptInput.value.trim();

    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    // Create job - simplified for Nana Banana only
    const job = {
        id: nextJobId++,
        prompt: prompt,
        status: 'pending',
        imageUrl: null,
        order: jobs.length + 1
    };

    jobs.push(job);
    renderQueue();
    clearInputs();

    // Start processing
    processJob(job);
}

function clearInputs() {
    promptInput.value = '';
}

async function processJob(job) {
    try {
        // Check if we have required data for generation
        const characterName = document.getElementById('character-name')?.value.trim();

        if (!characterName) {
            updateJobStatus(job.id, 'failed');
            alert('Please enter character name before generating');
            return;
        }

        if (referencePhotos.length < 2) {
            updateJobStatus(job.id, 'failed');
            alert('Please upload at least 2 reference photos before generating');
            return;
        }

        updateJobStatus(job.id, 'generating');

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('characterName', characterName);
        formData.append('prompt', job.prompt);
        formData.append('model', selectedModel);

        // Add reference photos
        referencePhotos.forEach((photo) => {
            formData.append('refImages', photo.file);
        });

        console.log(`[Modern UI] Generating with ${referencePhotos.length} references`);
        console.log(`[Modern UI] Character: ${characterName}`);
        console.log(`[Modern UI] Model: ${selectedModel}`);

        const response = await fetch(`${API_URL}/generate-with-references`, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Generation failed');
        }

        const data = await response.json();

        if (data.success && data.images && data.images.length > 0) {
            job.characterName = characterName;
            job.model = selectedModel;
            updateJobStatus(job.id, 'done', data.images[0]);
        } else {
            updateJobStatus(job.id, 'failed');
        }
    } catch (error) {
        console.error('Generation error:', error);
        updateJobStatus(job.id, 'failed');
        alert(`Generation failed: ${error.message}`);
    }
}

function updateJobStatus(jobId, status, imageUrl = null) {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
        job.status = status;
        if (imageUrl) job.imageUrl = imageUrl;
        renderQueue();
    }
}

function renderQueue() {
    if (jobs.length === 0) {
        queueSection.classList.add('hidden');
        return;
    }

    queueSection.classList.remove('hidden');
    queueBody.innerHTML = jobs.map(job => createJobRow(job)).join('');

    // Add event listeners for image clicks
    jobs.forEach(job => {
        if (job.imageUrl) {
            const imgElement = document.getElementById(`job-img-${job.id}`);
            if (imgElement) {
                imgElement.addEventListener('click', () => openImageModal(job.imageUrl));
            }
        }
    });
}

function createJobRow(job) {
    // Create edit cell content
    const editCellContent = job.imageUrl && job.status === 'done' ? `
        <div class="flex gap-2 items-center">
            <input 
                type="text" 
                id="edit-prompt-${job.id}"
                placeholder="Add sunglasses..." 
                class="flex-1 px-3 py-1.5 bg-zinc-900/50 border border-zinc-700 rounded text-sm text-zinc-300 focus:border-accent focus:outline-none"
            />
            <button 
                onclick="editImage(${job.id})" 
                class="px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded text-sm font-medium transition whitespace-nowrap"
            >
                ✏️ Edit
            </button>
        </div>
        ${job.editedUrl ? `
            <div class="mt-2">
                <img src="${job.editedUrl}" class="w-20 h-20 rounded border border-green-500 object-cover cursor-pointer" onclick="openImageModal('${job.editedUrl}')"/>
                <span class="text-xs text-green-400 ml-1">✓ Edited</span>
            </div>
        ` : ''}
        ${job.editStatus === 'editing' ? `
            <div class="mt-2 flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                <span class="text-xs text-accent">Editing...</span>
            </div>
        ` : ''}
    ` : `<span class="text-xs text-zinc-600">-</span>`;

    return `
        <tr class="hover:bg-zinc-800/50 transition group">
            <td class="p-4 text-zinc-500 font-mono text-sm">${job.order}</td>
            <td class="p-4">
                <div class="text-zinc-300 text-sm mb-1">${escapeHtml(job.prompt)}</div>
                ${job.characterName ? `
                    <div class="text-xs text-zinc-500 mt-1">
                        <span class="text-accent">👤</span> ${job.characterName}
                        ${job.model ? ` • <span class="text-yellow-400">${job.model === 'nana-pro' ? '⭐ Nana Pro' : '⚡ Nana'}</span>` : ''}
                    </div>
                ` : ''}
            </td>
            <td class="p-4">
                ${createStatusBadge(job.status)}
            </td>
            <td class="p-4 text-right">
                ${job.imageUrl ? createImagePreview(job) : createGenerateButton(job)}
            </td>
            <td class="p-4">
                ${editCellContent}
            </td>
        </tr>
    `;
}

function createStatusBadge(status) {
    const styles = {
        pending: { bg: 'bg-zinc-800', text: 'text-zinc-400', border: '' },
        generating: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border border-blue-800' },
        done: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', border: 'border border-emerald-800' },
        failed: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border border-red-800' }
    };

    const icons = {
        pending: '⏱️',
        generating: '🔄',
        done: '✅',
        failed: '❌'
    };

    const style = styles[status] || styles.pending;
    const icon = icons[status] || '⏱️';
    const spinClass = status === 'generating' ? 'animate-pulse' : '';

    return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${style.bg} ${style.text} ${style.border} ${spinClass}">
            <span>${icon}</span>
            ${status}
        </span>
    `;
}

function createImagePreview(job) {
    return `
        <div class="relative w-full h-32 rounded-lg overflow-hidden border border-zinc-700 group cursor-pointer" id="job-img-${job.id}">
            <img src="${job.imageUrl}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <span class="text-xs font-bold uppercase tracking-wider">View</span>
            </div>
        </div>
    `;
}

function createGenerateButton(job) {
    const disabled = job.status === 'generating' ? 'opacity-50 cursor-not-allowed' : '';
    const icon = job.status === 'generating' ? '🔄' : '▶️';

    return `
        <button onclick="retryJob(${job.id})" 
            ${job.status === 'generating' ? 'disabled' : ''}
            class="bg-zinc-100 hover:bg-white text-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ml-auto transition ${disabled}">
            <span>${icon}</span>
            ${job.status === 'generating' ? 'Generating...' : 'Retry'}
        </button>
    `;
}

function retryJob(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (job && job.status === 'failed') {
        processJob(job);
    }
}

function openImageModal(imageUrl) {
    modalImage.src = imageUrl;
    imageModal.classList.remove('hidden');
}

function closeImageModal() {
    imageModal.classList.add('hidden');
    modalImage.src = '';
}

function loadDemoData() {
    jobs = [
        {
            id: nextJobId++,
            prompt: 'Cyberpunk street scene, neon lights, rain, cinematic',
            isDual: false,
            useGemini: false,
            status: 'done',
            imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400',
            order: 1
        },
        {
            id: nextJobId++,
            prompt: 'Mountain landscape at sunset, dramatic sky',
            isDual: false,
            useGemini: true,
            status: 'generating',
            imageUrl: null,
            enhancedPrompt: 'Epic mountain landscape at golden hour sunset...',
            order: 2
        },
        {
            id: nextJobId++,
            prompt: 'Futuristic city skyline, sci-fi architecture',
            isDual: false,
            useGemini: false,
            status: 'pending',
            imageUrl: null,
            order: 3
        }
    ];

    renderQueue();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === Character Reference Functions ===

function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);

    if (referencePhotos.length + files.length > 5) {
        alert('Maximum 5 reference photos allowed');
        return;
    }

    files.forEach(file => {
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert(`File ${file.name} is too large (max 10MB)`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            referencePhotos.push({
                file: file,
                preview: e.target.result
            });
            renderPhotoGrid();
        };
        reader.readAsDataURL(file);
    });

    // Reset input
    event.target.value = '';
}

function removePhoto(index) {
    referencePhotos.splice(index, 1);
    renderPhotoGrid();
}

function renderPhotoGrid() {
    const grid = document.getElementById('photo-grid');

    const photosHTML = referencePhotos.map((photo, idx) => `
        <div class="relative aspect-square group rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
            <img src="${photo.preview}" class="w-full h-full object-cover">
            <button onclick="removePhoto(${idx})"
                class="absolute top-1 right-1 bg-black/70 hover:bg-red-500/90 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round"  stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');

    const uploadButtonHTML = `
        <button onclick="document.getElementById('photo-upload').click()"
            class="aspect-square rounded-lg border-2 border-dashed border-zinc-700 hover:border-accent hover:bg-zinc-800/50 transition flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-accent cursor-pointer">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <span class="text-xs font-medium">Add Photo</span>
        </button>
    `;

    grid.innerHTML = photosHTML + uploadButtonHTML;
}

// =======================
// Image Editing with Qwen
// =======================

async function editImage(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job || !job.imageUrl) {
        alert('No image to edit');
        return;
    }

    const editPromptInput = document.getElementById(`edit-prompt-${jobId}`);
    const editPrompt = editPromptInput.value.trim();

    if (!editPrompt) {
        alert('Please enter an edit prompt');
        return;
    }

    // Set editing status
    job.editStatus = 'editing';
    renderQueue();

    try {
        console.log(`[Edit] Editing job ${jobId} with prompt: ${editPrompt}`);

        // Send edit request
        const response = await fetch(`${API_URL}/edit-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({
                imageBase64: job.imageUrl,
                editPrompt: editPrompt
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Edit failed');
        }

        const data = await response.json();

        if (data.success && data.images && data.images.length > 0) {
            job.editedUrl = data.images[0];
            job.editStatus = 'done';
            job.lastEditPrompt = editPrompt;
            console.log('[Edit] Image edited successfully!');
        } else {
            throw new Error('No edited image returned');
        }
    } catch (error) {
        console.error('[Edit] Error:', error);
        job.editStatus = 'failed';
        alert(`Edit failed: ${error.message}`);
    } finally {
        renderQueue();
    }
}

// =======================
// Model Selection
// =======================

function selectModel(model) {
    selectedModel = model;

    const nanaBtnList = document.getElementById('model-nana');
    const nanaProBtn = document.getElementById('model-nana-pro');

    if (model === 'nana') {
        nanaBtn.className = 'flex-1 px-4 py-2 rounded-md text-sm font-medium bg-zinc-700 text-white transition';
        nanaProBtn.className = 'flex-1 px-4 py-2 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-300 transition';
    } else {
        nanaBtn.className = 'flex-1 px-4 py-2 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-300 transition';
        nanaProBtn.className = 'flex-1 px-4 py-2 rounded-md text-sm font-medium bg-zinc-700 text-white transition';
    }
}

// Make functions available globally
window.retryJob = retryJob;
window.handlePhotoUpload = handlePhotoUpload;
window.removePhoto = removePhoto;
window.selectModel = selectModel;
