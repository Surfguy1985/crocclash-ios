#!/usr/bin/env python3
"""Composite App Store marketing screenshots for Croc Clash.
Apple requires iPhone 6.9" (1320x2868 portrait OR 2868x1320 landscape) and iPad 13" (2064x2752 OR 2752x2064 landscape).
We produce landscape since the game is landscape-locked.
"""
import os, glob
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = "/home/user/workspace/croc-clash-ios"
RAW = os.path.join(ROOT, "raw-captures")
OUT = os.path.join(ROOT, "app-store-screenshots")
os.makedirs(OUT, exist_ok=True)

# Raw captures available (from Playwright, 2400x1200)
SOURCES = {
    "menu":   os.path.join(RAW, "02-after-brawl.png"),     # main menu with brand
    "powers": os.path.join(RAW, "04c-powers-set.png"),     # power selection
    "round1": os.path.join(RAW, "09c-late-fight.png"),     # ROUND 1 announce
    "combat": os.path.join(RAW, "10c-after.png"),          # mid-fight with BONK
}

# Marketing copy for each screenshot
SLIDES = [
    {
        "src": "menu",
        "headline": "TWO CROCS ENTER",
        "subhead": "ONE LEAVES WITH THE GOOD PILLOW",
        "accent": "#ff8c1a",
    },
    {
        "src": "round1",
        "headline": "FAST. FURIOUS. FLUFFY.",
        "subhead": "Branson Pillow Brawl arcade combat",
        "accent": "#ffb84d",
    },
    {
        "src": "combat",
        "headline": "PILLOW WARFARE",
        "subhead": "Smack, dash, parry, rage. Real fighting.",
        "accent": "#ff5050",
    },
    {
        "src": "powers",
        "headline": "10 EPIC POWERS",
        "subhead": "Lightning. Tornado. Saxophone. Yes, really.",
        "accent": "#4dd2ff",
    },
    {
        "src": "round1",
        "headline": "ARCADE COMBAT",
        "subhead": "Vibrant arenas. Flying feathers. 100% chaos.",
        "accent": "#9a6bff",
    },
]

# Try to find a bold sans serif font
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]
def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def crop_to_aspect(img, target_w, target_h):
    """Crop center of image to match target aspect ratio."""
    iw, ih = img.size
    target_ratio = target_w / target_h
    cur_ratio = iw / ih
    if cur_ratio > target_ratio:
        # image too wide → crop width
        new_w = int(ih * target_ratio)
        left = (iw - new_w) // 2
        return img.crop((left, 0, left + new_w, ih))
    else:
        new_h = int(iw / target_ratio)
        top = (ih - new_h) // 2
        return img.crop((0, top, iw, top + new_h))

def draw_centered(draw, text, font, y, canvas_w, fill, stroke=None, stroke_width=0):
    bbox = draw.textbbox((0,0), text, font=font, stroke_width=stroke_width)
    w = bbox[2] - bbox[0]
    x = (canvas_w - w) // 2
    if stroke:
        draw.text((x, y), text, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke)
    else:
        draw.text((x, y), text, font=font, fill=fill)
    return bbox[3] - bbox[1]

def make_screenshot(src_img_path, headline, subhead, accent, target_w, target_h, out_path):
    # Canvas with dark gradient
    canvas = Image.new("RGB", (target_w, target_h), (10, 10, 20))
    draw = ImageDraw.Draw(canvas)
    
    # Vertical gradient overlay
    for y in range(target_h):
        ratio = y / target_h
        r = int(10 + (8 - 10) * ratio)
        g = int(10 + (10 - 10) * ratio)
        b = int(20 + (35 - 20) * ratio)
        draw.line([(0, y), (target_w, y)], fill=(max(0,r), max(0,g), max(0,b)))
    
    # Top accent bar
    draw.rectangle([(0, 0), (target_w, 8)], fill=accent)
    draw.rectangle([(0, target_h-8), (target_w, target_h)], fill=accent)
    
    # Layout: top 22% headline area, middle 70% screenshot, bottom 8% accent
    top_band = int(target_h * 0.20)
    bottom_band = int(target_h * 0.06)
    
    # Headline
    headline_font_size = int(target_h * 0.075)
    sub_font_size = int(target_h * 0.028)
    headline_font = load_font(headline_font_size)
    sub_font = load_font(sub_font_size)
    
    head_h = draw_centered(draw, headline, headline_font, int(target_h * 0.04), target_w,
                            fill=accent, stroke=(0,0,0), stroke_width=4)
    draw_centered(draw, subhead, sub_font, int(target_h * 0.04) + headline_font_size + 14, target_w,
                  fill=(220, 220, 235))
    
    # Game screenshot area
    img_top = top_band + 20
    img_bottom = target_h - bottom_band - 20
    img_h = img_bottom - img_top
    img_w = int(target_w * 0.92)
    img_x = (target_w - img_w) // 2
    
    # Load and fit raw screenshot
    src = Image.open(src_img_path).convert("RGB")
    src = crop_to_aspect(src, img_w, img_h)
    src = src.resize((img_w, img_h), Image.LANCZOS)
    
    # Drop shadow
    shadow = Image.new("RGBA", (img_w + 60, img_h + 60), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([(20, 20), (img_w + 40, img_h + 40)], radius=24, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas.paste(shadow, (img_x - 30, img_top - 20), shadow)
    
    # Rounded corner mask for the screenshot
    mask = Image.new("L", (img_w, img_h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([(0,0), (img_w, img_h)], radius=28, fill=255)
    canvas.paste(src, (img_x, img_top), mask)
    
    # Border around screenshot
    bd = ImageDraw.Draw(canvas)
    bd.rounded_rectangle([(img_x-3, img_top-3), (img_x+img_w+3, img_top+img_h+3)], radius=30, outline=accent, width=4)
    
    canvas.save(out_path, "PNG", optimize=True)
    print(f"  → {os.path.basename(out_path)}")

# Generate for all required device sizes (landscape)
DEVICES = [
    # iPhone 6.9" / 6.7" (1320x2868 portrait → 2868x1320 landscape)
    ("iphone-6.9", 2868, 1320),
    # iPhone 6.5" (legacy, 1242x2688 → 2688x1242 landscape) — still accepted
    ("iphone-6.5", 2688, 1242),
    # iPad 13" (2064x2752 portrait → 2752x2064 landscape)
    ("ipad-13", 2752, 2064),
    # iPad 12.9" (legacy, 2048x2732 → 2732x2048)
    ("ipad-12.9", 2732, 2048),
]

for device_name, w, h in DEVICES:
    print(f"\n=== {device_name} ({w}x{h}) ===")
    for i, slide in enumerate(SLIDES, start=1):
        src_path = SOURCES[slide["src"]]
        out_path = os.path.join(OUT, f"{device_name}_{i:02d}_{slide['src']}.png")
        make_screenshot(src_path, slide["headline"], slide["subhead"], slide["accent"], w, h, out_path)

print("\nAll App Store screenshots generated.")
