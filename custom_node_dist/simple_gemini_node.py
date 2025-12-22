import torch
import numpy as np
from PIL import Image
import io
import os

# Try to import the new SDK
try:
    from google import genai
    from google.genai import types
    import httpx
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

class SimpleGeminiImage:
    """
    Custom ComfyUI node for Gemini/Imagen image generation.
    Supports both text-to-image and image-to-image workflows with proxy support.
    """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "api_key": ("STRING", {"multiline": False, "default": ""}),
                "model_name": ([
                    # Gemini Image Generation (Nano Banana)
                    "gemini-2.5-flash-image",
                    "gemini-3-pro-image-preview",
                    # Imagen Models
                    "imagen-3.0-generate-002",
                    "imagen-4.0-generate-001",
                    "imagen-4.0-fast-generate-001",
                    "imagen-4.0-ultra-generate-001",
                ], {"default": "gemini-2.5-flash-image"}),
                "prompt": ("STRING", {"multiline": True, "default": "A beautiful landscape"}),
            },
            "optional": {
                "images": ("IMAGE",),  # Optional image input for image-to-image
                "proxy_url": ("STRING", {"multiline": False, "default": ""}),  # e.g., http://127.0.0.1:7890
                "aspect_ratio": (["1:1", "16:9", "9:16", "4:3", "3:4"], {"default": "1:1"}),
                "number_of_images": ("INT", {"default": 1, "min": 1, "max": 4}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "text_response")
    FUNCTION = "generate"
    CATEGORY = "SimpleGemini"

    def generate(self, api_key, model_name, prompt, images=None, proxy_url="", aspect_ratio="1:1", number_of_images=1):
        if not HAS_GENAI:
            raise ImportError(
                "Please install 'google-genai' library:\n"
                "pip install google-genai"
            )
        
        if not api_key:
            raise ValueError("API Key is required")

        # Configure HTTP client with proxy if provided
        http_options = {}
        if proxy_url:
            print(f"[SimpleGemini] Using proxy: {proxy_url}")
            http_options = {
                "client": httpx.Client(
                    proxies={"http://": proxy_url, "https://": proxy_url},
                    timeout=60.0
                )
            }
        
        client = genai.Client(api_key=api_key, http_options=http_options)
        is_imagen = model_name.startswith("imagen-")

        try:
            print(f"[SimpleGemini] Using model: {model_name}")
            
            if is_imagen:
                # Imagen: Pure text-to-image generation
                response = client.models.generate_images(
                    model=model_name,
                    prompt=prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=number_of_images,
                        aspect_ratio=aspect_ratio,
                    )
                )
                
                if not response.generated_images:
                    raise RuntimeError("No images returned from Imagen API")
                
                # Get first generated image
                generated_image = response.generated_images[0]
                image_bytes = generated_image.image.image_bytes
                image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                
            else:
                # Gemini: Multimodal generation (text-to-image OR image-to-image)
                contents = [prompt]
                
                # Add input images if provided (for image editing/i2i)
                if images is not None:
                    print(f"[SimpleGemini] Processing {len(images)} input image(s)")
                    for img_tensor in images:
                        # Convert ComfyUI tensor to PIL
                        img_np = (img_tensor.cpu().numpy() * 255).astype(np.uint8)
                        img_pil = Image.fromarray(img_np)
                        contents.append(img_pil)
                
                # Call Gemini API
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                )
                
                # Extract generated image and text from response.parts
                image_pil = None
                text_response = ""
                
                for part in response.parts:
                    if part.text is not None:
                        text_response += part.text
                        print(f"[SimpleGemini] Text: {part.text[:100]}...")
                    elif part.inline_data is not None:
                        # This is the generated image
                        image_pil = part.as_image()
                        print("[SimpleGemini] Image generated successfully")
                
                if image_pil is None:
                    raise RuntimeError(
                        f"No image generated. Response text: {text_response}"
                    )
                
                image_pil = image_pil.convert("RGB")
            
            # Convert PIL to ComfyUI tensor format
            image_np = np.array(image_pil).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image_np)[None,]
            
            return (image_tensor, text_response if not is_imagen else "")

        except Exception as e:
            print(f"[SimpleGemini] ERROR: {e}")
            import traceback
            traceback.print_exc()
            raise e
