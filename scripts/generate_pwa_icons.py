import zlib
import struct
import math
import os

def create_png(width, height, get_pixel):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type none
        for x in range(width):
            r, g, b, a = get_pixel(x, y, width, height)
            raw_data.extend((r, g, b, a))
            
    compressed = zlib.compress(bytes(raw_data), level=9)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    png.extend(struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc))
    
    # IDAT
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    png.extend(struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc))
    
    # IEND
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    png.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc))
    
    return bytes(png)

def render_quantum_icon(x, y, width, height, is_maskable=False):
    # Normalized coords from center [-1, 1]
    nx = (x - width / 2.0) / (width / 2.0)
    ny = (y - height / 2.0) / (height / 2.0)
    
    # Background gradient: from top-left (9, 13, 22) to bottom-right (30, 27, 75)
    t = (nx + ny + 2.0) / 4.0
    bg_r = int(9 * (1 - t) + 30 * t)
    bg_g = int(13 * (1 - t) + 27 * t)
    bg_b = int(22 * (1 - t) + 75 * t)
    
    # Squircle boundary if not maskable
    if not is_maskable:
        # superellipse |nx|^4 + |ny|^4 <= 0.85^4
        rad_sq = (abs(nx)**3.8 + abs(ny)**3.8)**(1/3.8)
        if rad_sq > 0.90:
            # anti-alias border
            alpha = max(0.0, min(1.0, (0.94 - rad_sq) / 0.04))
            if alpha <= 0:
                return (0, 0, 0, 0)
        else:
            alpha = 1.0
    else:
        alpha = 1.0

    # Scale icon inwards if maskable for safe-zone compliance
    scale = 0.72 if is_maskable else 0.86
    sx = nx / scale
    sy = ny / scale
    
    # Base background
    r, g, b = bg_r, bg_g, bg_b
    
    dist_c = math.sqrt(sx * sx + sy * sy)
    
    # Ellipse 1: rotated 45 deg
    # x1 = (sx + sy) * 0.7071, y1 = (-sx + sy) * 0.7071
    x1 = (sx + sy) * 0.7071
    y1 = (-sx + sy) * 0.7071
    d1 = abs(math.sqrt((x1 / 0.75)**2 + (y1 / 0.30)**2) - 1.0)
    if d1 < 0.12:
        blend1 = max(0.0, 1.0 - d1 / 0.12)
        r = int(r * (1 - blend1) + 56 * blend1)
        g = int(g * (1 - blend1) + 189 * blend1)
        b = int(b * (1 - blend1) + 248 * blend1)

    # Ellipse 2: rotated -45 deg
    x2 = (sx - sy) * 0.7071
    y2 = (sx + sy) * 0.7071
    d2 = abs(math.sqrt((x2 / 0.75)**2 + (y2 / 0.30)**2) - 1.0)
    if d2 < 0.12:
        blend2 = max(0.0, 1.0 - d2 / 0.12)
        r = int(r * (1 - blend2) + 168 * blend2)
        g = int(g * (1 - blend2) + 85 * blend2)
        b = int(b * (1 - blend2) + 247 * blend2)

    # Central Core
    if dist_c < 0.35:
        core_glow = max(0.0, 1.0 - dist_c / 0.35)
        r = int(r * (1 - core_glow) + 14 * core_glow)
        g = int(g * (1 - core_glow) + 165 * core_glow)
        b = int(b * (1 - core_glow) + 233 * core_glow)

    if dist_c < 0.20:
        core_mid = max(0.0, 1.0 - dist_c / 0.20)
        r = int(r * (1 - core_mid) + 99 * core_mid)
        g = int(g * (1 - core_mid) + 102 * core_mid)
        b = int(b * (1 - core_mid) + 241 * core_mid)

    if dist_c < 0.09:
        core_inner = max(0.0, 1.0 - dist_c / 0.09)
        r = int(r * (1 - core_inner) + 255 * core_inner)
        g = int(g * (1 - core_inner) + 255 * core_inner)
        b = int(b * (1 - core_inner) + 255 * core_inner)

    # Orbit nodes
    for (ox, oy, nr, ng, nb) in [
        (0.53, 0.53, 56, 189, 248),
        (-0.53, -0.53, 168, 85, 247),
        (-0.53, 0.53, 6, 182, 212),
        (0.53, -0.53, 129, 140, 248),
    ]:
        d_node = math.sqrt((sx - ox)**2 + (sy - oy)**2)
        if d_node < 0.09:
            node_blend = max(0.0, 1.0 - d_node / 0.09)
            r = int(r * (1 - node_blend) + nr * node_blend)
            g = int(g * (1 - node_blend) + ng * node_blend)
            b = int(b * (1 - node_blend) + nb * node_blend)

    a = int(alpha * 255)
    return (min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)), a)

os.makedirs('public', exist_ok=True)

# 192x192
print("Generating 192x192 icon...")
png_192 = create_png(192, 192, lambda x, y, w, h: render_quantum_icon(x, y, w, h, False))
with open('public/pwa-192x192.png', 'wb') as f:
    f.write(png_192)

# 512x512
print("Generating 512x512 icon...")
png_512 = create_png(512, 512, lambda x, y, w, h: render_quantum_icon(x, y, w, h, False))
with open('public/pwa-512x512.png', 'wb') as f:
    f.write(png_512)

# 512x512 Maskable
print("Generating 512x512 maskable icon...")
png_maskable = create_png(512, 512, lambda x, y, w, h: render_quantum_icon(x, y, w, h, True))
with open('public/pwa-maskable-512x512.png', 'wb') as f:
    f.write(png_maskable)

# 180x180 Apple Touch Icon
print("Generating 180x180 apple-touch-icon...")
png_apple = create_png(180, 180, lambda x, y, w, h: render_quantum_icon(x, y, w, h, True))
with open('public/apple-touch-icon.png', 'wb') as f:
    f.write(png_apple)

# favicon.ico (using 48x48 PNG embedded into ICO format)
print("Generating favicon.ico...")
png_48 = create_png(48, 48, lambda x, y, w, h: render_quantum_icon(x, y, w, h, False))
ico_header = struct.pack('<HHH', 0, 1, 1) # reserved, type (1=icon), count (1)
# ICONDIRENTRY: width, height, colors, reserved, planes, bpp, bytesize, offset
ico_entry = struct.pack('<BBBBHHII', 48, 48, 0, 0, 1, 32, len(png_48), 6 + 16)
with open('public/favicon.ico', 'wb') as f:
    f.write(ico_header + ico_entry + png_48)

print("PWA icons generated successfully!")
