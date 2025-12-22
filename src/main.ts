import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { startWatcher } from './watcher';
import { ComfyService } from './comfy';

dotenv.config();

const INPUT_DIR = path.join(__dirname, '../input');
const COMFY_URL = process.env.COMFY_API_URL || "http://127.0.0.1:8188";

// Ensure input directory exists
if (!fs.existsSync(INPUT_DIR)) {
    console.log(`Creating input directory: ${INPUT_DIR}`);
    fs.mkdirSync(INPUT_DIR, { recursive: true });
}

async function main() {
    console.log("Starting ComfyUI Workflow Automation...");
    console.log(`ComfyUI URL: ${COMFY_URL}`);
    console.log(`Input Directory: ${INPUT_DIR}`);

    const comfyService = new ComfyService(COMFY_URL);

    try {
        await comfyService.init();
    } catch (err) {
        console.error("Failed to connect to ComfyUI. Make sure it's running!", err);
        process.exit(1);
    }

    startWatcher(INPUT_DIR, async (filePath, content) => {
        console.log(`\n-----------------------------------`);
        console.log(`Processing new file: ${path.basename(filePath)}`);

        try {
            // Use file content directly as the prompt
            const prompt = content.trim();
            console.log(`Prompt: ${prompt.substring(0, 100)}...`);

            // Execute ComfyUI Workflow
            console.log("Sending to ComfyUI...");
            await comfyService.execute(prompt);

            console.log("✅ Workflow completed for:", path.basename(filePath));
        } catch (error) {
            console.error("❌ Error processing file:", error);
        }
    });
}

main().catch(console.error);
