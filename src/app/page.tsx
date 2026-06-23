"use client";

import { useState, useRef } from "react";
import TicketList from "@/components/TicketList";
import ExportButtons from "@/components/ExportButtons";

export interface Ticket {
  id: string;
  date: string;
  amount: number;
  rawText: string;
  createdAt: string;
}

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
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

      const newTicket: Ticket = {
        id: crypto.randomUUID(),
        date,
        amount,
        rawText,
        createdAt: new Date().toISOString(),
      };

      setTickets((prev) => [newTicket, ...prev]);
    } catch (err) {
      setError("No se pudo procesar la imagen. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  const deleteTicket = (id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">🎫 Tickets</h1>
        <p className="text-gray-500 text-sm mb-6">
          Tomá foto a tus tickets · Exportá monthly
        </p>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-white mb-6 cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Procesando imagen…</p>
            </div>
          ) : (
            <>
              <p className="text-4xl mb-2">📷</p>
              <p className="text-gray-700 font-medium">
                Tocá o arrastrá una foto del ticket
              </p>
              <p className="text-gray-400 text-xs mt-1">
                También usa la cámara del celular
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
          </h2>
          {tickets.length > 0 && (
            <ExportButtons tickets={tickets} />
          )}
        </div>

        <TicketList tickets={tickets} onDelete={deleteTicket} />
      </div>
    </main>
  );
}
