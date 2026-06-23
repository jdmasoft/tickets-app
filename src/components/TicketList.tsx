"use client";

import { Ticket } from "@/app/page";

interface Props {
  tickets: Ticket[];
  onDelete: (id: string) => void;
}

export default function TicketList({ tickets, onDelete }: Props) {
  if (tickets.length === 0) return null;

  return (
    <div className="space-y-2">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3"
        >
          {ticket.imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ticket.imagePreview}
              alt="Ticket"
              className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-gray-900">
                ${ticket.amount.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400">{ticket.date}</span>
            </div>
            <p className="text-xs text-gray-400 truncate max-w-xs">
              {ticket.rawText?.slice(0, 80) || "—"}
            </p>
          </div>
          <button
            onClick={() => onDelete(ticket.id)}
            className="text-gray-300 hover:text-red-400 transition-colors text-sm px-2 py-1 flex-shrink-0"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
