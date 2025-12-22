import { ComfyApi, CallWrapper, PromptBuilder } from "@saintno/comfyui-sdk";
import fs from 'fs';
import path from 'path';

export class ComfyService {
    private client: ComfyApi;

    constructor(
        private apiUrl: string = "http://127.0.0.1:8188",
        private workflowPath: string = path.join(__dirname, "../z-image_00143_.json")
    ) {
        this.client = new ComfyApi(this.apiUrl);
    }

    async init() {
        await this.client.init();
        console.log("ComfyUI Client initialized");
    }

    async execute(prompt1: string, prompt2?: string): Promise<{ success: boolean; jobId: string; message: string; images: string[] }> {
        console.log("Loading workflow from:", this.workflowPath);

        // Load the workflow JSON
        let workflowJson;
        try {
            const fileContent = fs.readFileSync(this.workflowPath, 'utf-8');
            workflowJson = JSON.parse(fileContent);
        } catch (error) {
            console.error("Failed to load workflow file:", error);
            throw error;
        }

        // If no second prompt provided, use the first prompt for both nodes
        const secondPrompt = prompt2 || prompt1;

        // Initialize PromptBuilder with two inputs
        const workflow = new PromptBuilder(
            workflowJson,
            ["prompt1", "prompt2"],  // Two input keys
            ["84", "85"]  // Track both SaveImage nodes as outputs
        );

        // Map the prompts to their respective nodes
        workflow.setInputNode("prompt1", "45.inputs.text");  // First KSampler node
        workflow.setInputNode("prompt2", "83.inputs.text");  // Second KSampler node

        // Set the prompt values
        workflow.input("prompt1", prompt1);
        workflow.input("prompt2", secondPrompt);

        console.log("Prompt 1 (Node 45):", prompt1.substring(0, 100) + "...");
        console.log("Prompt 2 (Node 83):", secondPrompt.substring(0, 100) + "...");

        console.log("Queuing workflow...");

        return new Promise((resolve, reject) => {
            let jobId: string = '';
            let progress = { current: 0, max: 0 };

            new CallWrapper(this.client, workflow)
                .onPending((id) => {
                    jobId = id || 'unknown';
                    console.log(`Job pending: ${id}`);
                })
                .onStart((id) => {
                    console.log(`Job started: ${id}`);
                })
                .onProgress((info) => {
                    progress = { current: info.value, max: info.max };
                    console.log(`Node progress: ${info.value}/${info.max}`);
                })
                .onFinished((data) => {
                    console.log("✅ Job finished successfully!");
                    console.log("Output data:", data);

                    // Extract image information from data
                    const images: string[] = [];
                    const outputData = data as any;

                    console.log('Full output data:', JSON.stringify(outputData, null, 2));

                    // ComfyUI returns data in _raw property
                    if (outputData && outputData._raw) {
                        Object.keys(outputData._raw).forEach((nodeId) => {
                            const nodeOutput = outputData._raw[nodeId];
                            console.log(`Node ${nodeId}:`, nodeOutput);

                            if (nodeOutput.images) {
                                nodeOutput.images.forEach((img: any) => {
                                    console.log(`  Found image: ${img.filename}`);
                                    images.push(img.filename);
                                });
                            }
                        });
                    }

                    console.log('Extracted images:', images);

                    resolve({
                        success: true,
                        jobId,
                        message: 'Image generation completed successfully',
                        images
                    });
                })
                .onFailed((err) => {
                    console.error("❌ Job failed:", err);
                    reject(err);
                })
                .run();
        });
    }
}
