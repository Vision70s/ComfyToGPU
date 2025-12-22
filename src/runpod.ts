import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export interface RunPodConfig {
    apiKey: string;
    endpointId: string;
    baseUrl?: string;
}

export interface RunPodJob {
    id: string;
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
    output?: any;
    error?: string;
}

export interface GenerateResult {
    success: boolean;
    jobId: string;
    message: string;
    images: string[];
    status?: string;
}

export class RunPodService {
    private config: RunPodConfig;
    private baseUrl: string;
    private workflowPath: string;

    constructor(config?: Partial<RunPodConfig>, workflowPath?: string) {
        this.config = {
            apiKey: config?.apiKey || process.env.RUNPOD_API_KEY || '',
            endpointId: config?.endpointId || process.env.RUNPOD_ENDPOINT_ID || '',
            baseUrl: config?.baseUrl || process.env.RUNPOD_API_URL || 'https://api.runpod.ai/v2'
        };

        if (!this.config.apiKey) {
            throw new Error('RunPod API key is required');
        }
        if (!this.config.endpointId) {
            throw new Error('RunPod endpoint ID is required');
        }

        this.baseUrl = `${this.config.baseUrl}/${this.config.endpointId}`;

        // Use image editing workflow by default
        this.workflowPath = workflowPath || path.join(__dirname, '../workflow-image-edit.json');
    }

    async init() {
        // Verify configuration
        console.log('[RunPod] Initializing...');
        console.log(`[RunPod] Endpoint ID: ${this.config.endpointId}`);
        console.log(`[RunPod] API URL: ${this.baseUrl}`);

        if (!this.config.apiKey || !this.config.endpointId) {
            throw new Error('RunPod API key and Endpoint ID are required');
        }

        console.log('✅ RunPod configuration validated');
        return true;
    }

