#!/usr/bin/env python3
"""Generate the PWA icons in icons/ with no third-party dependencies.

The mark is a stylised QR code: three finder patterns plus a few data
modules, white on port-authority navy. Run from the project root:

    python3 tools/make-icons.py
"""
import struct
import zlib

NAVY = (11, 27, 58)
WHITE = (255, 255, 255)
GRID = 9  # modules across the mark

# Data modules, chosen by hand so the mark looks deliberate at 32 px.
DATA_MODULES = [(4, 0), (4, 2), (5, 4), (3, 4), (7, 4), (4, 6), (6, 6), (7, 7), (4, 8), (6, 8)]


def finder_cells():
    """Module coordinates for the three corner finder patterns."""
    cells = set()
    for ox, oy in ((0, 0), (GRID - 3, 0), (0, GRID - 3)):
        for x in range(3):
            for y in range(3):
                if not (x == 1 and y == 1):  # hollow centre
                    cells.add((ox + x, oy + y))
    return cells


def render(size, safe_fraction):
    """Return `size`x`size` RGB rows. safe_fraction = share of the edge kept clear."""
    inset = int(size * safe_fraction)
    module = (size - 2 * inset) // GRID
    origin = (size - module * GRID) // 2  # re-centre after integer rounding

    marks = finder_cells() | set(DATA_MODULES)
    rows = []
    for y in range(size):
        row = bytearray()
        my = (y - origin) // module if module else -1
        for x in range(size):
            mx = (x - origin) // module if module else -1
            inside = 0 <= mx < GRID and 0 <= my < GRID and origin <= x and origin <= y
            row += bytes(WHITE if inside and (mx, my) in marks else NAVY)
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)
    raw = b"".join(b"\x00" + r for r in rows)  # filter type 0 per scanline

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)
    print(f"{path}  {size}x{size}  {len(png)} bytes")


if __name__ == "__main__":
    write_png("icons/icon-192.png", render(192, 0.12))
    write_png("icons/icon-512.png", render(512, 0.12))
    # Maskable: extra padding so Android can crop to any shape.
    write_png("icons/icon-maskable-512.png", render(512, 0.26))
