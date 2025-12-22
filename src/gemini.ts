import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// System prompt to guide Gemini to output valid ComfyUI prompts
const SYSTEM_INSTRUCTION = `
You are an expert AI Image Prompt Engineer specialized in creating architectural visualization workflows.
The workflow consists of two stages:
1. Creating an orthographic blueprint from a concept.
2. Creating a miniature architectural scale model from that blueprint.

Your task is to take a simple user scenario and convert it into two specific prompts:
1. "blueprint_prompt": Instructions to create a clean, detailed orthographic blueprint (plan, elevation, section).
2. "render_prompt": Instructions to create a photorealistic miniature architectural scale model based on that blueprint.

Input: A short scenario description (e.g., "A futuristic eco-friendly house on Mars").
Output: A JSON object with the following structure:
{
  "blueprint_prompt": "string (orthographic blueprint description...)",
  "render_prompt": "string (miniature scale model description...)"
}
`;

export async function generatePrompts(scenario: string) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp", // or pro
        systemInstruction: SYSTEM_INSTRUCTION
    });

    try {
        const result = await model.generateContent(`Scenario: ${scenario}\nGenerate the JSON prompts.`);
        const response = result.response;
        const text = response.text();

        // Clean up markdown code blocks if present
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanText) as { blueprint_prompt: string; render_prompt: string };
    } catch (error) {
        console.error("Error generating prompts:", error);
        // Fallback
        return {
            blueprint_prompt: `Create an orthographic blueprint for: ${scenario}`,
            render_prompt: `A miniature architectural scale model of: ${scenario}`
        };
    }
}

// Single prompt enhancement for image generation
export async function generatePrompt(userInput: string): Promise<string> {
    const PROMPT_ENHANCEMENT_INSTRUCTION = `
You are an expert AI prompt engineer for image generation.
Take the user's simple description and expand it into a detailed, vivid prompt suitable for AI image generation.

Focus on:
- Visual details (lighting, colors, composition, atmosphere)
- Subject description (pose, expression, clothing, features)
- Environmental context (background, setting, mood)
- Technical aspects (camera angle, photography style, art style)

Keep the output concise but detailed. Output ONLY the enhanced prompt, no JSON or extra text.
`;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        systemInstruction: PROMPT_ENHANCEMENT_INSTRUCTION
    });

    try {
        const result = await model.generateContent(`Enhance this prompt: ${userInput}`);
        const response = result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Error enhancing prompt:", error);
        // Fallback: return original
        return userInput;
    }
}
