import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";

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
        // next pattern
      }
    }
  }
  return new Date().toISOString().split("T")[0];
}

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  const uint = new Uint8Array(buffer);
  let text = "";
  let inText = false;
  let current = "";

  for (let i = 0; i < uint.length; i++) {
    const char = String.fromCharCode(uint[i]);
    if (uint[i] === 0x42 && uint[i - 1] === 0x54) {
      inText = true;
      current = "";
    } else if (uint[i] === 0x45 && uint[i - 1] === 0x54) {
      inText = false;
      if (current.trim()) text += current.trim() + "\n";
      current = "";
    } else if (inText && uint[i] >= 32 && uint[i] <= 126) {
      current += char;
    }
  }
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const isPDF = file.type === "application/pdf";

    const ocrPrompt = `Eres un asistente que extrae informacion de tickets de compra.
Devuelve SOLO un JSON con este formato exacto, sin texto adicional ni markdown:
{"date":"YYYY-MM-DD","amount":0.00,"rawText":"texto completo del ticket"}

Reglas:
- date: fecha del ticket en formato ISO (YYYY-MM-DD). Buscar patrones como DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
- amount: monto total del ticket en numeros (sin simbolos de moneda)
- rawText: texto lo mas completo posible del ticket, incluyendo nombre del comercio si aparece

Si no podes determinar la fecha usa la fecha de hoy. Si no hallas monto poné 0.`;

    if (MINIMAX_API_KEY) {
      try {
        let dataUrl: string;
        const mimeType = file.type || "image/jpeg";

        if (isPDF) {
          const text = await extractTextFromPDF(buffer);
          if (text.length > 50) {
            const base64 = arrayBufferToBase64(buffer);
            dataUrl = "data:" + mimeType + ";base64," + base64;
          } else {
            return NextResponse.json({
              date: parseDate(text),
              amount: parseAmount(text),
              rawText: text || "PDF sin texto extraible",
            });
          }
        } else {
          const base64 = arrayBufferToBase64(buffer);
          dataUrl = "data:" + mimeType + ";base64," + base64;
        }

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
                    { type: "text", text: ocrPrompt },
                    { type: "image_url", image_url: { url: dataUrl } },
                  ],
                },
              ],
              temperature: 0.3,
              max_tokens: 1024,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return NextResponse.json({
              date: parsed.date || parseDate(parsed.rawText || content),
              amount: parsed.amount || parseAmount(parsed.rawText || content),
              rawText: parsed.rawText || content,
            });
          }
        } else {
          const errText = await response.text();
          console.error("MiniMax API error:", response.status, errText);
        }
      } catch (err) {
        console.error("MiniMax OCR error:", err);
      }
    }

    // Fallback without LLM
    let text = "";
    if (isPDF) {
      text = await extractTextFromPDF(buffer);
    }
    return NextResponse.json({
      date: parseDate(text),
      amount: parseAmount(text),
      rawText: text || "Configura MINIMAX_API_KEY para OCR con IA",
    });
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
