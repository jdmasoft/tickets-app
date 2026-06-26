"""
FastAPI OCR service for tickets-app.
Handles images and PDFs, returns structured ticket data.
"""
import base64
import io
import re
import sys
from datetime import datetime
from typing import Optional

import fitz  # pymupdf
import pytesseract
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import uvicorn

app = FastAPI(title="OCR Service")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def parse_amount(text: str) -> float:
    """Extract total amount from receipt text."""
    best = 0.0

    # Priority 1: Look for TOTAL line (most reliable)
    total_patterns = [
        r'(?i)TOTAL\s*:?\s*\$?\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})',
        r'(?i)TOTAL\s*:?\s*([\d]+[.,]\d{2})',
    ]
    for pattern in total_patterns:
        for m in re.findall(pattern, text):
            cleaned = m.replace(',', '')
            try:
                val = float(cleaned)
                if val > best:
                    best = val
            except ValueError:
                pass

    # Priority 2: Look for IMPORTE TOTAL or MONTO
    importe_patterns = [
        r'(?i)IMPORTE\s*:?\s*\$?\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})',
        r'(?i)MONTO\s*:?\s*\$?\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})',
    ]
    for pattern in importe_patterns:
        for m in re.findall(pattern, text):
            cleaned = m.replace(',', '')
            try:
                val = float(cleaned)
                if val > best:
                    best = val
            except ValueError:
                pass

    # Priority 3: Currency patterns (skip RUC/NIT lines)
    lines = text.split('\n')
    skip_indicators = ['RUC', 'NIT', 'CI:', 'R.U.T', 'DOC', 'NRO', 'CODIGO']
    for line in lines:
        if any(s in line.upper() for s in skip_indicators):
            continue
        currency_patterns = re.findall(r'\$\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})', line)
        for m in currency_patterns:
            cleaned = m.replace(',', '')
            try:
                val = float(cleaned)
                if val > best:
                    best = val
            except ValueError:
                pass

    # Priority 4: Plain numbers with 2 decimal places
    plain_patterns = re.findall(r'(?<!\d)([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})(?!\d)', text)
    for m in plain_patterns:
        cleaned = m.replace(',', '')
        try:
            val = float(cleaned)
            if val >= 1.00 and val > best:
                best = val
        except ValueError:
            pass

    return round(best, 2)


def parse_date(text: str) -> str:
    patterns = [
        r"(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})",
        r"(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})",
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
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            images.append(img_data)
        doc.close()
    except Exception as e:
        print(f"PDF render error: {e}", file=sys.stderr)
    return images


def extract_text_from_image(buffer: bytes) -> str:
    """Extract text from image using tesseract OCR."""
    try:
        img = Image.open(io.BytesIO(buffer))
        if img.mode not in ("L", "RGB", "RGBA"):
            img = img.convert("RGB")
        try:
            text = pytesseract.image_to_string(img, lang="spa")
        except Exception:
            try:
                text = pytesseract.image_to_string(img, lang="eng")
            except Exception as e:
                print(f"Tesseract error: {e}", file=sys.stderr)
                return ""
        return text.strip()
    except Exception as e:
        print(f"Image OCR error: {e}", file=sys.stderr)
        return ""


def process_image_data(data: bytes) -> dict:
    """Common processing for image data."""
    raw_text = extract_text_from_image(data)
    return {
        "date": parse_date(raw_text),
        "amount": parse_amount(raw_text),
        "rawText": raw_text,
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    """Multipart form upload (file field)."""
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    data = await file.read()
    mime = file.content_type or "image/jpeg"
    is_pdf = mime == "application/pdf" or file.filename.lower().endswith(".pdf")

    raw_text = ""

    if is_pdf:
        raw_text = extract_text_from_pdf(data)
    else:
        raw_text = extract_text_from_image(data)

    return {
        "date": parse_date(raw_text),
        "amount": parse_amount(raw_text),
        "rawText": raw_text,
    }


@app.post("/ocr-json")
async def ocr_json(payload: dict = Body(...)):
    """JSON upload with base64 data URL in 'url' field."""
    data_url = payload.get("url", "")
    if not data_url:
        raise HTTPException(status_code=400, detail="No 'url' field provided")

    # Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
    try:
        header, b64_data = data_url.split(",", 1)
        mime = header.split(";")[0].replace("data:", "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid data URL format")

    try:
        data = base64.b64decode(b64_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    is_pdf = mime == "application/pdf"

    raw_text = ""
    if is_pdf:
        raw_text = extract_text_from_pdf(data)
    else:
        raw_text = extract_text_from_image(data)

    return {
        "date": parse_date(raw_text),
        "amount": parse_amount(raw_text),
        "rawText": raw_text,
    }


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
