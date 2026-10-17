"use client";

/**
 * SocialProofToasts — avisos flotantes "Alguien pidió X · hace N min" (Brandon
 * 2026-06-26, Modo Creativo > Automatización). Urgencia + confianza. Los datos
 * son pedidos REALES anonimizados (sin nombre del cliente — Ley 29733), traídos
 * server-side en /t/[slug]. Si no hay pedidos recientes, no muestra nada (no se
 * inventa data). Rota uno a la vez abajo-izquierda; se puede cerrar.
 */
import { useEffect, useState } from "react";
import { ShoppingBag, X } from "@buleje/design-system/icons";

interface ProofItem { product: string; at: string }

function hace(at: string): string {
  const ms = Date.now() - new Date(at).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function SocialProofToasts({ items }: { items: ProofItem[] }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!items.length || closed) return;
    let alive = true;
    // Primer aviso a los 4s, luego rota cada 9s (6s visible + 3s oculto).
    const show = () => { if (alive) setVisible(true); };
    const hide = () => { if (alive) setVisible(false); };
    const first = setTimeout(show, 4000);
    const cycle = setInterval(() => {
      hide();
      setTimeout(() => { if (alive) { setIdx((i) => (i + 1) % items.length); show(); } }, 600);
    }, 9000);
    return () => { alive = false; clearTimeout(first); clearInterval(cycle); };
  }, [items, closed]);

  if (!items.length || closed) return null;
  const it = items[idx % items.length];

  return (
    <div
      className={`fixed bottom-4 left-4 z-40 max-w-[300px] transition-all duration-500 ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 shadow-xl">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "var(--tenant-primary, var(--accent))" }} aria-hidden>
          <ShoppingBag className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-[var(--text-primary)]">Alguien pidió {it.product}</p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{hace(it.at)} · compra verificada</p>
        </div>
        <button type="button" onClick={() => setClosed(true)} aria-label="Cerrar" className="-mr-1 -mt-1 shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
