"use client";

/** Vista rápida de una guía al pasar el mouse por su N° (300 ms de espera). */
import { useRef, useState, type ReactNode } from "react";
import { Truck } from "@buleje/design-system/icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPlaca, MOTIVO_ROTULO, STATUS_META, type GuiaRemision } from "./tipos";

export function GuiaPreview({ guia }: { guia: GuiaRemision }) {
  const meta = STATUS_META[guia.status];
  const placa = getPlaca(guia);
  return (
    <div className="w-75 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-[var(--text-secondary)]">{guia.numero}</span>
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-sm font-bold", meta.bg, meta.color)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />{meta.label}
        </span>
      </div>
      <p className="font-bold text-[var(--text-primary)] text-sm">{guia.destinatarioNombre}</p>
      <p className="text-sm text-[var(--text-tertiary)]">{guia.puntoPartida} → {guia.puntoLlegada}</p>
      {guia.transportistaNombre && (
        <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1">
          <Truck className="h-3 w-3" /> {guia.transportistaNombre}
          {placa && <span className="ml-1 px-1 bg-[var(--data-success-100)] text-[var(--data-success-ink)] rounded text-sm font-bold">{placa}</span>}
        </p>
      )}
      <div className="border-t border-[var(--rule-soft)] pt-2">
        <p className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-1">Items</p>
        {guia.items.slice(0, 3).map((it, i) => (
          <p key={i} className="text-sm text-[var(--text-secondary)] truncate">{it.cantidad}× {it.descripcion}</p>
        ))}
        {guia.items.length > 3 && <p className="text-sm text-[var(--text-tertiary)]">y {guia.items.length - 3} más...</p>}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-[var(--rule-soft)]">
        <span className="text-sm text-[var(--text-secondary)]">{formatDate(guia.fechaTraslado)}</span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{MOTIVO_ROTULO[guia.motivoTraslado] ?? guia.motivoTraslado}</span>
      </div>
    </div>
  );
}

export function GuiaHoverRow({ children, preview }: { children: ReactNode; preview: ReactNode }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEnter = () => { timerRef.current = setTimeout(() => setShow(true), 300); };
  const handleLeave = () => { if (timerRef.current) clearTimeout(timerRef.current); setShow(false); };
  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]">
          {preview}
        </div>
      )}
    </div>
  );
}

// ── OrderPickerCard ──────────────────────────────────────────────────────────