    private getHeaders() {
        return {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Execute workflow synchronously waits for completion
     */
    async executeSync(prompt: string, imageBase64?: string): Promise<GenerateResult> {
        const workflow = this.buildWorkflow(prompt, imageBase64);

        console.log('[RunPod] Sending synchronous request...');

        // Prepare request payload
        const payload: any = {
            input: {
                workflow: workflow
            }
        };

        // Add images if provided
        if (imageBase64) {
            payload.input.images = [
                {
                    name: "image_qwen_image_edit_2509_input_image.png",
                    image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`
                }
            ];
            console.log('[RunPod] Including input image in request');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/runsync`,
                payload,
                {
                    headers: this.getHeaders(),
                    timeout: 300000, // 5 minutes timeout
                    proxy: false // Disable proxy for RunPod API
                }
            );

            const data = response.data;
            console.log('[RunPod] Job completed:', data.id);
            console.log('[RunPod] Response keys:', Object.keys(data));
            console.log('[RunPod] Output type:', typeof data.output);
            if (data.error) {
                console.log('[RunPod] ERROR from RunPod:', JSON.stringify(data.error, null, 2));
            }
            if (data.output) {
                console.log('[RunPod] Output keys:', Object.keys(data.output));
            }

            return this.processOutput(data);
        } catch (error: any) {
            console.error('[RunPod] Sync execution failed:', error.message);
            if (error.response) {
                console.error('[RunPod] Error response status:', error.response.status);
                console.error('[RunPod] Error response data:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`RunPod execution failed: ${error.message}`);
        }
    }

    /**
     * Execute workflow asynchronously with polling
     */
    async executeAsync(prompt: string, imageBase64?: string): Promise<GenerateResult> {
        const workflow = this.buildWorkflow(prompt, imageBase64);

        console.log('[RunPod] Sending asynchronous request...');
        if (imageBase64) {
            console.log('[RunPod] Including input image in request');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/run`,
                {
                    input: {
                        workflow: workflow,
                        images: imageBase64 ? [
                            {
                                name: 'image_qwen_image_edit_2509_input_image.png',
                                image: imageBase64
                            }
                        ] : undefined
                    }
                },
                {
                    headers: this.getHeaders(),
                    proxy: false // Disable proxy for RunPod API
                }
            );

            const jobId = response.data.id;
            console.log('[RunPod] Job queued:', jobId);

            // Poll for completion
            const maxWaitTime = 10 * 60 * 1000; // 10 minutes
            const pollInterval = 5000; // 5 seconds
            const startTime = Date.now();

            while (Date.now() - startTime < maxWaitTime) {
                const jobStatus = await this.getJobStatus(jobId);

                if (jobStatus.status === 'COMPLETED') {
                    console.log('[RunPod] Job completed successfully');
                    return this.processOutput(jobStatus);
                }

                if (jobStatus.status === 'FAILED') {
                    throw new Error(`Job failed: ${jobStatus.error || 'Unknown error'}`);
                }

                console.log(`[RunPod] Job status: ${jobStatus.status}, waiting...`);

                // Cold start detection
                if (jobStatus.status === 'IN_QUEUE' && (Date.now() - startTime > 15000)) {
                    console.log('❄️ [RunPod] Job is in queue > 15s. Likely COLD START. Waking up GPU...');
                }

                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }

            throw new Error('Job timed out waiting for completion');
        } catch (error: any) {
            console.error('[RunPod] Async execution failed:', error.message);
            if (error.response) {
                console.error('[RunPod] Error response status:', error.response.status);
                console.error('[RunPod] Error response data:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`RunPod execution failed: ${error.message}`);
        }
    }

    /**
     * Check job status
     */
    async getJobStatus(jobId: string): Promise<RunPodJob> {
        try {
            const response = await axios.get(
                `${this.baseUrl}/status/${jobId}`,
                {
                    headers: this.getHeaders(),
                    proxy: false // Disable proxy for RunPod API
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('[RunPod] Status check failed:', error.message);
            throw new Error(`Failed to get job status: ${error.message}`);
        }
    }

    /**
     * Poll job until completion
     */
    async waitForCompletion(jobId: string, maxWaitTime: number = 300000): Promise<GenerateResult> {
        const startTime = Date.now();
        const pollInterval = 2000; // 2 seconds

        while (Date.now() - startTime < maxWaitTime) {
            const job = await this.getJobStatus(jobId);

            console.log(`[RunPod] Job ${jobId} status: ${job.status}`);

            if (job.status === 'COMPLETED') {
                return this.processOutput(job);
            } else if (job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'TIMED_OUT') {
                throw new Error(`Job ${job.status.toLowerCase()}: ${job.error || 'Unknown error'}`);
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error('Job timed out waiting for completion');
    }

    /**
     * Main execute method - uses async by default for image editing
     */
    async execute(prompt: string, imageBase64?: string): Promise<GenerateResult> {
        // Use async execution for image editing (takes >90s with model loading)
        return this.executeAsync(prompt, imageBase64);
    }

    /**
     * Edit image using Qwen workflow
     * Convenient wrapper around execute() specifically for image editing
     */
    async editImage(imageBase64: string, editPrompt: string): Promise<GenerateResult> {
        console.log('[RunPod] Editing image with Qwen...');
        console.log(`[RunPod] Edit prompt: ${editPrompt.substring(0, 50)}...`);

        // Use the standard execute method which handles image editing workflow
        return this.execute(editPrompt, imageBase64);
    }

    /**
     * Build workflow JSON for RunPod (Image Editing)
     */
    private buildWorkflow(prompt: string, imageBase64?: string): any {
        // Load the workflow file
        let workflow: any;

        try {
            const workflowContent = fs.readFileSync(this.workflowPath, 'utf-8');
            const workflowData = JSON.parse(workflowContent);

            // Extract workflow from input wrapper if present
            workflow = workflowData.input?.workflow || workflowData;
        } catch (error) {
            console.error('[RunPod] Failed to load workflow file:', error);
            throw new Error('Failed to load ComfyUI workflow file');
        }

        // Update the positive prompt (node 111)
        if (workflow['111'] && workflow['111'].inputs) {
            workflow['111'].inputs.text = prompt;
            workflow['111'].inputs.prompt = prompt; // RunPod server requires this specifically
        }

        // Negative prompt is usually empty (node 110)
        if (workflow['110'] && workflow['110'].inputs) {
            workflow['110'].inputs.text = '';
            workflow['110'].inputs.prompt = ''; // RunPod server requires this specifically
        }

        // Convert loader nodes from UI format to API format
        // Node 37: UNETLoader
        if (workflow['37'] && workflow['37'].inputs && workflow['37'].inputs.filename) {
            workflow['37'].inputs.unet_name = workflow['37'].inputs.filename;
            workflow['37'].inputs.weight_dtype = 'default';
        }

        // Node 38: CLIPLoader  
        if (workflow['38'] && workflow['38'].inputs && workflow['38'].inputs.filename) {
            workflow['38'].inputs.clip_name = workflow['38'].inputs.filename;
            workflow['38'].inputs.type = 'qwen_image';  // Correct value from API error
        }

        // Node 39: VAELoader
        if (workflow['39'] && workflow['39'].inputs && workflow['39'].inputs.filename) {
            workflow['39'].inputs.vae_name = workflow['39'].inputs.filename;
        }

        // Don't touch LoRA settings - use workflow defaults (0.31 model, 1.0 clip)
        // All LoRA configuration should be in workflow-image-edit.json

        // Node 66: ModelSamplingAuraFlow
        if (workflow['66'] && workflow['66'].inputs && workflow['66'].inputs.value !== undefined) {
            workflow['66'].inputs.shift = workflow['66'].inputs.value;
        }

        // Node 75: CFGNorm
        if (workflow['75'] && workflow['75'].inputs && workflow['75'].inputs.value !== undefined) {
            workflow['75'].inputs.strength = workflow['75'].inputs.value;
        }

        // Randomize seed for varied results (node 3 is KSampler)
        const randomSeed = Math.floor(Math.random() * 1000000000000000);
        if (workflow['3'] && workflow['3'].inputs) {
            workflow['3'].inputs.seed = randomSeed;
        }

        // TODO: Handle image input if provided
        // For now, the workflow expects images to be pre-uploaded to RunPod
        // We'll need to add image upload functionality later

        // Debug: log what nodes we have
        console.log('[RunPod] === FINAL WORKFLOW DEBUG ===');
        console.log('[RunPod] Node 3 (KSampler):', JSON.stringify(workflow['3']?.inputs, null, 2));
        console.log('[RunPod] Node 37 (UNET):', JSON.stringify(workflow['37']?.inputs, null, 2));
        console.log('[RunPod] Node 440 (LoRA):', JSON.stringify(workflow['440']?.inputs, null, 2));
        console.log('[RunPod] Node 66 (ModelSampling):', JSON.stringify(workflow['66']?.inputs, null, 2));
        console.log('[RunPod] Node 75 (CFGNorm):', JSON.stringify(workflow['75']?.inputs, null, 2));
        console.log('[RunPod] Node 110 (Negative Prompt):', JSON.stringify(workflow['110']?.inputs, null, 2));
        console.log('[RunPod] Node 111 (Positive Prompt):', JSON.stringify(workflow['111']?.inputs, null, 2));
        console.log('[RunPod] ==========================');

        return workflow;
    }

    /**
     * Process output from RunPod and extract images
     */
    private processOutput(data: any): GenerateResult {
        const images: string[] = [];

        try {
            // RunPod returns output in different formats
            // Check for common output structures

            console.log('[RunPod] Processing output...');
            console.log('[RunPod] Full data:', JSON.stringify(data, null, 2));
            console.log('[RunPod] data.output exists:', !!data.output);

            if (data.output) {
                console.log('[RunPod] data.output type:', typeof data.output);
                console.log('[RunPod] data.output keys:', Object.keys(data.output));

                // If output contains images array
                if (Array.isArray(data.output.images)) {
                    console.log('[RunPod] Found images array, length:', data.output.images.length);
                    // RunPod returns array of objects {data, filename, type}
                    data.output.images.forEach((img: any) => {
                        if (typeof img === 'string') {
                            images.push(img);
                        } else if (img.data) {
                            // Extract base64 from RunPod object
                            images.push(img.data);
                        }
                    });
                }
                // If output contains base64 images
                else if (data.output.image) {
                    console.log('[RunPod] Found single image field');
                    images.push(data.output.image);
                }
                // If output is structured by node IDs
                else if (typeof data.output === 'object') {
                    console.log('[RunPod] Searching in node outputs...');
                    Object.keys(data.output).forEach(nodeId => {
                        const nodeOutput = data.output[nodeId];
                        console.log(`[RunPod] Checking node ${nodeId}:`, nodeOutput ? Object.keys(nodeOutput) : 'null');

                        if (nodeOutput.images && Array.isArray(nodeOutput.images)) {
                            console.log(`[RunPod] Node ${nodeId} has ${nodeOutput.images.length} images`);
                            nodeOutput.images.forEach((img: any) => {
                                // RunPod returns objects like {data: 'base64...', filename: '...', type: 'base64'}
                                if (typeof img === 'string') {
                                    images.push(img);
                                } else if (img.data) {
                                    // Extract base64 data from RunPod object
                                    images.push(img.data);
                                } else if (img.image || img.base64) {
                                    images.push(img.image || img.base64);
                                }
                            });
                        }
                    });
                }
            }

            console.log('[RunPod] Total images found:', images.length);


            return {
                success: true,
                jobId: data.id,
                message: 'Image generation completed successfully',
                images,
                status: data.status
            };
        } catch (error: any) {
            console.error('[RunPod] Failed to process output:', error);
            return {
                success: false,
                jobId: data.id,
                message: `Failed to process output: ${error.message}`,
                images: []
            };
        }
    }
}
