// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');

// Chat elements
const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const modelSelect = document.getElementById('model-select');

// Generate elements
const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generate-btn');
const useGeminiCheckbox = document.getElementById('use-gemini');
const btnText = generateBtn.querySelector('.btn-text');
const loader = generateBtn.querySelector('.loader');
const resultSection = document.getElementById('result-section');
const resultMessage = document.getElementById('result-message');
const enhancedSection = document.getElementById('enhanced-section');
const enhancedPrompt = document.getElementById('enhanced-prompt');

// State
let conversationHistory = [];

// Auth State
let apiKey = localStorage.getItem('comfy_api_key');
const authOverlay = document.getElementById('auth-overlay');
const apiKeyInput = document.getElementById('api-key-input');
const loginBtn = document.getElementById('login-btn');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
    };
}

function logout() {
    localStorage.removeItem('comfy_api_key');
    apiKey = null;
    authOverlay.style.display = 'flex';
    apiKeyInput.value = '';
    authError.style.display = 'none';
    alert('Logged out');
}

logoutBtn.addEventListener('click', logout);

// Login logic
loginBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;

    // Verify key
    try {
        const res = await fetch('/api/health', {
            headers: { 'x-api-key': key }
        });

        if (res.ok) {
            apiKey = key;
            localStorage.setItem('comfy_api_key', key);
            authOverlay.style.display = 'none';
            checkHealth();
            // alert('✅ Welcome back!'); // Annoying popup removed
        } else {
            authError.style.display = 'block';
            authError.textContent = 'Invalid API Key';
        }
    } catch (e) {
        authError.style.display = 'block';
        authError.textContent = 'Server Error';
    }
});

// Check if already logged in
if (apiKey) {
    // Validate current key
    fetch('/api/health', { headers: { 'x-api-key': apiKey } })
        .then(res => {
            if (res.ok) {
                authOverlay.style.display = 'none';
                checkHealth();
            } else {
                // Key expired or invalid
                console.warn('Saved key is invalid');
                logout(); // Force logout
            }
        })
        .catch(() => {
            // Server down or network error
            console.error('Network error during auth check');
            // Do NOT hide overlay. Let user try to login again (which will retry connection)
            authError.style.display = 'block';
            authError.textContent = 'Could not connect to server';
        });
}

// Tab switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
});

// Check server health
async function checkHealth() {
    if (!apiKey) return;
    try {
        const response = await fetch('/api/health', {
            headers: { 'x-api-key': apiKey }
        });
        if (response.ok) {
            statusEl.classList.add('connected');
            statusText.textContent = 'Connected';
            generateBtn.disabled = false;
        }
    } catch (error) {
        statusText.textContent = 'Disconnected';
        generateBtn.disabled = true;
    }
}

