"""
The Pitch Visualizer — Flask Application
=========================================
Ingests narrative text, segments it into scenes using Claude (Anthropic API),
engineers visual prompts, generates images via Pollinations.ai (free, no key),
and renders a storyboard HTML page.
"""

import os
import json
import urllib.parse
import random
from flask import Flask, render_template, request, jsonify
import anthropic
import nltk

# Download NLTK sentence tokenizer on first run
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

app = Flask(__name__)

# ── Anthropic client ──────────────────────────────────────────────────────────
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

# ── Visual styles ─────────────────────────────────────────────────────────────
STYLES = {
    "cinematic": "cinematic photorealistic, 8K, dramatic lighting",
    "digital_art": "dramatic digital art, concept art, highly detailed",
    "ink": "editorial ink illustration, pen and ink, detailed linework",
    "watercolor": "soft watercolor painting, impressionistic, gentle tones",
    "flat": "bold flat graphic design, vibrant colors, clean shapes",
    "noir": "noir film photography, high contrast black and white, moody",
}

# ── System prompt for Claude prompt engineer ──────────────────────────────────
SYSTEM_PROMPT = """You are a visual storyboard director and AI image prompt engineer.
Given a text segment from a sales or customer narrative, craft a richly detailed,
cinematic image generation prompt (40–70 words) that visually represents the moment.

Rules:
- Be specific: describe subjects, setting, lighting, mood, composition, camera angle.
- Do NOT include style/medium keywords — those are added separately.
- Make the scene feel real and emotionally resonant.
- Return ONLY the prompt text, no preamble or explanation."""


def segment_text(text: str) -> list[str]:
    """Split narrative into individual sentences using NLTK."""
    sentences = nltk.sent_tokenize(text)
    # Collapse to max 5 scenes
    if len(sentences) > 5:
        # Merge short trailing sentences
        merged, buf = [], ""
        for s in sentences:
            buf = (buf + " " + s).strip() if buf else s
            if len(buf) > 60:
                merged.append(buf)
                buf = ""
        if buf:
            merged.append(buf)
        sentences = merged[:5]
    return [s.strip() for s in sentences if s.strip()]


def engineer_prompt(sentence: str) -> str:
    """Use Claude to generate an enhanced visual prompt for a sentence."""
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": sentence}],
    )
    return message.content[0].text.strip()


def build_image_url(prompt: str, style_key: str) -> str:
    """Build a Pollinations.ai image URL — free, no API key required."""
    style_suffix = STYLES.get(style_key, STYLES["cinematic"])
    full_prompt = f"{prompt}, {style_suffix}, high quality, professional"
    seed = random.randint(1000, 9999)
    encoded = urllib.parse.quote(full_prompt)
    return (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=768&height=432&nologo=true&seed={seed}"
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", styles=STYLES)


@app.route("/generate", methods=["POST"])
def generate():
    """
    POST /generate
    Body: { "text": "...", "style": "cinematic" }
    Returns: { "scenes": [ { "caption", "prompt", "image_url" }, ... ] }
    """
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    style = data.get("style", "cinematic")

    if not text or len(text) < 20:
        return jsonify({"error": "Please provide at least one or two sentences."}), 400

    segments = segment_text(text)
    if not segments:
        return jsonify({"error": "Could not extract sentences from the input."}), 400

    scenes = []
    for seg in segments:
        enhanced = engineer_prompt(seg)
        img_url = build_image_url(enhanced, style)
        scenes.append({
            "caption": seg,
            "prompt": enhanced,
            "image_url": img_url,
        })

    return jsonify({"scenes": scenes, "style": style})


@app.route("/storyboard")
def storyboard():
    """Render a static storyboard page (optional server-side render)."""
    scenes_json = request.args.get("data", "[]")
    try:
        scenes = json.loads(scenes_json)
    except json.JSONDecodeError:
        scenes = []
    style = request.args.get("style", "cinematic")
    return render_template("storyboard.html", scenes=scenes, style=style)


if __name__ == "__main__":
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("⚠️  Warning: ANTHROPIC_API_KEY not set. Set it before running.")
    app.run(debug=True, port=5000)
