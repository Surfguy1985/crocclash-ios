#!/usr/bin/env python3
"""Generate iOS AppIcon.appiconset and Splash launch images for Croc Clash."""
import os, json, shutil
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/home/user/workspace/croc-clash-ios"
SRC_ICON = "/home/user/workspace/appicon-1024.png"
SRC_SPLASH = "/home/user/workspace/splash-source.png"

ICONSET_DIR = os.path.join(ROOT, "ios-assets", "AppIcon.appiconset")
SPLASH_DIR = os.path.join(ROOT, "ios-assets", "Splash.imageset")
os.makedirs(ICONSET_DIR, exist_ok=True)
os.makedirs(SPLASH_DIR, exist_ok=True)

# --- iOS App Icon sizes (Xcode 14+ unified 1024 marketing icon also accepted, but we generate all classic sizes too) ---
icon_master = Image.open(SRC_ICON).convert("RGB")

# Strip alpha by compositing onto solid color (App Store rejects transparent icons)
def flatten(img, bg=(10, 10, 20)):
    if img.mode == "RGBA":
        bg_img = Image.new("RGB", img.size, bg)
        bg_img.paste(img, mask=img.split()[3])
        return bg_img
    return img.convert("RGB")

icon_master = flatten(icon_master)

# Classic iOS icon spec entries
icon_entries = [
    # iPhone Notification 20pt
    ("Icon-20@2x.png", 40, "iphone", "20x20", "2x"),
    ("Icon-20@3x.png", 60, "iphone", "20x20", "3x"),
    # iPhone Settings 29pt
    ("Icon-29@2x.png", 58, "iphone", "29x29", "2x"),
    ("Icon-29@3x.png", 87, "iphone", "29x29", "3x"),
    # iPhone Spotlight 40pt
    ("Icon-40@2x.png", 80, "iphone", "40x40", "2x"),
    ("Icon-40@3x.png", 120, "iphone", "40x40", "3x"),
    # iPhone App 60pt
    ("Icon-60@2x.png", 120, "iphone", "60x60", "2x"),
    ("Icon-60@3x.png", 180, "iphone", "60x60", "3x"),
    # iPad Notifications 20pt
    ("Icon-20.png", 20, "ipad", "20x20", "1x"),
    ("Icon-20@2x-ipad.png", 40, "ipad", "20x20", "2x"),
    # iPad Settings 29pt
    ("Icon-29.png", 29, "ipad", "29x29", "1x"),
    ("Icon-29@2x-ipad.png", 58, "ipad", "29x29", "2x"),
    # iPad Spotlight 40pt
    ("Icon-40.png", 40, "ipad", "40x40", "1x"),
    ("Icon-40@2x-ipad.png", 80, "ipad", "40x40", "2x"),
    # iPad App 76pt
    ("Icon-76.png", 76, "ipad", "76x76", "1x"),
    ("Icon-76@2x.png", 152, "ipad", "76x76", "2x"),
    # iPad Pro App 83.5pt
    ("Icon-83.5@2x.png", 167, "ipad", "83.5x83.5", "2x"),
    # App Store Marketing 1024
    ("Icon-1024.png", 1024, "ios-marketing", "1024x1024", "1x"),
]

contents_images = []
for fname, size, idiom, sz, scale in icon_entries:
    out_path = os.path.join(ICONSET_DIR, fname)
    resized = icon_master.resize((size, size), Image.LANCZOS)
    resized.save(out_path, "PNG", optimize=True)
    contents_images.append({
        "filename": fname,
        "idiom": idiom,
        "scale": scale,
        "size": sz,
    })

contents = {
    "images": contents_images,
    "info": {"author": "xcode", "version": 1},
}
with open(os.path.join(ICONSET_DIR, "Contents.json"), "w") as f:
    json.dump(contents, f, indent=2)

print(f"AppIcon.appiconset: {len(icon_entries)} files written to {ICONSET_DIR}")

# --- Splash launch image: universal 2732x2732 dark canvas with centered art ---
splash_src = Image.open(SRC_SPLASH).convert("RGB")
canvas_size = 2732
canvas = Image.new("RGB", (canvas_size, canvas_size), (10, 10, 20))
# Fit splash art centered, occupying ~70% of canvas
target = int(canvas_size * 0.72)
splash_resized = splash_src.resize((target, target), Image.LANCZOS)
offset = ((canvas_size - target) // 2, (canvas_size - target) // 2)
canvas.paste(splash_resized, offset)
splash_path = os.path.join(SPLASH_DIR, "splash-2732x2732.png")
canvas.save(splash_path, "PNG", optimize=True)

# Also produce @1x and @3x for the imageset (Capacitor splash plugin uses universal)
canvas.resize((1366, 1366), Image.LANCZOS).save(os.path.join(SPLASH_DIR, "splash-2732x2732-1.png"), "PNG", optimize=True)
canvas.resize((2048, 2048), Image.LANCZOS).save(os.path.join(SPLASH_DIR, "splash-2732x2732-2.png"), "PNG", optimize=True)

splash_contents = {
    "images": [
        {"idiom": "universal", "filename": "splash-2732x2732-1.png", "scale": "1x"},
        {"idiom": "universal", "filename": "splash-2732x2732-2.png", "scale": "2x"},
        {"idiom": "universal", "filename": "splash-2732x2732.png", "scale": "3x"},
    ],
    "info": {"author": "xcode", "version": 1},
}
with open(os.path.join(SPLASH_DIR, "Contents.json"), "w") as f:
    json.dump(splash_contents, f, indent=2)

print(f"Splash.imageset written to {SPLASH_DIR}")

# Also drop a copy of the 1024 marketing icon at top of project for App Store Connect upload
shutil.copy(SRC_ICON, os.path.join(ROOT, "ios-assets", "marketing-icon-1024.png"))
print("Done.")
