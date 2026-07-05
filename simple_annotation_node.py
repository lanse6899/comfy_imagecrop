"""
ComfyUI Simple Annotation Node
A node that embeds the Simple Annotation application for image annotation
"""

import numpy as np
import base64
import json
import re
from PIL import Image, ImageDraw, ImageFont
import io
import torch


class SimpleAnnotationNode:
    """
    Simple Annotation Node
    Embeds an interactive annotation widget for adding numbered/colored markers to images
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "annotation_data": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "display": "hidden"
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("annotated_image", "prompt_text", "labels_text")
    FUNCTION = "process"
    CATEGORY = "🔵BB image crop"

    def process(self, image, annotation_data):
        """
        Process input image and apply annotations
        """
        # Convert tensor to PIL image
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)

        # Parse annotation data
        markers, prompt_text = self.parse_annotation_data(annotation_data)

        # Draw annotations on the image
        annotated_image = self.draw_annotations(pil_image, markers)

        # Extract labels text
        labels_text = self.extract_labels_text(markers)

        # Convert back to tensor
        result_tensor = self.pil_to_tensor(annotated_image)

        return (result_tensor, prompt_text, labels_text)

    def parse_annotation_data(self, annotation_data_str):
        """
        Parse annotation data from JSON string
        """
        if not annotation_data_str or annotation_data_str.strip() == "":
            return [], ""

        try:
            data = json.loads(annotation_data_str)
            markers = data.get("markers", [])
            prompt_text = data.get("promptText", "")
            return markers, prompt_text
        except json.JSONDecodeError:
            return [], ""

    def extract_labels_text(self, markers):
        """
        Extract labels text from markers
        """
        if not markers:
            return ""

        labels = []
        for marker in markers:
            content = marker.get("content", "")
            if content:
                labels.append(content)

        return " ".join(labels)

    def draw_annotations(self, image, markers):
        """
        Draw annotations on the image
        """
        if image.mode != 'RGBA':
            result_image = image.convert('RGBA')
        else:
            result_image = image.copy()

        # Create drawing layer
        overlay = Image.new('RGBA', result_image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Calculate scale factor based on original image dimensions
        orig_width = result_image.width
        orig_height = result_image.height

        # Color mapping
        color_map = {
            "#ff6b6b": (255, 107, 107, 255),
            "#4ecdc4": (78, 205, 196, 255),
            "#ffe66d": (255, 230, 109, 255),
            "#95e1d3": (149, 225, 211, 255),
            "#f38181": (243, 129, 129, 255),
        }

        # Draw each marker
        for marker in markers:
            x = float(marker.get("x", 0))
            y = float(marker.get("y", 0))
            content = marker.get("content", "")
            color_hex = marker.get("color", "#ff6b6b")
            size = int(marker.get("size", 40))
            text_size = int(marker.get("textSize", 16))

            color = color_map.get(color_hex, (255, 107, 107, 255))

            # If color not in map, try to parse hex
            if color_hex not in color_map:
                color = self.hex_to_rgba(color_hex)

            self.draw_droplet(draw, x, y, size, color, content, text_size, orig_width, orig_height)

        # Composite layers
        result_image = Image.alpha_composite(result_image, overlay)
        result_image = result_image.convert('RGB')

        return result_image

    def draw_droplet(self, draw, x, y, size, color, content, text_size, img_width, img_height):
        """
        Draw a droplet-shaped marker
        """
        radius = int(size * 0.45)

        # Draw circle
        circle_bbox = [
            int(x - radius), int(y - radius),
            int(x + radius), int(y + radius)
        ]
        draw.ellipse(circle_bbox, fill=color)

        # Calculate text size - directly use text_size from HTML for consistency
        # text_size is the actual pixel size used in HTML
        font_size = max(12, text_size)

        # Draw text with white color (no shadow, matching HTML)
        try:
            # Use Segoe UI Bold to match HTML: "Segoe UI", sans-serif (bold)
            font = None

            # Try Segoe UI Bold first (Windows system font)
            import os
            font_paths = [
                "C:/Windows/Fonts/segoeuib.ttf",  # Segoe UI Bold (true bold)
                "C:/Windows/Fonts/seguisb.ttf",   # Segoe UI Semibold
                "C:/Windows/Fonts/arialbd.ttf",   # Arial Bold
                "C:/Windows/Fonts/msyhbd.ttc",    # Microsoft YaHei Bold (Chinese)
                "C:/Windows/Fonts/simhei.ttf",    # SimHei Bold (Chinese)
                "C:/Windows/Fonts/arial.ttf",     # Arial
            ]

            for font_path in font_paths:
                if os.path.exists(font_path):
                    try:
                        font = ImageFont.truetype(font_path, font_size)
                        break
                    except:
                        continue

            if font is None:
                font = ImageFont.load_default(size=font_size)

            # Get text bounding box for centering
            # textbbox returns (left, top, right, bottom) relative to baseline
            bbox = draw.textbbox((0, 0), content, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]

            # Center horizontally at x
            text_x = x - text_width / 2

            # Center vertically at y using bbox metrics
            # bbox[1] is negative (top above baseline), bbox[3] is positive (bottom below baseline)
            # For middle baseline: the middle of bbox should align with y
            # text_y should position the top of text such that the middle aligns with y
            text_y = y - text_height / 2 - bbox[1]

            # Draw main text (no shadow to match HTML)
            draw.text((text_x, text_y), content, fill=(255, 255, 255, 255), font=font)
        except Exception as e:
            # Fallback without font metrics
            draw.text((int(x - 4), int(y - 4)), content, fill=(255, 255, 255, 255))

    def hex_to_rgba(self, hex_color):
        """Convert hex color to RGBA tuple"""
        hex_color = hex_color.lstrip('#')
        if len(hex_color) == 6:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return (r, g, b, 255)
        return (255, 107, 107, 255)

    def tensor_to_pil(self, tensor):
        """Convert tensor to PIL image"""
        if len(tensor.shape) == 3:
            if tensor.shape[0] == 3 or tensor.shape[0] == 1:
                tensor = tensor.permute(1, 2, 0)

        tensor = torch.clamp(tensor, 0, 1)
        numpy_image = tensor.cpu().numpy()
        numpy_image = (numpy_image * 255).astype(np.uint8)

        if len(numpy_image.shape) == 2:
            pil_image = Image.fromarray(numpy_image, mode='L').convert('RGB')
        elif numpy_image.shape[2] == 1:
            pil_image = Image.fromarray(numpy_image.squeeze(), mode='L').convert('RGB')
        else:
            pil_image = Image.fromarray(numpy_image, mode='RGB')

        return pil_image

    def pil_to_tensor(self, pil_image):
        """Convert PIL image to tensor"""
        if pil_image.mode == 'RGBA':
            pil_image = pil_image.convert('RGB')
        elif pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')

        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)

        return tensor


NODE_CLASS_MAPPINGS = {
    "SimpleAnnotationNode": SimpleAnnotationNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpleAnnotationNode": "🔵BB简易图像标注",
}
