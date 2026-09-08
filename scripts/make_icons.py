from PIL import Image, ImageDraw


def make(size: int, path: str) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded dark background (fit for "maskable" purpose: keep within safe zone).
    radius = size * 0.22
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(11, 18, 32, 255))

    # Accent line chart going up across the tile + "V" motif.
    accent = (76, 141, 246, 255)
    up = (34, 196, 123, 255)
    down = (255, 93, 108, 255)

    # V glyph
    d.line(
        [(size * 0.28, size * 0.34), (size * 0.50, size * 0.72), (size * 0.72, size * 0.34)],
        fill=accent,
        width=max(3, int(size * 0.055)),
        joint="curve",
    )

    # Sparkline polyline
    pts = [
        (size * 0.16, size * 0.62),
        (size * 0.33, size * 0.52),
        (size * 0.47, size * 0.66),
        (size * 0.62, size * 0.42),
        (size * 0.80, size * 0.34),
    ]
    d.line(pts, fill=up, width=max(2, int(size * 0.045)), joint="curve")

    # Small end dot
    r = max(3, int(size * 0.04))
    d.ellipse(
        [size * 0.80 - r, size * 0.34 - r, size * 0.80 + r, size * 0.34 + r],
        fill=up,
    )

    img.save(path)
    print(f"wrote {path} ({size}x{size})")


make(192, "public/icons/icon-192.png")
make(512, "public/icons/icon-512.png")
