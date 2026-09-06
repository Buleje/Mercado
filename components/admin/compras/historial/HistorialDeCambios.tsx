"use client";

/**
 * HistorialDeCambios — quién tocó este gasto y qué cambió.
 *
 * Desde que la ficha deja corregir montos, alguien puede cambiar un alquiler de
 * S/850 a S/1.200 y no quedaba rastro de nada. Con plata de por medio —y con la
 * Ley 29733 pidiendo saber quién trató cada dato— la ficha tiene que poder
 * responder «¿quién le puso ese número, y cuándo?».
 *
 * El registro sale del `ActivityLog` que ya usa todo el panel; lo escribe el
 * endpoint (`PUT`/`DELETE /api/expenses/:id`) con el antes y el después.
 */

import { useEffect, useState } from "react";
import { History, Loader2 } from "@buleje/design-system/icons";

type Entrada = { id: string; action: string; detail: string; user: string; createdAt: string };

const ACCION_LABEL: Record<string, string> = {
  update: "Corrigió",
  delete: "Borró",
  create: "Registró",
};

function cuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function HistorialDeCambios({ refId }: { refId: string }) {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fetch(`/api/activity-log?entity=Expense&entityId=${encodeURIComponent(refId)}&limit=20`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (vivo) setEntradas(Array.isArray(d.items) ? d.items : []); })
      .catch((err) => {
        console.warn("[HistorialDeCambios] fetch falló", err);
        if (vivo) setEntradas([]);
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [refId]);

  // Un gasto que nadie tocó no necesita una sección vacía diciendo que está
  // vacía: se calla.
  if (cargando) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Buscando cambios…
      </p>
    );
  }
  if (!entradas || entradas.length === 0) return null;

  return (
    <section className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        <History className="h-4 w-4" aria-hidden />
        Cambios
      </p>
      <ol className="space-y-2">
        {entradas.map((e) => (
          <li key={e.id} className="border-l-2 border-[var(--rule-base)] pl-3">
            <p className="text-sm text-[var(--text-primary)]">
              <span className="font-bold">{ACCION_LABEL[e.action] ?? e.action}</span>{" "}
              {e.detail}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {e.user} · {cuando(e.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