// Chat functions
function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${role}`;

    const textNode = document.createTextNode(content);
    messageDiv.appendChild(textNode);

    if (role === 'assistant') {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = '📋 Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(content);
            copyBtn.textContent = '✅ Copied!';
            setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
        };
        messageDiv.appendChild(copyBtn);
    }

    // Remove welcome message if exists
    const welcome = chatHistory.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to UI
    addMessage(message, 'user');
    chatInput.value = '';

    // Update history for API
    conversationHistory.push({
        role: 'user',
        parts: [{ text: message }]
    });

    // Disable send button
    sendChatBtn.disabled = true;
    sendChatBtn.textContent = 'Thinking...';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                message,
                model: modelSelect.value,
                history: conversationHistory.slice(0, -1) // Don't include the message we just sent
            })
        });

        const data = await response.json();

        if (response.ok) {
            addMessage(data.response, 'assistant');
            conversationHistory.push({
                role: 'model',
                parts: [{ text: data.response }]
            });
        } else {
            addMessage(`Error: ${data.error}`, 'assistant');
        }
    } catch (error) {
        addMessage('Failed to connect to server', 'assistant');
    } finally {
        sendChatBtn.disabled = false;
        sendChatBtn.textContent = 'Send';
    }
}

function clearChat() {
    conversationHistory = [];
    chatHistory.innerHTML = '<div class="welcome-message">👋 Start chatting with Gemini! Ask for help creating prompts or test the model.</div>';
}

// Chat event listeners
sendChatBtn.addEventListener('click', sendMessage);
clearChatBtn.addEventListener('click', clearChat);
chatInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        sendMessage();
    }
});

// Toggle between single and dual prompt modes
const useDualPromptsCheckbox = document.getElementById('use-dual-prompts');
const singlePromptMode = document.getElementById('single-prompt-mode');
const dualPromptMode = document.getElementById('dual-prompt-mode');
const prompt1Input = document.getElementById('prompt1');
const prompt2Input = document.getElementById('prompt2');

useDualPromptsCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        singlePromptMode.style.display = 'none';
        dualPromptMode.style.display = 'block';
    } else {
        singlePromptMode.style.display = 'block';
        dualPromptMode.style.display = 'none';
    }
});

// Generate image function
async function generateImage() {
    const isDualMode = useDualPromptsCheckbox.checked;

    let requestData;
    let endpoint;

    if (isDualMode) {
        // Dual prompt mode
        const p1 = prompt1Input.value.trim();
        const p2 = prompt2Input.value.trim();

        if (!p1 || !p2) {
            showResult('Please enter both prompts', 'error');
            return;
        }

        requestData = { prompt1: p1, prompt2: p2 };
        endpoint = '/api/generate-dual';
    } else {
        // Single prompt mode
        const userPrompt = promptInput.value.trim();

        if (!userPrompt) {
            showResult('Please enter a prompt', 'error');
            return;
        }

        requestData = { prompt: userPrompt };
        endpoint = '/api/generate';
    }

    // UI feedback
    generateBtn.disabled = true;
    btnText.textContent = isDualMode ? 'Generating with dual prompts...' : (useGeminiCheckbox.checked ? 'Enhancing with Gemini...' : 'Generating...');
    loader.style.display = 'inline-block';
    resultSection.style.display = 'none';
    enhancedSection.style.display = 'none';

    try {
        let finalPrompt = requestData.prompt;

        // Step 1: Enhance with Gemini if enabled (single mode only)
        if (!isDualMode && useGeminiCheckbox.checked) {
            const enhanceResponse = await fetch('/api/enhance-prompt', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ text: requestData.prompt })
            });

            if (enhanceResponse.ok) {
                const enhanceData = await enhanceResponse.json();
                finalPrompt = enhanceData.enhanced;

                // Show enhanced prompt
                enhancedPrompt.textContent = finalPrompt;
                enhancedSection.style.display = 'block';

                console.log('✨ Prompt enhanced by Gemini');
            } else {
                console.warn('Failed to enhance, using original prompt');
            }

            btnText.textContent = 'Generating Image...';
            requestData.prompt = finalPrompt;
        }

        // Step 2: Generate image with final prompt(s)

        // UX: Show cold start warning if it takes too long
        const coldStartTimer = setTimeout(() => {
            btnText.textContent = '❄️ Waking up GPU (Cold Start)... please wait ~2m';
            resultMessage.textContent = '❄️ The server is waking up from sleep. This first request will take longer (1-3 mins). Please be patient!';
            resultMessage.className = 'message info';
            resultSection.style.display = 'block';
        }, 8000); // 8 seconds

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(requestData)
        });

        clearTimeout(coldStartTimer);

        const data = await response.json();

        if (response.ok) {
            showResult(data.message, 'success');

            // Display generated images
            if (data.images && data.images.length > 0) {
                displayImages(data.images);
            }
        } else {
            showResult(data.error || 'Generation failed', 'error');
        }
    } catch (error) {
        showResult('Failed to connect to server', 'error');
    } finally {
        generateBtn.disabled = false;
        btnText.textContent = 'Generate Image';
        loader.style.display = 'none';
    }
}

function displayImages(images) {
    // Create or get images container
    let imagesContainer = document.getElementById('images-container');
    if (!imagesContainer) {
        imagesContainer = document.createElement('div');
        imagesContainer.id = 'images-container';
        imagesContainer.style.marginTop = '20px';
        resultSection.appendChild(imagesContainer);
    }

    // Clear previous images
    imagesContainer.innerHTML = '<h3>Generated Images:</h3>';

    // Display each image
    images.forEach(filename => {
        const imgWrapper = document.createElement('div');
        imgWrapper.style.marginBottom = '15px';

        const img = document.createElement('img');
        img.src = `/output/${filename}`;
        img.alt = 'Generated image';
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        img.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';

        const caption = document.createElement('p');
        caption.textContent = filename;
        caption.style.fontSize = '12px';
        caption.style.color = '#666';
        caption.style.marginTop = '5px';

        imgWrapper.appendChild(img);
        imgWrapper.appendChild(caption);
        imagesContainer.appendChild(imgWrapper);
    });
}

function showResult(message, type) {
    resultMessage.textContent = message;
    resultMessage.className = `message ${type}`;
    resultSection.style.display = 'block';
}

// Generate tab event listeners
generateBtn.addEventListener('click', generateImage);
promptInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        generateImage();
    }
});

// Initialize
checkHealth();
setInterval(checkHealth, 5000);
