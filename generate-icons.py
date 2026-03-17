from PIL import Image, ImageDraw, ImageFont
import os

public_dir = "/home/user/workspace/proofmedia/client/public"
os.makedirs(public_dir, exist_ok=True)

def create_icon(size):
    """Create a ProofMedia app icon with a shield/checkmark design"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background - rounded rect (teal gradient feel)
    margin = int(size * 0.05)
    radius = int(size * 0.18)
    
    # Base color - dark teal
    bg_color = (15, 118, 110)  # teal-700
    draw.rounded_rectangle([margin, margin, size - margin, size - margin], radius=radius, fill=bg_color)
    
    # Inner lighter area
    inner_margin = int(size * 0.12)
    inner_color = (20, 138, 128)  # teal-600
    draw.rounded_rectangle([inner_margin, inner_margin, size - inner_margin, size - inner_margin], 
                          radius=int(radius * 0.8), fill=inner_color)
    
    # Shield shape
    cx, cy = size // 2, int(size * 0.48)
    sw = int(size * 0.32)  # shield half-width
    sh = int(size * 0.38)  # shield height
    
    shield_points = [
        (cx - sw, cy - int(sh * 0.45)),  # top-left
        (cx, cy - int(sh * 0.55)),        # top-center (slight peak)
        (cx + sw, cy - int(sh * 0.45)),  # top-right
        (cx + sw, cy + int(sh * 0.15)),  # right side
        (cx, cy + int(sh * 0.55)),        # bottom point
        (cx - sw, cy + int(sh * 0.15)),  # left side
    ]
    draw.polygon(shield_points, fill=(255, 255, 255, 40))
    draw.polygon(shield_points, outline=(255, 255, 255, 180), width=max(2, size // 80))
    
    # Checkmark inside shield
    check_size = int(size * 0.14)
    check_cx, check_cy = cx, cy
    check_points = [
        (check_cx - check_size, check_cy),
        (check_cx - int(check_size * 0.3), check_cy + int(check_size * 0.7)),
        (check_cx + check_size, check_cy - int(check_size * 0.6)),
    ]
    draw.line(check_points, fill=(255, 255, 255, 230), width=max(3, size // 40), joint="curve")
    
    # "PM" text at bottom
    try:
        font_size = int(size * 0.12)
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "PM"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    ty = int(size * 0.78)
    draw.text((cx - tw // 2, ty), text, fill=(255, 255, 255, 200), font=font)
    
    return img

# Generate required sizes
for s in [192, 512, 180]:
    icon = create_icon(s)
    if s == 180:
        icon.save(os.path.join(public_dir, "apple-touch-icon.png"), "PNG")
    else:
        icon.save(os.path.join(public_dir, f"icon-{s}x{s}.png"), "PNG")
    print(f"Created {s}x{s} icon")

# Also create favicon.png (32x32)
favicon = create_icon(32)
favicon.save(os.path.join(public_dir, "favicon.png"), "PNG")
print("Created favicon.png")

print("All icons generated!")
