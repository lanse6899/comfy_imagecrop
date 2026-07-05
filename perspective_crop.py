import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import math

class PerspectiveCropWithPanel:
    """
    Photoshop风格的透视剪裁节点
    支持四角点拖拽定义透视区域，自动进行透视校正和裁剪
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "top_left_x": ("FLOAT", {
                    "default": 100.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "top_left_y": ("FLOAT", {
                    "default": 100.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "top_right_x": ("FLOAT", {
                    "default": 300.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "top_right_y": ("FLOAT", {
                    "default": 100.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "bottom_left_x": ("FLOAT", {
                    "default": 100.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "bottom_left_y": ("FLOAT", {
                    "default": 300.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "bottom_right_x": ("FLOAT", {
                    "default": 300.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "bottom_right_y": ("FLOAT", {
                    "default": 300.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "auto_size": ("BOOLEAN", {
                    "default": False,
                    "label_on": "自适应",
                    "label_off": "手动"
                }),
                "output_width": ("INT", {
                    "default": 512,
                    "min": 64,
                    "max": 2048,
                    "step": 8
                }),
                "output_height": ("INT", {
                    "default": 512,
                    "min": 64,
                    "max": 2048,
                    "step": 8
                }),
                "fill_color": (["black", "white", "transparent"], {
                    "default": "black"
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("cropped_image", "preview_image")
    FUNCTION = "perspective_crop"
    CATEGORY = "🔵BB image crop"
    
    def perspective_crop(self, image, top_left_x, top_left_y, top_right_x, top_right_y,
                        bottom_left_x, bottom_left_y, bottom_right_x, bottom_right_y,
                        auto_size, output_width, output_height, fill_color):
        """
        透视剪裁主函数
        """
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)
        
        # 使用用户在面板中点击的角点
        src_points = np.array([
            [top_left_x, top_left_y],           # 左上
            [top_right_x, top_right_y],         # 右上  
            [bottom_right_x, bottom_right_y],   # 右下
            [bottom_left_x, bottom_left_y]      # 左下
        ], dtype=np.float32)
        
        # 如果启用自适应尺寸，计算最佳输出尺寸
        if auto_size:
            output_width, output_height = self.calculate_adaptive_size(src_points)
        
        # 定义目标矩形的四个角点
        dst_points = np.array([
            [0, 0],                           # 左上
            [output_width, 0],                # 右上
            [output_width, output_height],    # 右下
            [0, output_height]                # 左下
        ], dtype=np.float32)
        
        # 执行透视变换
        transformed_image = self.apply_perspective_transform(
            pil_image, src_points, dst_points, output_width, output_height, fill_color
        )
        
        # 生成预览图像
        preview_image = self.create_preview(
            pil_image, src_points
        )
        
        # 转换回tensor
        cropped_tensor = self.pil_to_tensor(transformed_image)
        preview_tensor = self.pil_to_tensor(preview_image)
        
        return (cropped_tensor, preview_tensor)
    
    def calculate_adaptive_size(self, src_points):
        """
        根据透视四边形计算最佳输出尺寸
        """
        # 计算四边形的边长
        top_width = np.linalg.norm(src_points[1] - src_points[0])      # 上边
        bottom_width = np.linalg.norm(src_points[2] - src_points[3])   # 下边
        left_height = np.linalg.norm(src_points[3] - src_points[0])    # 左边
        right_height = np.linalg.norm(src_points[2] - src_points[1])   # 右边
        
        # 取平均值作为输出尺寸
        avg_width = int((top_width + bottom_width) / 2)
        avg_height = int((left_height + right_height) / 2)
        
        # 确保尺寸在合理范围内
        min_size = 64
        max_size = 2048
        
        output_width = max(min_size, min(max_size, avg_width))
        output_height = max(min_size, min(max_size, avg_height))
        
        # 确保是8的倍数（常见的图像处理要求）
        output_width = (output_width // 8) * 8
        output_height = (output_height // 8) * 8
        
        return output_width, output_height
    
    def apply_perspective_transform(self, image, src_points, dst_points, width, height, fill_color):
        """
        应用透视变换
        """
        try:
            # 尝试使用 OpenCV（如果可用）
            import cv2
            
            # 转换PIL图像为numpy数组
            img_array = np.array(image)
            
            # 确保点的顺序正确：左上、右上、右下、左下
            src_pts = np.float32(src_points)
            dst_pts = np.float32(dst_points)
            
            # 计算透视变换矩阵
            matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)
            
            # 应用透视变换
            if fill_color == "white":
                borderValue = (255, 255, 255)
            elif fill_color == "transparent":
                borderValue = (0, 0, 0, 0)
                # 确保图像有alpha通道
                if len(img_array.shape) == 3 and img_array.shape[2] == 3:
                    alpha = np.ones((img_array.shape[0], img_array.shape[1], 1), dtype=img_array.dtype) * 255
                    img_array = np.concatenate([img_array, alpha], axis=2)
            else:
                borderValue = (0, 0, 0)
            
            transformed = cv2.warpPerspective(
                img_array, matrix, (width, height),
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=borderValue
            )
            
            # 转换回PIL图像
            if fill_color == "transparent":
                result_image = Image.fromarray(transformed, 'RGBA')
            else:
                result_image = Image.fromarray(transformed, 'RGB')
                
        except ImportError:
            # 如果没有OpenCV，使用简化的实现
            result_image = self.simple_perspective_transform(
                image, src_points, dst_points, width, height, fill_color
            )
        except Exception as e:
            # 如果OpenCV变换失败，使用PIL实现
            result_image = self.simple_perspective_transform(
                image, src_points, dst_points, width, height, fill_color
            )
        
        return result_image
    
    def simple_perspective_transform(self, image, src_points, dst_points, width, height, fill_color):
        """
        简化的透视变换实现（当OpenCV不可用时）
        使用PIL的transform方法
        """
        # 创建输出图像
        if fill_color == "white":
            result_image = Image.new('RGB', (width, height), (255, 255, 255))
        elif fill_color == "transparent":
            result_image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            if image.mode != 'RGBA':
                image = image.convert('RGBA')
        else:
            result_image = Image.new('RGB', (width, height), (0, 0, 0))
        
        try:
            # 使用PIL的transform方法进行透视变换
            coeffs = self.find_coeffs(dst_points, src_points)
            
            # 应用透视变换
            transformed = image.transform(
                (width, height),
                Image.Transform.PERSPECTIVE,
                coeffs,
                Image.Resampling.BICUBIC
            )
            
            return transformed
            
        except Exception as e:
            # 如果变换失败，返回调整大小的原图
            return image.resize((width, height), Image.Resampling.BICUBIC)
    
    def find_coeffs(self, pa, pb):
        """
        计算PIL透视变换系数
        """
        matrix = []
        for p1, p2 in zip(pa, pb):
            matrix.append([p1[0], p1[1], 1, 0, 0, 0, -p2[0]*p1[0], -p2[0]*p1[1]])
            matrix.append([0, 0, 0, p1[0], p1[1], 1, -p2[1]*p1[0], -p2[1]*p1[1]])

        A = np.matrix(matrix, dtype=np.float64)
        B = np.array(pb).reshape(8)

        try:
            res = np.dot(np.linalg.inv(A.T * A) * A.T, B)
            return np.array(res).reshape(8)
        except:
            # 如果计算失败，返回单位变换
            return [1, 0, 0, 0, 1, 0, 0, 0]
    
    def create_preview(self, image, src_points):
        """
        创建预览图像，显示透视四边形
        """
        preview = image.copy().convert('RGB')
        draw = ImageDraw.Draw(preview)
        
        # 绘制透视四边形
        points = [(int(p[0]), int(p[1])) for p in src_points]
        
        # 绘制四边形边框
        for i in range(4):
            start = points[i]
            end = points[(i + 1) % 4]
            draw.line([start, end], fill=(0, 255, 255), width=3)
        
        # 绘制角点
        for i, point in enumerate(points):
            x, y = point
            size = 8
            
            # 不同颜色标识不同角点
            colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
            color = colors[i]
            
            draw.ellipse([x-size, y-size, x+size, y+size], 
                        fill=color, outline=(255, 255, 255), width=2)
        
        # 显示角点标签
        try:
            font = ImageFont.truetype("arial.ttf", 16)
        except:
            font = None
        
        labels = ["左上", "右上", "右下", "左下"]
        for i, (point, label) in enumerate(zip(points, labels)):
            x, y = point
            draw.text((x + 12, y - 8), label, fill=(255, 255, 255), font=font)
        
        return preview
    
    def tensor_to_pil(self, tensor):
        """将tensor转换为PIL图像"""
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
        """将PIL图像转换为tensor"""
        if pil_image.mode == 'RGBA':
            pass
        elif pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)
        
        return tensor


NODE_CLASS_MAPPINGS = {
    "PerspectiveCropWithPanel": PerspectiveCropWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PerspectiveCropWithPanel": "🔵BB透视剪裁",
}
