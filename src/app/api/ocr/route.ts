import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_KEY=process.env.MINIMAX_API_KEY || "";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function parseAmount(text: string): number {
  const patterns = [
    /TOTAL[:\s]*\$?\s*([\d.,]+)/i,
    /\$\s*([\d,]+[.,]\d{2})/,
    /([\d.,]{4,})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/[^\d.,]/g, "").replace(",", ".");
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
}

function parseDate(text: string): string {
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const d = new Date(match[0]);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      } catch {
        // next
      }
    }
  }
  return new Date().toISOString().split("T")[0];
}

async function ocrSpace(imageBase64: string, mimeType: string): Promise<{ text: string; parsed: { date: string; amount: number } }> {
  const formData = new FormData();
  formData.append("base64Image", "data:" + mimeType + ";base64," + imageBase64);
  formData.append("language", "es");
  formData.append("isOverlayRequired", "false");
  formData.append("filetype", mimeType.includes("pdf") ? "PDF" : "PNG");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2"); // Engine 2 = faster/better

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      "apikey": "helloworld", // free tier key
    },
    body: formData,
  });

  if (!res.ok) throw new Error("OCR.space failed");
  const data = await res.json();

  const text = data.ParsedResults?.[0]?.ParsedText || "";
  return {
    text,
    parsed: {
      date: parseDate(text),
      amount: parseAmount(text),
    },
  };
}

async function miniMaxOCR(imageBase64: string, mimeType: string) {
  const dataUrl = "data:" + mimeType + ";base64," + imageBase64;

  const response = await fetch(
    "https://api.minimax.chat/v1/text/chatcompletion_v2",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + MINIMAX_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M3.1",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrae de este ticket: fecha (YYYY-MM-DD) y monto total. Responde SOLO JSON: {\"date\":\"YYYY-MM-DD\",\"amount\":0.00,\"rawText\":\"texto del ticket\"}",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error("MiniMax error: " + response.status + " " + err);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      date: parsed.date || parseDate(parsed.rawText || content),
      amount: parsed.amount ?? parseAmount(parsed.rawText || content),
      rawText: parsed.rawText || content,
    };
  }
  throw new Error("No JSON in MiniMax response: " + content);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = file.type || "image/jpeg";
    const isPDF = mimeType === "application/pdf";

    let result: { date: string; amount: number; rawText: string } = {
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      rawText: "",
    };

    // Try MiniMax first if key exists
    if (MINIMAX_API_KEY) {
      try {
        result = await miniMaxOCR(base64, mimeType);
        return NextResponse.json(result);
      } catch (err) {
        console.error("MiniMax OCR failed, falling back to OCR.space:", err);
      }
    }

    // Fallback: OCR.space
    try {
      const ocrResult = await ocrSpace(base64, mimeType);
      result = {
        date: ocrResult.parsed.date,
        amount: ocrResult.parsed.amount,
        rawText: ocrResult.text,
      };
    } catch (err) {
      console.error("OCR.space also failed:", err);
      result.rawText = "Error en OCR. Probá de nuevo.";
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
