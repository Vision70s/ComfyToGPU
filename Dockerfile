# -----------------------------
# Base image
# -----------------------------
FROM runpod/worker-comfyui:5.5.0-base

# -----------------------------
# Set working directory
# -----------------------------
WORKDIR /workspace/ComfyUI

# -----------------------------
# No custom nodes
# -----------------------------
# No CRT or other custom nodes, только стандартный ComfyUI

# -----------------------------
# Download models into ComfyUI
# -----------------------------
RUN comfy model download \
    --url https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors \
    --relative-path models/vae \
    --filename qwen_image_vae.safetensors

RUN comfy model download \
    --url https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
    --relative-path models/clip \
    --filename qwen_2.5_vl_7b_fp8_scaled.safetensors

RUN comfy model download \
    --url https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors \
    --relative-path models/diffusion_models \
    --filename qwen_image_edit_2509_fp8_e4m3fn.safetensors

# -----------------------------
# Add only your custom LoRA
# -----------------------------
RUN comfy model download \
    --url https://huggingface.co/Vision70s/QWEN_EDIT_Unchained-XXX.safetensors/resolve/main/QWEN_EDIT_Unchained-XXX.safetensors \
    --relative-path models/loras \
    --filename QWEN_EDIT_Unchained-XXX.safetensors

# -----------------------------
# Base image already has CMD for serverless handler
# Don't override it!
# -----------------------------
# DO NOT add CMD here - base image handles it
