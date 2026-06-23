import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_KEY=process.env.MINIMAX_API_KEY || "";
const OLLAMA_URL = "http://ollama:11434";

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

async function ollamaVision(base64: string): Promise<{ date: string; amount: number; rawText: string }> {
  const prompt = `Eres un asistente que extrae informacion de tickets de compra.
Responde SOLO con JSON valido, sin texto adicional:
{"date":"YYYY-MM-DD","amount":0.00,"rawText":"texto del ticket"}

Reglas:
- date: fecha del ticket en formato YYYY-MM-DD (busca DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- amount: monto total en numeros sin simbolos de moneda
- rawText: texto lo mas completo del ticket

Si no podes determinar la fecha usa la fecha de hoy (${new Date().toISOString().split("T")[0]}). Si no hallas monto poné 0.`;

  const res = await fetch(OLLAMA_URL + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llava",
      prompt: prompt,
      images: [base64],
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 512,
      },
    }),
  });

  if (!res.ok) throw new Error("Ollama error: " + res.status);
  const data = await res.json();
  const content = data.response || "";

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      date: parsed.date || parseDate(parsed.rawText || content),
      amount: parsed.amount ?? parseAmount(parsed.rawText || content),
      rawText: parsed.rawText || content,
    };
  }
  // fallback: try basic parsing
  return {
    date: parseDate(content),
    amount: parseAmount(content),
    rawText: content,
  };
}

async function ocrSpace(base64: string, mimeType: string): Promise<{ text: string; parsed: { date: string; amount: number } }> {
  const formData = new FormData();
  formData.append("base64Image", "data:" + mimeType + ";base64," + base64);
  formData.append("language", "es");
  formData.append("filetype", mimeType.includes("pdf") ? "PDF" : "PNG");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { "apikey": "helloworld" },
    body: formData,
  });

  if (!res.ok) throw new Error("OCR.space failed");
  const data = await res.json();
  const text = data.ParsedResults?.[0]?.ParsedText || "";
  return { text, parsed: { date: parseDate(text), amount: parseAmount(text) } };
}

async function miniMaxOCR(base64: string, mimeType: string) {
  const dataUrl = "data:" + mimeType + ";base64," + base64;
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
              { type: "text", text: "Extrae de este ticket: fecha (YYYY-MM-DD) y monto total. Responde SOLO JSON: {\"date\":\"YYYY-MM-DD\",\"amount\":0.00,\"rawText\":\"texto\"}" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
    }
  );

  if (!response.ok) throw new Error("MiniMax error: " + response.status);
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
  throw new Error("No JSON: " + content);
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

    let result = { date: new Date().toISOString().split("T")[0], amount: 0, rawText: "" };

    // 1. Ollama (local, gratis) — Try first
    try {
      result = await ollamaVision(base64);
      return NextResponse.json(result);
    } catch (err) {
      console.error("Ollama failed:", err);
    }

    // 2. MiniMax (cloud)
    if (MINIMAX_API_KEY) {
      try {
        result = await miniMaxOCR(base64, mimeType);
        return NextResponse.json(result);
      } catch (err) {
        console.error("MiniMax failed:", err);
      }
    }

    // 3. OCR.space (free fallback)
    try {
      const ocr = await ocrSpace(base64, mimeType);
      result = { date: ocr.parsed.date, amount: ocr.parsed.amount, rawText: ocr.text };
    } catch (err) {
      console.error("OCR.space failed:", err);
      result.rawText = "Error en OCR. Probá de nuevo.";
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
