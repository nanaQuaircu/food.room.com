import json
from pathlib import Path

TRANSCRIPT = Path(
    r"C:\Users\Duapa Werkspace 007\.cursor\projects\c-xampp-htdocs-Hotel\agent-transcripts"
    r"\144021b9-8a12-41cb-b15a-7c53f6ea4e55\144021b9-8a12-41cb-b15a-7c53f6ea4e55.jsonl"
)
OUT = Path(r"c:\xampp\htdocs\Hotel\hotel-pms\src\styles\login.css")

slideshow_css = """
.login-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 4rem;
  color: #fff;
  position: relative;
  overflow: hidden;
  min-height: 100vh;
}

.login-hero__slideshow {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.login-hero__slide {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0;
  transform: scale(1.04);
  transition: opacity 1.2s ease, transform 8s ease;
}

.login-hero__slide.is-active {
  opacity: 1;
  transform: scale(1);
}

.login-hero__slideshow-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    145deg,
    rgba(15, 23, 42, 0.58) 0%,
    rgba(212, 175, 55, 0.38) 45%,
    rgba(15, 23, 42, 0.84) 100%
  );
  z-index: 1;
}

.login-hero__slide-dots {
  position: absolute;
  bottom: 2rem;
  left: 4rem;
  z-index: 3;
  display: flex;
  gap: 0.45rem;
}

.login-hero__slide-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  background: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.login-hero__slide-dot.is-active {
  background: #d4af37;
  transform: scale(1.2);
}

.login-hero__inner {
  position: relative;
  z-index: 2;
  max-width: 480px;
}
"""

old_hero = """.login-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 4rem;
  color: #fff;
  background: linear-gradient(
    145deg,
    rgba(212, 175, 55, 0.92) 0%,
    rgba(201, 78, 40, 0.88) 45%,
    rgba(23, 23, 23, 0.95) 100%
  );
  position: relative;
  overflow: hidden;
}

.login-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.35;
  animation: login-grid-pan 40s linear infinite;
}

.login-hero__inner {
  position: relative;
  max-width: 480px;
}"""

content = None
for line in TRANSCRIPT.open(encoding="utf-8"):
    if "Login page" not in line or "login.css" not in line:
        continue
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        continue
    for block in obj.get("message", {}).get("content", []):
        if not isinstance(block, dict) or block.get("name") != "Write":
            continue
        inp = block.get("input", {})
        if "login.css" not in str(inp.get("path", "")):
            continue
        content = inp.get("contents")
        if content:
            break
    if content:
        break

if not content:
    raise SystemExit("Could not find login.css in transcript")

content = (
    content.replace("#e66239", "#d4af37")
    .replace("#c94e28", "#b8962e")
    .replace("rgba(230, 98, 57,", "rgba(212, 175, 55,")
)

if old_hero in content:
    content = content.replace(old_hero, slideshow_css.strip() + "\n")
elif ".login-hero__slideshow" not in content:
    raise SystemExit("Expected hero block not found for slideshow merge")

content = content.replace(
    "  color: #fff;\n  cursor: pointer;\n  background: linear-gradient(135deg, var(--login-primary) 0%, var(--login-primary-dark) 100%);",
    "  color: #0f172a;\n  cursor: pointer;\n  background: linear-gradient(135deg, var(--login-primary) 0%, var(--login-primary-dark) 100%);",
)

OUT.write_text(content, encoding="utf-8")
print(f"Wrote {OUT} ({len(content)} chars)")
