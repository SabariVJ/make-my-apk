"""Lossless asset compression: pixel values and dimensions must stay identical."""
from pathlib import Path
from PIL import Image
import json

changes = []
for source in Path("public").rglob("*"):
    if source.suffix.lower() not in (".png", ".webp") or source.stat().st_size < 50000:
        continue
    temporary = source.with_name(source.name + ".compressed")
    before = source.stat().st_size
    with Image.open(source) as image:
        if source.suffix.lower() == ".png":
            image.save(temporary, format="PNG", optimize=True, compress_level=9)
        else:
            image.save(temporary, format="WEBP", lossless=True, method=6, exact=True)
        with Image.open(temporary) as candidate:
            assert candidate.size == image.size
            assert candidate.convert("RGBA").tobytes() == image.convert("RGBA").tobytes()
    after = temporary.stat().st_size
    if after < before:
        temporary.replace(source)
        changes.append({"file": str(source).replace("\\", "/"), "beforeBytes": before, "afterBytes": after, "identicalPixels": True})
    else:
        temporary.unlink()
Path("performance-assets.json").write_text(json.dumps(changes, indent=2) + "\n", encoding="utf8")
print(json.dumps(changes))
