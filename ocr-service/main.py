"""
FastAPI OCR service for tickets-app.
Handles images and PDFs, returns structured ticket data.
"""
import base64
import io
import json
import re
import sys
from datetime import datetime

import fitz  # pymupdf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import uvicorn

app = FastAPI(title="OCR Service")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def array_buffer_to_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def parse_amount(text: str) -> float:
    patterns = [
        r"TOTAL[:\s]*\$?\s*([\d.,]+)",
        r"\$\s*([\d,]+)",
        r"([\d,]{3,})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            cleaned = match.group(1).replace(",", ".").replace("[", "").replace("]", "")
            try:
                val = float(cleaned)
                if val > 0:
                    return val
            except ValueError:
                pass
    return 0.0


def parse_date(text: str) -> str:
    patterns = [
        r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})",
        r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                parts = match.groups()
                if len(parts[2]) == 2:
                    year = int(parts[2])
                    parts = (parts[0], parts[1], str(2000 + year if year < 100 else year))
                date_str = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                d = datetime.strptime(date_str, "%Y-%m-%d")
                return d.strftime("%Y-%m-%d")
            except (ValueError, IndexError):
                pass
    return datetime.now().strftime("%Y-%m-%d")


def extract_text_from_pdf(buffer: bytes) -> str:
    """Extract all text from a PDF using pymupdf."""
    text_parts = []
    try:
        doc = fitz.open(stream=buffer, filetype="pdf")
        for page in doc:
            t = page.get_text("text")
            if t.strip():
                text_parts.append(t.strip())
        doc.close()
    except Exception as e:
        print(f"PDF extraction error: {e}", file=sys.stderr)
    return "\n".join(text_parts)


def pdf_to_images(buffer: bytes) -> list[bytes]:
    """Convert PDF pages to images using pymupdf."""
    images = []
    try:
        doc = fitz.open(stream=buffer, filetype="pdf")
        for page_num, page in enumerate(doc):
            mat = fitz.Matrix(2, 2)  # 2x zoom for better quality
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            images.append(img_data)
        doc.close()
    except Exception as e:
        print(f"PDF render error: {e}", file=sys.stderr)
    return images


def extract_text_from_image(buffer: bytes) -> str:
    """Extract text from image using basic heuristics + PIL metadata."""
    # For now, return empty — we rely on MiniMax for actual OCR of images
    # This fallback just returns a placeholder
    return ""


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    data = await file.read()
    mime = file.content_type or "image/jpeg"
    is_pdf = mime == "application/pdf" or file.filename.lower().endswith(".pdf")

    raw_text = ""
    images_base64 = []

    if is_pdf:
        # Extract text from PDF
        raw_text = extract_text_from_pdf(data)
        # Also convert pages to images for vision processing
        images_base64 = [array_buffer_to_base64(img) for img in pdf_to_images(data)]
    else:
        images_base64 = [array_buffer_to_base64(data)]

    result = {
        "date": parse_date(raw_text),
        "amount": parse_amount(raw_text),
        "rawText": raw_text,
        "images": images_base64,  # Send back for MiniMax to process
        "hasImages": len(images_base64) > 0,
    }

    return result


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
