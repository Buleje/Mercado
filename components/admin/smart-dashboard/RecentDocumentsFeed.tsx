"use client";

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";

type DocEntry = { type: string; number: string; status: string; createdAt: string };
const DOC_ICONS: Record<string, string> = { GRR: "GRR", COT: "COT", NC: "NC", CONTRATO: "CTR" };

export function RecentDocumentsFeed() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/activity-log?limit=20");
        if (!res.ok) return;
        const data = await res.json();
        const items: Array<{ action?: string; entityType?: string; entityId?: string; createdAt?: string; details?: string }> = Array.isArray(data) ? data : data.entries ?? [];
        const docEntries: DocEntry[] = [];
        for (const item of items) {
          const et = (item.entityType ?? "").toUpperCase();
          if (["GRR", "GUIA", "COT", "COTIZACION", "NC", "NOTA_CREDITO", "CONTRATO"].some(t => et.includes(t))) {
            const type = et.includes("GRR") || et.includes("GUIA") ? "GRR" : et.includes("COT") ? "COT" : et.includes("NC") || et.includes("NOTA") ? "NC" : "CONTRATO";
            docEntries.push({ type, number: item.entityId ?? "—", status: item.action ?? "creado", createdAt: item.createdAt ?? "" });
          }
          if (docEntries.length >= 5) break;
        }
        setDocs(docEntries);
      } catch { /* silent */ }
    })();
  }, []);

  if (docs.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Ultimos documentos</span>
      </div>
      <div className="space-y-2 max-h-[150px] overflow-auto">
        {docs.map((d, i) => {
          const daysAgo = Math.floor((now - new Date(d.createdAt).getTime()) / 86400000);
          const timeLabel = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo}d`;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 shrink-0">{DOC_ICONS[d.type] ?? d.type}</span>
              <span className="text-gray-700 dark:text-zinc-200 font-medium truncate">{d.number}</span>
              <span className="text-[10px] text-gray-400 dark:text-zinc-500 capitalize">{d.status}</span>
              <span className="text-[10px] text-gray-400 dark:text-zinc-500 ml-auto shrink-0">{timeLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
