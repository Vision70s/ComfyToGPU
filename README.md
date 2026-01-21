# ComfyUI Image Editing + Gemini - WebUI - Cloud serverless GPU/VPS

AI-powered image editing service using **Qwen-based workflows** on RunPod and **Google Gemini** for prompt enhancement.

## �️ Interfaces

| Interface | Description | Status |
|-----------|-------------|--------|
| **[Image Editor](public/test-edit.html)** | **Main Interface**. Interactive AI image editing using Qwen workflow. | ✅ Production |
| **[Content Pipeline](public/modern.html)** | "Conveyor Belt" prototype for batch content creation (Idea -> Video). | 🚧 Prototype |
| **[Studio Dashboard](public/index.html)** | Classic chat & generate interface with Gemini integration. | ✅ Stable |

## 📸 Screenshots
<img width="1119" height="915" alt="image" src="https://github.com/user-attachments/assets/5e5f7d70-7c20-4ae3-90d6-98ad74d9b6ea" />

<img width="1143" height="567" alt="1sc" src="https://github.com/user-attachments/assets/2d2ea3ae-5302-4a2b-bc20-8f0fbfe4fc35" />
<img width="1389" height="499" alt="3sc" src="https://github.com/user-attachments/assets/4e001f3a-1803-40d0-adff-e71e1875abfe" />


<!-- Create a 'docs' folder and add your screenshots there. Uncomment below to display. -->

<!-- 
### Image Editor (Main)
![Editor Interface](docs/screenshot-edit.png)

### Content Pipeline (Prototype)
![Pipeline Interface](docs/screenshot-modern.png)
-->

## ✨ Operations
- **AI Editing**: Replace/modify objects in images using natural language.
- **Prompt Engineering**: Use Gemini to expand simple ideas into professional prompts.
- **Cloud Backend**: Serverless GPU execution via RunPod (no local GPU required).
- **Production Ready**: Built-in rate limiting, logging, and PM2 support.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Set GEMINI_API_KEY, RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID
   ```

3. **Run Locallly**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

## 📦 Deployment (VPS)

1. **Setup PM2**: `npm install -g pm2`
2. **Start Server**: `pm2 start ecosystem.config.js`
3. **Docs**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for full Nginx/HTTPS setup.

## � Configuration

**Required `.env` Variables**:
- `GEMINI_API_KEY`: Google AI Studio key.
- `RUNPOD_API_KEY`: API Key from RunPod.
- `RUNPOD_ENDPOINT_ID`: Endpoint ID for your deployed ComfyUI workflow.

*Default Port: 3000 (Set `PORT` to change)*

## 🏗️ Architecture

```mermaid
graph TD
    subgraph Client
        UI[Web UI / Browser]
        Ed[Image Editor]
    end

    subgraph Server_Layer
        API[Express Server]
        Auth[Auth Middleware]
        Job[Job Manager]
    end

    subgraph AI_Services
        Gemini[Google Gemini API]
        RunPod[RunPod Serverless GPU]
    end

    UI --> |/api/generate| API
    UI --> |/api/chat| API
    
    API --> Auth
    Auth --> Job
    
    Job --> |Enhance Prompt| Gemini
    Job --> |Generate/Edit| RunPod
    
    RunPod --> |Images| Job
    Gemini --> |Text| Job
    
    Job --> |JSON Response| UI
```

### 🔄 Workflow: Image Editing
```mermaid
sequenceDiagram
    participant User
    participant WebUI
    participant Server
    participant Gemini as Gemini AI
    participant RunPod as ComfyUI (RunPod)

    User->>WebUI: Enters Prompt & Uploads Image
    WebUI->>Server: POST /api/generate (edit)
    
    par Prompt Enhancement
        Server->>Gemini: Enhance Prompt
        Gemini-->>Server: Optimized Prompt
    end
    
    Server->>RunPod: Submit Job (Image + Prompt)
    RunPod-->>Server: Job ID
    Server-->>WebUI: Job ID (Pending)
    
    loop Polling
        WebUI->>Server: GET /api/status/:id
        Server->>RunPod: Check Status
        RunPod-->>Server: Status / Result
        Server-->>WebUI: Status update
    end
    
    RunPod-->>Server: Final Image
    Server-->>WebUI: Display Result
```

## 📝 License
MIT
