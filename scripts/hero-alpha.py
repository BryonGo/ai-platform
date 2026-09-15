#!/usr/bin/env python3
"""黑底 JPEG 素材 → 带 alpha 的 WebP/PNG（首页 hero 背景用）。

为什么需要这个脚本：出图方只能给 JPEG（没有透明通道），而首页 hero 的背景位要的是
「融进深色画布、没有矩形边界」的素材。这里用**亮度键控**把黑底转成真透明：

    alpha = smoothstep(亮度, lo, hi) ** 0.85

因为这类画的背景就是"压得很暗的烟雾与星点"，所以亮度天然就是一张质量不错的
遮罩：暗到阈值以下的部分全透明，烟雾保留层次，主体（皮肤/布料/毛）远高于阈值，
保持不透明。

两个必须做的补充处理：

1. **反预乘（unpremultiply）**：JPEG 是"压在黑底上的合成结果"（c = 前景 × alpha）。
   既然我们把 alpha 估出来了，就该把前景色还原成 c / alpha，否则半透明像素
   叠加到任何非纯黑背景上都会偏暗、发灰。
2. **边缘衰减烘焙进 alpha**：CSS 渐隐在到达 box 边界前仍留有可观不透明度，
   而素材右缘恰好还有较亮的烟雾与星点，结果会在内容列右边界留下一条可见竖缝。
   把 smoothstep 做进 alpha 本身，才能精确收到 0（实测：最右/最左/最上一列 alpha = 0）。

用法：

    python3 scripts/hero-alpha.py public/images/daji-hero-2048x960.jpg \\
        --out-webp public/images/daji-hero-alpha.webp \\
        --out-png  public/images/daji-hero-alpha.png

依赖：pillow、numpy（`python3 -m pip install --user pillow numpy`）。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# 亮度键控阈值（0-255，按实测背景分布调过）：
#   ≤16 全透明（背景与 JPEG 暗部噪点），≥64 全不透明（主体），中间按 smoothstep 过渡。
# 阈值调高会让背景雾更干净但烟雾更薄；16/64 是"雾收敛、烟雾仍在、主体无影响"的平衡点。
LO, HI = 16, 64
GAMMA = 0.85
# 边缘衰减宽度（占画布比例）：右侧收口最重要，顶部/左侧只做轻微收口。
RIGHT_FADE, LEFT_FADE, TOP_FADE = 0.14, 0.05, 0.03
# 低于该 alpha 的像素颜色没有意义（除以小数会出彩噪），统一压成中性暗色。
NOISE_FLOOR = 0.06


def smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def convert(src: Path) -> Image.Image:
    arr = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
    h, w = arr.shape[:2]

    lum = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]
    alpha = np.clip((lum - LO / 255) / (HI / 255 - LO / 255), 0, 1) ** GAMMA

    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    alpha = alpha * smoothstep((1 - x) / RIGHT_FADE) * smoothstep(x / LEFT_FADE) * smoothstep(y / TOP_FADE)

    safe = np.maximum(alpha, 1e-3)[..., None]
    pre = np.clip(arr / safe, 0, 1)                                    # 反预乘
    pre = np.where((alpha < NOISE_FLOOR)[..., None], arr * 0.5, pre)   # 低 alpha 去彩噪

    out = np.concatenate([(pre * 255).astype(np.uint8), (alpha * 255).astype(np.uint8)[..., None]], axis=2)
    img = Image.fromarray(out, "RGBA")
    img.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(0.5)))  # 边缘轻羽化，去锯齿
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--out-webp", type=Path, default=None, help="带 alpha 的 WebP（上线用，体积小）")
    ap.add_argument("--out-png", type=Path, default=None, help="带 alpha 的 PNG（兜底/交付用，体积大）")
    ap.add_argument("--width", type=int, default=1512,
                    help="输出宽度（默认 1512 = hero 最大显示宽 756px 的 2 倍视网膜；"
                         "再大对屏幕没有意义，只会让首屏资源变胖）")
    ap.add_argument("--webp-quality", type=int, default=85)
    args = ap.parse_args()

    img = convert(args.src)
    if args.width and img.size[0] > args.width:
        img = img.resize((args.width, round(img.size[1] * args.width / img.size[0])), Image.LANCZOS)
    a = np.asarray(img.getchannel("A"))
    print(f"尺寸 {img.size}｜全透明 {float((a == 0).mean()) * 100:.1f}%"
          f"｜最右列 alpha {int(a[:, -1].max())}｜最上列 {int(a[0, :].max())}")

    if args.out_webp:
        img.save(args.out_webp, "WEBP", quality=args.webp_quality, method=6, exact=True)
        print(f"{args.out_webp}: {args.out_webp.stat().st_size / 1024:.0f} KB")
    if args.out_png:
        img.save(args.out_png, "PNG", optimize=True)
        print(f"{args.out_png}: {args.out_png.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
