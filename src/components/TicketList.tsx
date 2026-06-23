"use client";

import { Ticket } from "@/app/page";

interface Props {
  tickets: Ticket[];
  onDelete: (id: string) => void;
}

export default function TicketList({ tickets, onDelete }: Props) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No hay tickets todavía
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-gray-900">
                ${ticket.amount.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400">{ticket.date}</span>
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5 max-w-xs">
              {ticket.rawText?.slice(0, 80) || "—"}
            </p>
          </div>
          <button
            onClick={() => onDelete(ticket.id)}
            className="ml-3 text-gray-300 hover:text-red-400 transition-colors text-sm px-2 py-1"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
