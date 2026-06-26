"use client";

import { useState, useRef } from "react";
import TicketList from "@/components/TicketList";
import ExportButtons from "@/components/ExportButtons";
import Image from "next/image";

export interface Ticket {
  id: string;
  date: string;
  amount: number;
  rawText: string;
  createdAt: string;
  imagePreview?: string;
}

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<{
    preview: string;
    date: string;
    amount: number;
    rawText: string;
    _rawJson?: object;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setLoading(true);
    setError("");
    setLastResult(null);
    setConfirming(false);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("OCR falló");

      const data = await res.json();
      const { date, amount, rawText } = data;

      // Create preview URL
      const preview = URL.createObjectURL(file);

      setLastResult({ preview, date, amount, rawText, _rawJson: data });
    } catch (err) {
      setError("No se pudo procesar. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const confirmTicket = () => {
    if (!lastResult) return;

    const newTicket: Ticket = {
      id: crypto.randomUUID(),
      date: lastResult.date,
      amount: lastResult.amount,
      rawText: lastResult.rawText,
      createdAt: new Date().toISOString(),
      imagePreview: lastResult.preview,
    };

    setTickets((prev) => [newTicket, ...prev]);
    setLastResult(null);
    setConfirming(false);
  };

  const discardResult = () => {
    if (lastResult?.preview) {
      URL.revokeObjectURL(lastResult.preview);
    }
    setLastResult(null);
    setConfirming(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      processFile(file);
    }
  };

  const deleteTicket = (id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">🎫 Tickets</h1>
        <p className="text-gray-500 text-sm mb-6">
          Tomá foto · Revisá el escaneo · Exportá por mes
        </p>

        {/* Upload zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-white mb-6 cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
              e.target.value = "";
            }}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">Escaneando con MiniMax M3…</p>
              <p className="text-gray-400 text-xs">Extrayendo fecha y monto</p>
            </div>
          ) : (
            <>
              <p className="text-4xl mb-2">📷</p>
              <p className="text-gray-700 font-medium">Tocá o arrastrá ticket</p>
              <p className="text-gray-400 text-xs mt-1">PNG, JPG, PDF · Cámara del celular</p>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* OCR Result preview */}
        {lastResult && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">📋 Resultado del escaneo</h3>
              <span className="text-xs text-gray-400">Revisá antes de guardar</span>
            </div>

            <div className="flex flex-col md:flex-row">
              {/* Image preview */}
              <div className="md:w-1/2 bg-gray-50 flex items-center justify-center p-4 min-h-48">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lastResult.preview}
                  alt="Ticket escaneado"
                  className="max-h-64 max-w-full object-contain rounded-lg shadow-sm"
                />
              </div>

              {/* Parsed data */}
              <div className="md:w-1/2 p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Fecha</label>
                  <input
                    type="date"
                    value={lastResult.date}
                    onChange={(e) =>
                      setLastResult((r) => r ? { ...r, date: e.target.value } : null)
                    }
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Monto</label>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={lastResult.amount}
                      onChange={(e) =>
                        setLastResult((r) =>
                          r ? { ...r, amount: parseFloat(e.target.value) || 0 } : null
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </div>
                {lastResult.rawText && (
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Texto extraído</label>
                    <p className="mt-1 text-xs text-gray-500 bg-gray-50 rounded-lg p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {lastResult.rawText.slice(0, 300)}
                      {lastResult.rawText.length > 300 ? "…" : ""}
                    </p>
                  </div>
                )}
                {lastResult._rawJson && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600">
                      📄 JSON crudo de la API
                    </summary>
                    <pre className="mt-1 text-xs text-green-600 bg-gray-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-40">
                      {JSON.stringify(lastResult._rawJson, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={confirmTicket}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    ✅ Guardar
                  </button>
                  <button
                    onClick={discardResult}
                    className="px-4 text-gray-400 hover:text-gray-600 text-sm py-2.5 rounded-lg transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ticket list */}
        {tickets.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">
                {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
              </h2>
              <ExportButtons tickets={tickets} />
            </div>
            <TicketList tickets={tickets} onDelete={deleteTicket} />
          </>
        )}

        {tickets.length === 0 && !lastResult && !loading && (
          <div className="text-center py-16 text-gray-400 text-sm">
            <p className="text-5xl mb-3">🧾</p>
            <p>No hay tickets guardados</p>
            <p className="text-xs mt-1">Subí una foto para empezar</p>
          </div>
        )}
      </div>
    </main>
  );
}
