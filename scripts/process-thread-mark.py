"""Build the small transparent logo from the image-generated source.

Run `python scripts/process-thread-mark.py` from anywhere in the repository.
Requires Pillow. The source is docs/assets/thread-mark-source.png.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/assets/thread-mark-source.png"
OUTPUT = ROOT / "app/web/public/thread-mark.png"

source = Image.open(SOURCE).convert("RGB")
mark = Image.new("RGBA", source.size)
input_pixels = source.load()
output_pixels = mark.load()

for y in range(source.height):
    for x in range(source.width):
        red, green, blue = input_pixels[x, y]
        alpha = max(0, min(255, round((max(red, green, blue) - 42) * 2.5)))
        output_pixels[x, y] = (181, 169, 245, alpha)

bounds = mark.getchannel("A").getbbox()
if bounds is None:
    raise RuntimeError("No visible thread mark found in the source image")

mark = mark.crop(bounds)
mark.thumbnail((96, 48), Image.Resampling.LANCZOS)
canvas = Image.new("RGBA", (112, 64))
canvas.alpha_composite(mark, ((112 - mark.width) // 2, (64 - mark.height) // 2))
canvas.save(OUTPUT, optimize=True)
