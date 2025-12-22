# ComfyUI Image Editing + Gemini - Cloud Edition

AI-powered **image editing** service with Gemini prompt enhancement and RunPod cloud computing.

## ✨ Features

- 🖼️ **Image Editing**: Qwen-based image-to-image editing workflow  
- 🤖 **Gemini AI**: Chat with Gemini to create and enhance prompts
- ☁️ **Cloud Computing**: RunPod serverless GPU backend (no local GPU needed)
- 🌐 **Web UI**: Simple, responsive interface
- 🚀 **Production Ready**: Rate limiting, logging, PM2 deployment

## 🏗️ Architecture

```
User → Web UI → Express Server (VPS) → RunPod Serverless → qwen_image_edit_2509 → Edited Images
                       ↓
                   Gemini API (prompt enhancement)
```

## 🎨 Current Workflow

**Image Editing Workflow** (`workflow-image-edit.json`):
- Model: `qwen_image_edit_2509_fp8`
- Input: Reference image + Text prompt
- Output: Edited image based on prompt
- Example: "Replace the cat with a dalmatian"

## 📋 Prerequisites

### For Development:
- Node.js 18+
- npm

### For Production (VPS):
- Ubuntu 20.04+ VPS
- Domain name (optional, for HTTPS)
- RunPod account with image editing workflow deployed
- Google Gemini API key

## 🚀 Quick Start (Local Development)

1. **Clone and Install**
```bash
git clone <your-repo>
cd ComfyUIui
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your keys
```

Required `.env` variables:
```env
GEMINI_API_KEY=your_gemini_api_key
RUNPOD_API_KEY=your_runpod_api_key
RUNPOD_ENDPOINT_ID=your_endpoint_id
```

3. **Set Up RunPod Workflow**

   a. Go to [comfy.getrunpod.io](https://comfy.getrunpod.io)
   
   b. Upload your `workflow-image-edit.json` (or `example-request (1)5prod.json`)
   
   c. Click "Analyze" to detect dependencies
   
   d. Deploy to RunPod Serverless
   
   e. Copy Endpoint ID to `.env`

4. **Start Development Server**
```bash
npm run dev
```

Visit `http://localhost:3000`

## 📦 Production Deployment (VPS)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed VPS setup instructions.

Quick summary:
```bash
# On your VPS
npm install -g pm2
npm install
cp .env.example .env
# Edit .env
pm2 start ecosystem.config.js
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `RUNPOD_API_KEY` | RunPod API key | Yes |
| `RUNPOD_ENDPOINT_ID` | RunPod serverless endpoint ID | Yes |
| `NODE_ENV` | `development` or `production` | No (default: development) |
| `PORT` | Server port | No (default: 3000) |
| `ALLOWED_ORIGINS` | CORS allowed origins (production) | No |

### Rate Limits

Default limits (configurable in `src/server.ts`):
- General API: 100 requests per 15 minutes
- Image generation: 5 requests per minute

## 📁 Project Structure

```
├── src/
│   ├── server.ts       # Express server + API routes
│   ├── runpod.ts       # RunPod service integration
│   ├── gemini.ts       # Gemini AI prompt enhancement
│   └── watcher.ts      # File watcher (optional)
├── public/
│   ├── index.html      # Web UI
│   ├── app.js          # Frontend JavaScript
│   └── style.css       # Styles
├── workflow-image-edit.json  # Image editing workflow
├── ecosystem.config.js # PM2 configuration
├── nginx.conf          # Nginx reverse proxy config
├── DEPLOYMENT.md       # Deployment guide
└── .env.example        # Environment template
```

## 🔌 API Endpoints

### Health Check
```
GET /api/health
```

### Chat with Gemini
```
POST /api/chat
Body: { message: string, model?: string, history?: array }
```

### Enhance Prompt
```
POST /api/enhance-prompt
Body: { text: string }
```

### Generate/Edit Image
```
POST /api/generate
Body: { prompt: string }
```

Example:
```json
{
  "prompt": "Replace the cat with a dalmatian"
}
```

### Check Job Status
```
GET /api/job-status/:jobId
```

## 💰 Cost Considerations

RunPod charges for GPU usage time. To optimize costs:
- ✅ Rate limiting is enabled by default
- ✅ Consider adding user authentication
- ✅ Monitor usage in RunPod dashboard
- ✅ Use serverless (pay per use) instead of dedicated pods

## 🔐 Security

- Rate limiting prevents API abuse
- CORS restricted to allowed origins in production
- Environment variables kept secret
- HTTPS recommended for production
- See [DEPLOYMENT.md](./DEPLOYMENT.md) security checklist

## 🐛 Troubleshooting

**"Cannot connect to RunPod"**
- Verify `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID`
- Check endpoint status in RunPod dashboard

**"Rate limit exceeded"**
- Wait a moment or adjust limits in `src/server.ts`

**Images not returning**
- Check RunPod dashboard for job status
- Verify workflow is deployed correctly (image editing workflow)
- Check server logs: `pm2 logs` (production) or console (development)

**"Workflow file not found"**
- Make sure `workflow-image-edit.json` exists in project root
- Or update workflow path in `src/runpod.ts` constructor

## 📝 Notes

This version uses the **Qwen Image Edit** workflow for image-to-image editing. 

> **TODO**: Add image upload functionality to allow users to provide reference images through the web UI.

## 📝 License

MIT
