"use client";

/**
 * RotatingAnnouncementBar — barra superior con N mensajes que rotan (Brandon
 * 2026-06-27, Lote C). El dueño carga varios anuncios desde Modo Creativo >
 * Automatización (oferta + envío gratis + novedad…) y rotan cada 4s con un
 * fade suave. Si hay un solo mensaje, queda fijo. Color = marca (--tenant-primary).
 */
import { useEffect, useState } from "react";

export default function RotatingAnnouncementBar({ messages, intervalMs = 4000 }: { messages: string[]; intervalMs?: number }) {
  const list = (messages || []).filter((m) => m && m.trim());
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // intervalMs = 0 → rotación manual (sin auto-avance); usuario usa las flechas.
    if (list.length <= 1 || intervalMs <= 0) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % list.length), Math.max(1500, intervalMs));
    return () => clearInterval(id);
  }, [list.length, intervalMs]);

  if (list.length === 0) return null;
  const manual = intervalMs <= 0 && list.length > 1;

  return (
    <div
      data-pb="announcements"
      className="flex w-full items-center justify-center gap-2 text-center text-sm font-bold text-white"
      style={{ background: "var(--tenant-primary, var(--accent))" }}
    >
      {manual && (
        <button type="button" aria-label="Anterior" onClick={() => setIdx((i) => (i - 1 + list.length) % list.length)} className="px-2 py-2 opacity-80 transition-opacity hover:opacity-100">‹</button>
      )}
      <p key={idx} className="px-2 py-2 animate-in fade-in duration-500">
        {list[Math.min(idx, list.length - 1)]}
      </p>
      {manual && (
        <button type="button" aria-label="Siguiente" onClick={() => setIdx((i) => (i + 1) % list.length)} className="px-2 py-2 opacity-80 transition-opacity hover:opacity-100">›</button>
      )}
    </div>
  );
}
