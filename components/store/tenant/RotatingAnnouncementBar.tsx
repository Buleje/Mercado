"use client";

/**
 * RotatingAnnouncementBar — barra superior con N mensajes que rotan (Brandon
 * 2026-06-27, Lote C). El dueño carga varios anuncios desde Modo Creativo >
 * Automatización (oferta + envío gratis + novedad…) y rotan cada 4s con un
 * fade suave. Si hay un solo mensaje, queda fijo. Color = marca (--tenant-primary).
 */
import { useEffect, useState } from "react";

export default function RotatingAnnouncementBar({ messages }: { messages: string[] }) {
  const list = (messages || []).filter((m) => m && m.trim());
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (list.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % list.length), 4000);
    return () => clearInterval(id);
  }, [list.length]);

  if (list.length === 0) return null;

  return (
    <div
      data-pb="announcements"
      className="w-full text-center text-sm font-bold text-white"
      style={{ background: "var(--tenant-primary, var(--accent))" }}
    >
      <p key={idx} className="px-4 py-2 animate-in fade-in duration-500">
        {list[Math.min(idx, list.length - 1)]}
      </p>
    </div>
  );
}
