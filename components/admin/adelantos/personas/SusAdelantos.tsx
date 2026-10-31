"use client";

/**
 * «Sus adelantos» en la ficha de una persona: cada uno con de qué lado está la
 * plata (ADR-448) — «debe» si lo diste, «le debes» si lo recibiste. Salió de
 * `FichaPersonaModal` para que la ficha no pase las 400 líneas.
 */

import { quienDebe } from "@/lib/adelantos/direccion";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { formatDate } from "@/lib/format";
import { MODALIDAD_LABEL, STATUS_BADGE, fmtMon } from "../shared";

const dia = (iso: string) => formatDate(iso);

export default function SusAdelantos({ suyos, onVerAdelanto }: { suyos: DbAdelanto[]; onVerAdelanto: (a: DbAdelanto) => void }) {
  return (
    <ul className="space-y-2">
      {suyos.map((a) => {
        const badge = STATUS_BADGE[a.status];
        const recibido = leerDireccion(a).direccion === "RECIBIDO";
        const q = quienDebe({ direccion: recibido ? "RECIBIDO" : "DADO", status: a.status, saldoPendiente: a.saldoPendiente });
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onVerAdelanto(a)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[var(--rule-soft)] px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-[var(--surface-sunken)]/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">
                  {a.codigoOperacion ?? "— sin código —"}
                </span>
                <span className="block truncate text-sm text-[var(--text-tertiary)]">
                  {dia(a.fechaAdelanto)} · {recibido ? "Recibido · " : ""}
                  {MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}
                  {a.notas ? ` · ${a.notas}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-extrabold tabular-nums text-[var(--text-primary)]">
                  {fmtMon(a.montoAdelantado, a.moneda)}
                </span>
                <span
                  className={`block text-sm font-semibold tabular-nums ${
                    q === "te-debe" ? "text-[var(--data-warning)]" : q === "le-debes" ? "text-[var(--data-info-ink)]" : "text-[var(--data-success)]"
                  }`}
                >
                  {q === "te-debe"
                    ? `debe ${fmtMon(Math.abs(a.saldoPendiente), a.moneda)}`
                    : q === "le-debes"
                      ? `le debes ${fmtMon(Math.abs(a.saldoPendiente), a.moneda)}`
                      : "sin saldo"}
                </span>
              </span>
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${badge?.className ?? ""}`}>
                {badge?.label ?? a.status}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
