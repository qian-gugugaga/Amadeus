import sys, glob, os
from PIL import Image, ImageDraw

d = sys.argv[1]
out = sys.argv[2]
files = sorted(f for f in glob.glob(os.path.join(d, "*.png")) if "grid" not in os.path.basename(f))
if not files:
    sys.exit("no png in " + d)
cols = 3
rows = (len(files) + cols - 1) // cols
w, h = 420, 300
grid = Image.new("RGB", (w * cols, h * rows), (16, 18, 24))
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h))
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, w, 20], fill=(0, 0, 0))
    dr.text((4, 4), os.path.basename(f)[:-4], fill=(120, 220, 255))
    grid.paste(im, (w * (i % cols), h * (i // cols)))
grid.save(out)
print("saved", grid.size, "from", len(files), "files")
