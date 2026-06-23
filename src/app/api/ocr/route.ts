import { NextRequest, NextResponse } from "next/server";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_MODEL = "MiniMax-M3.1";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function parseReceipt(text: string): { date: string; amount: number } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Date: look for common date patterns
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+(\d{2,4})/i,
  ];

  let date = new Date().toISOString().split("T")[0];
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = new Date(match[0]);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString().split("T")[0];
          break;
        }
      } catch {
        // try next pattern
      }
    }
  }

  // Amount: look for currency patterns
  const amountPatterns = [
    /TOTAL[:\s]*\$?\s*([\d,.]{3,})/i,
    /\$\s*([\d,]+\.?\d*)/,
    /([\d,]+\.\d{2})/,
  ];

  let amount = 0;
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/,/g, "");
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  return { date, amount };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = file.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Try MiniMax M3 first
    if (MINIMAX_API_KEY) {
      try {
        const ocrPrompt = `Extrae la informacion de este ticket de compra. Devuelve SOLO un JSON con este formato exacto, sin texto adicional:
{
  "date": "YYYY-MM-DD",
  "amount": 1234.56,
  "rawText": "el texto completo del ticket"
}
Busca la fecha de compra y el monto total. Si no puedes determinar alguno, usa ceros o la fecha actual.`;

        const response = await fetch(
          "https://api.minimax.chat/v1/text/chatcompletion_v2",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${MINIMAX_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: MINIMAX_MODEL,
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
              date: parsed.date || new Date().toISOString().split("T")[0],
              amount: parsed.amount || 0,
              rawText: parsed.rawText || content,
            });
          }
        }
      } catch (err) {
        console.error("MiniMax OCR error:", err);
      }
    }

    // Fallback: parse attempt without LLM (basic)
    return NextResponse.json({
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      rawText: "Usa MiniMax API key para OCR completo",
    });
  } catch (err) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
