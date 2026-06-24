import { NextRequest, NextResponse } from "next/server";

const PYTHON_OCR_URL = process.env.PYTHON_OCR_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Proxy to Python OCR service
    const pythonFormData = new FormData();
    pythonFormData.append("file", file);

    const res = await fetch(`${PYTHON_OCR_URL}/ocr`, {
      method: "POST",
      body: pythonFormData,
    });

    if (!res.ok) {
      throw new Error(`Python OCR failed: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({
      date: data.date,
      amount: data.amount,
      rawText: data.rawText,
    });
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
