import express from 'express';
import cors from 'cors';
import path from 'path';
import { RunPodService } from './runpod';
import { generatePrompt } from './gemini';
import { generateWithGeminiImagen, ReferenceImage } from './gemini-imagen';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import multer from 'multer';

import { authenticateApiKey, incrementKeyUsage } from './auth';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Production configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

// Middleware
// Logging
if (NODE_ENV === 'production') {
    app.use(morgan('combined'));
} else {
    app.use(morgan('dev'));
}

// CORS configuration
app.use(cors({
    origin: NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
    credentials: true
}));

// Helper to identify user for rate limiting (API Key or IP)
const keyGenerator = (req: any) => {
    return req.apiKey || req.ip;
};

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP/Key to 100 requests per windowMs
    keyGenerator: keyGenerator,
    message: 'Too many requests, please try again later.'
});
// Stricter rate limit for generation endpoints
const generateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    keyGenerator: keyGenerator,
    message: 'Too many generation requests, please wait a moment.'
});

app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configure multer for file uploads (store in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 5 // Max 5 files
    },
    fileFilter: (req, file, cb) => {
        // Only allow images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Initialize RunPod service
const runpodService = new RunPodService();

// Job storage for async processing
interface JobRecord {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: any;
    error?: string;
    startedAt: number;
}

const jobStore = new Map<string, JobRecord>();

// Clean up old jobs after 1 hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [jobId, job] of jobStore.entries()) {
        if (job.startedAt < oneHourAgo) {
            jobStore.delete(jobId);
            console.log(`[JobStore] Cleaned up old job: ${jobId}`);
        }
    }
}, 10 * 60 * 1000); // Clean every 10 minutes

// ========================================
// PUBLIC ENDPOINTS (No rate limiting, No auth)
// ========================================

// Health check (Public, no rate limit)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Get job status endpoint (No rate limit - used for polling)
app.get('/api/status/:jobId', authenticateApiKey, async (req, res) => {
    const { jobId } = req.params;

    try {
        // Check our job store first (for jobs created by /api/generate)
        if (jobStore.has(jobId)) {
            const job = jobStore.get(jobId)!;

            return res.json({
                success: true,
                jobId: jobId,
                status: job.status,
                result: job.result,
                error: job.error
            });
        }

        // If not in our store, try RunPod directly
        const job = await runpodService.getJobStatus(jobId);

        res.json({
            success: true,
            jobId: job.id,
            status: job.status,
            output: job.output,
            error: job.error
        });
    } catch (error: any) {
        console.error('[API] Status check error:', error);
        res.status(500).json({
            error: 'Failed to get job status',
            details: error.message
        });
    }
});

// ========================================
// APPLY RATE LIMITING TO REMAINING ROUTES
// ========================================

// Apply global limiter to all remaining api routes
app.use('/api/', limiter);

// Protect all other API endpoints with authentication
app.use('/api/', authenticateApiKey);

// Enhance prompt with Gemini
app.post('/api/enhance-prompt', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        console.log(`[API] Enhancing prompt: ${text.substring(0, 50)}...`);
        const enhancedPrompt = await generatePrompt(text);

        res.json({
            success: true,
            original: text,
            enhanced: enhancedPrompt
        });
    } catch (error: any) {
        console.error('[API] Gemini Error:', error);
        res.status(500).json({
            error: 'Failed to enhance prompt',
            details: error.message
        });
    }
});

