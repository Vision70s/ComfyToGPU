import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

// Axios configuration with proxy support
const axiosConfig: any = {
    headers: {
        'Content-Type': 'application/json',
    },
    proxy: false,
    timeout: 120000 // 2 minutes for image generation
};

if (proxyUrl) {
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    axiosConfig.httpsAgent = httpsAgent;
    console.log(`[Gemini Imagen] Using proxy: ${proxyUrl}`);
}

export interface ReferenceImage {
    mimeType: string;
    data: string; // base64
}

/**
 * Generate image with Gemini Imagen using reference photos
 * @param characterName - Name of the character
 * @param prompt - Text prompt describing the scene
 * @param referenceImages - Array of reference photos (2-5 images)
 * @param model - 'nana' (fast) or 'nana-pro' (quality)
 * @returns Base64 image data URL
 */
export async function generateWithGeminiImagen(
    characterName: string,
    prompt: string,
    referenceImages: ReferenceImage[],
    model: 'nana' | 'nana-pro' = 'nana'
): Promise<string> {
    // Select model
    const modelName = model === 'nana-pro'
        ? 'gemini-3-pro-image-preview'  // Quality model
        : 'gemini-2.5-flash-image';      // Fast model

    console.log(`[Gemini Imagen] Generating with model: ${modelName}`);
    console.log(`[Gemini Imagen] Character: ${characterName}`);
    console.log(`[Gemini Imagen] Reference images: ${referenceImages.length}`);

    // Build enhanced prompt with character context
    const enhancedPrompt = `${characterName}, ${prompt}
    
Use the provided reference images to match the character's appearance (face, hair, clothing style).
The character should look exactly like in the reference photos.
Style: photorealistic, cinematic lighting, 8k quality, professional photography`;

    // Build request parts: text + reference images
    const parts: any[] = [{ text: enhancedPrompt }];

    referenceImages.forEach(img => {
        parts.push({
            inlineData: {
                mimeType: img.mimeType,
                data: img.data
            }
        });
    });

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

        console.log(`[Gemini Imagen] Sending request to: ${modelName}`);

        const response = await axios.post(
            url,
            {
                contents: [{
                    parts: parts
                }]
            },
            axiosConfig
        );

        const candidates = response.data.candidates;

        if (!candidates || candidates.length === 0) {
            throw new Error('No candidates returned from Gemini');
        }

        // Find image in response
        const responseParts = candidates[0].content.parts;
        const imagePart = responseParts.find((p: any) => p.inlineData);

        if (!imagePart) {
            console.warn('[Gemini Imagen] No inlineData found in response');
            console.log('[Gemini Imagen] Response parts:', JSON.stringify(responseParts, null, 2));
            throw new Error('Model returned text instead of image. Check prompt safety or model capability.');
        }

        const imageData = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        console.log('[Gemini Imagen] Image generated successfully');

        return imageData;

    } catch (error: any) {
        console.error('[Gemini Imagen] Generation failed:', error.message);

        if (axios.isAxiosError(error)) {
            console.error('[Gemini Imagen] Axios error details:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
        }

        throw new Error(`Failed to generate image with ${modelName}: ${error.message}`);
    }
}

/**
 * Generate scene breakdown with character context
 * Used for creating multiple scenes from a scenario
 */
export async function generateScenesWithCharacter(
    characterName: string,
    scenario: string,
    referenceImages: ReferenceImage[]
): Promise<Array<{ description: string; visualPrompt: string }>> {
    const textPrompt = `You are a professional cinematographer and visual prompt engineer.

Analyze the provided reference images to understand the character's appearance.

Character Name: ${characterName}
Scenario: ${scenario}

Task: Break down the scenario into 3-5 distinct visual scenes.

For each scene, provide:
1. A brief description of the action
2. A detailed visual prompt that:
   - Describes ${characterName} matching the reference images
   - Includes camera angle, lighting, and composition
   - Maintains photorealistic, cinematic style

**CRITICAL: Respond with ONLY valid JSON. No extra text.**
Format: [{"description": "...", "visualPrompt": "..."}]`;

    const parts: any[] = [{ text: textPrompt }];

    referenceImages.forEach(img => {
        parts.push({
            inlineData: {
                mimeType: img.mimeType,
                data: img.data
            }
        });
    });

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts }]
            },
            axiosConfig
        );

        const text = response.data.candidates[0].content.parts[0].text;
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(cleanText);
        } catch (e) {
            console.error('[Gemini Imagen] Failed to parse scenes JSON');
            // Fallback
            return [{
                description: `${characterName} - ${scenario.substring(0, 100)}`,
                visualPrompt: cleanText.substring(0, 500)
            }];
        }

    } catch (error: any) {
        console.error('[Gemini Imagen] Scene generation failed:', error.message);
        throw new Error('Failed to generate scenes');
    }
}
