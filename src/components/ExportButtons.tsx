"use client";

import { Ticket } from "@/app/page";

interface Props {
  tickets: Ticket[];
}

function toCSV(tickets: Ticket[]): string {
  const header = "date,amount,createdAt\n";
  const rows = tickets
    .map((t) => `${t.date},${t.amount},${t.createdAt}`)
    .join("\n");
  return header + rows;
}

function toJSON(tickets: Ticket[]): string {
  return JSON.stringify(tickets, null, 2);
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function groupByMonth(tickets: Ticket[]): Record<string, Ticket[]> {
  return tickets.reduce(
    (acc, t) => {
      const month = t.date.slice(0, 7); // YYYY-MM
      if (!acc[month]) acc[month] = [];
      acc[month].push(t);
      return acc;
    },
    {} as Record<string, Ticket[]>
  );
}

export default function ExportButtons({ tickets }: Props) {
  const exportCSV = () => {
    downloadBlob(toCSV(tickets), `tickets.csv`, "text/csv");
  };

  const exportJSON = () => {
    downloadBlob(toJSON(tickets), `tickets.json`, "application/json");
  };

  const exportXLSX = () => {
    // Simple HTML table → XML Excel format
    const rows = tickets.map(t => `<tr><td>${t.date}</td><td>${t.amount}</td><td>${t.createdAt}</td></tr>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Tickets">
    <Table>
      <Row><Cell><Data ss:Type="String">Fecha</Data></Cell><Cell><Data ss:Type="Number">Monto</Data></Cell><Cell><Data ss:Type="String">Creado</Data></Cell></Row>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`;
    downloadBlob(xml, `tickets.xls`, "application/vnd.ms-excel");
  };

  const byMonth = groupByMonth(tickets);
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={exportCSV}
        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        CSV
      </button>
      <button
        onClick={exportJSON}
        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        JSON
      </button>
      <button
        onClick={exportXLSX}
        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        Excel
      </button>

      {months.length > 0 && (
        <div className="w-full pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-1">Por mes</p>
          <div className="flex flex-wrap gap-1">
            {months.map((month) => (
              <button
                key={month}
                onClick={() => {
                  const mTickets = byMonth[month];
                  downloadBlob(toCSV(mTickets), `tickets-${month}.csv`, "text/csv");
                }}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded transition-colors"
              >
                {month}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