// Chat with Gemini
app.post('/api/chat', async (req, res) => {
    const { message, model, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');

        // Try to configure proxy if available
        const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
        let requestOptions = {};

        if (proxyUrl) {
            console.log(`[Gemini] Using proxy: ${proxyUrl}`);
            const { HttpsProxyAgent } = await import('https-proxy-agent');
            requestOptions = {
                fetch: (url: string, init: any) => {
                    return fetch(url, {
                        ...init,
                        agent: new HttpsProxyAgent(proxyUrl)
                    });
                }
            };
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

        const geminiModel = genAI.getGenerativeModel({
            model: model || "gemini-2.0-flash-exp"
        });

        // Build conversation history
        const chat = geminiModel.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(message);
        const response = result.response;
        const text = response.text();

        res.json({
            success: true,
            response: text,
            model: model || "gemini-2.0-flash-exp"
        });
    } catch (error: any) {
        console.error('[API] Chat Error:', error);
        res.status(500).json({
            error: 'Chat failed',
            details: error.message
        });
    }
});

// Generate image endpoint (Image Editing) - Returns jobId immediately
app.post('/api/generate', generateLimiter, async (req, res) => {
    const { prompt, image, useLora, loraStrength, clipStrength } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    try {
        console.log(`[API] Generating image with prompt: ${prompt.substring(0, 50)}...`);
        if (image) {
            console.log(`[API] With input image provided`);
        }
        if (useLora !== undefined) {
            console.log(`[API] Use LoRA: ${useLora}`);
        }
        if (loraStrength !== undefined) {
            console.log(`[API] LoRA strength: ${loraStrength}`);
        }
        if (clipStrength !== undefined) {
            console.log(`[API] CLIP strength: ${clipStrength}`);
        }

        // Generate temporary jobId
        const tempJobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Store job as pending
        jobStore.set(tempJobId, {
            status: 'pending',
            startedAt: Date.now()
        });

        // Return jobId immediately (don't wait for completion)
        res.json({
            success: true,
            jobId: tempJobId,
            message: 'Job started, use /api/status/:jobId to check progress',
            status: 'pending'
        });

        // Start processing in background
        console.log(`[API] Job ${tempJobId} queued, processing in background...`);

        // Process async (don't await here)
        (async () => {
            try {
                jobStore.set(tempJobId, {
                    status: 'processing',
                    startedAt: Date.now()
                });

                const result = await runpodService.execute(prompt, image);

                jobStore.set(tempJobId, {
                    status: 'completed',
                    result: {
                        success: true,
                        jobId: result.jobId, // RunPod's actual job ID
                        runpodJobId: result.jobId,
                        message: '✅ Image generation completed!',
                        images: result.images
                    },
                    startedAt: Date.now()
                });

                // Increment API key usage counter
                const apiKey = (req as any).apiKey;
                if (apiKey) {
                    incrementKeyUsage(apiKey);
                }

                console.log(`[API] Job ${tempJobId} completed successfully`);
            } catch (error: any) {
                console.error(`[API] Job ${tempJobId} failed:`, error);
                jobStore.set(tempJobId, {
                    status: 'failed',
                    error: error.message,
                    startedAt: Date.now()
                });
            }
        })();

    } catch (error: any) {
        console.error('[API] Error:', error);
        res.status(500).json({
            error: 'Failed to start job',
            details: error.message
        });
    }
});

// Generate image with dual prompts endpoint
app.post('/api/generate-dual', generateLimiter, async (req, res) => {
    const { prompt1, prompt2 } = req.body;

    if (!prompt1 || !prompt2) {
        return res.status(400).json({ error: 'Both prompt1 and prompt2 are required' });
    }

    try {
        console.log(`[API] Generating with dual prompts:`);
        console.log(`[API] Prompt 1: ${prompt1.substring(0, 50)}...`);
        console.log(`[API] Prompt 2: ${prompt2.substring(0, 50)}...`);

        // Execute workflow and wait for completion
        const result = await runpodService.execute(prompt1, prompt2);

        res.json({
            success: true,
            jobId: result.jobId,
            message: '✅ Image generation completed with dual prompts!',
            images: result.images
        });
    } catch (error: any) {
        console.error('[API] Error:', error);
        res.status(500).json({
            error: 'Failed to generate image',
            details: error.message
        });
    }
});

// Generate image with reference photos using Gemini Imagen
app.post('/api/generate-with-references',
    authenticateApiKey,
    generateLimiter,
    upload.array('refImages', 5),
    async (req, res) => {
        try {
            const { characterName, prompt, model } = req.body;
            const files = req.files as Express.Multer.File[];

            // Validation
            if (!characterName || !prompt) {
                return res.status(400).json({
                    error: 'Character name and prompt are required'
                });
            }

            if (!files || files.length < 2) {
                return res.status(400).json({
                    error: 'At least 2 reference images are required'
                });
            }

            if (files.length > 5) {
                return res.status(400).json({
                    error: 'Maximum 5 reference images allowed'
                });
            }

            console.log(`[API] Generating with references:`);
            console.log(`[API] Character: ${characterName}`);
            console.log(`[API] Prompt: ${prompt.substring(0, 50)}...`);
            console.log(`[API] Reference images: ${files.length}`);
            console.log(`[API] Model: ${model || 'nana'}`);

            // Convert files to ReferenceImage format
            const referenceImages: ReferenceImage[] = files.map(file => ({
                mimeType: file.mimetype,
                data: file.buffer.toString('base64')
            }));

            // Generate image with Gemini Imagen
            const imageDataUrl = await generateWithGeminiImagen(
                characterName,
                prompt,
                referenceImages,
                (model as 'nana' | 'nana-pro') || 'nana'
            );

            res.json({
                success: true,
                message: '✅ Image generated with character references!',
                images: [imageDataUrl],
                characterName,
                model: model || 'nana'
            });

        } catch (error: any) {
            console.error('[API] Reference generation error:', error);
            res.status(500).json({
                error: 'Failed to generate image with references',
                details: error.message
            });
        }
    }
);

// Edit image with Qwen on RunPod
app.post('/api/edit-image',
    authenticateApiKey,
    generateLimiter,
    async (req, res) => {
        try {
            const { imageBase64, editPrompt } = req.body;

            if (!imageBase64 || !editPrompt) {
                return res.status(400).json({
                    error: 'Image and edit prompt are required'
                });
            }

            console.log(`[API] Editing image with prompt: ${editPrompt.substring(0, 50)}...`);

            // Use RunPod service to edit the image
            const result = await runpodService.editImage(imageBase64, editPrompt);

            res.json({
                success: true,
                message: '✅ Image edited successfully!',
                images: result.images,
                editPrompt
            });

        } catch (error: any) {
            console.error('[API] Image editing error:', error);
            res.status(500).json({
                error: 'Failed to edit image',
                details: error.message
            });
        }
    }
);



// Check API key quota endpoint
app.get('/api/quota', (req, res) => {
    try {
        const apiKey = (req as any).apiKey;
        const remaining = (req as any).remainingQuota;

        if (!apiKey) {
            return res.status(401).json({ error: 'No API key provided' });
        }

        // Load limits to get full info
        const fs = require('fs');
        const path = require('path');
        const KEY_LIMITS_PATH = path.join(process.cwd(), 'key-limits.json');

        let keyData = null;
        if (fs.existsSync(KEY_LIMITS_PATH)) {
            const limits = JSON.parse(fs.readFileSync(KEY_LIMITS_PATH, 'utf8'));
            keyData = limits[apiKey];
        }

        if (!keyData) {
            return res.json({
                apiKeyName: 'Unknown',
                limit: -1,
                used: 0,
                remaining: -1,
                unlimited: true
            });
        }

        res.json({
            apiKeyName: keyData.name,
            limit: keyData.limit,
            used: keyData.used,
            remaining: keyData.limit === -1 ? -1 : (keyData.limit - keyData.used),
            unlimited: keyData.limit === -1
        });
    } catch (error: any) {
        console.error('[API] Quota check error:', error);
        res.status(500).json({
            error: 'Failed to check quota',
            details: error.message
        });
    }
});

// Start server
async function startServer() {
    try {
        await runpodService.init();
        console.log('✅ Connected to RunPod');

        app.listen(PORT, '0.0.0.0', () => {
            const os = require('os');
            const networkInterfaces = os.networkInterfaces();

            console.log(`🚀 Server running on:`);
            console.log(`   Local:   http://localhost:${PORT}`);
            console.log(`   Mode:    ${NODE_ENV}`);

            // Find and display local IP addresses
            Object.keys(networkInterfaces).forEach(interfaceName => {
                networkInterfaces[interfaceName].forEach((iface: any) => {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        console.log(`   Network: http://${iface.address}:${PORT}`);
                    }
                });
            });

            console.log(`\n📱 To access from phone: use Network URL above`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
