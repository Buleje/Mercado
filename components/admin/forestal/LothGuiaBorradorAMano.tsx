"use client";

/**
 * El aviso de «Despachar con guía» cuando la lista a mano volvió del borrador
 * de la pestaña (`use-borrador-trozas-a-mano`, 15-10): cuántas trozas, de qué
 * hora, y «Descartar borrador» para empezar de cero.
 */

import { History, Trash2 } from "@buleje/design-system/icons";
import type { BorradorDelDespacho } from "./hooks/use-borrador-trozas-a-mano";
import { Btn } from "./ctp-shared";

/** «23:05» en Lima (sólo cifras: no depende del ICU del navegador). */
function horaDeLima(ms: number): string | null {
  if (!ms) return null;
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = p.find((x) => x.type === "hour")?.value;
  const m = p.find((x) => x.type === "minute")?.value;
  return h && m ? `${h}:${m}` : null;
}

export default function AvisoBorradorAMano({ borrador }: { borrador: BorradorDelDespacho }) {
  const r = borrador.recuperado;
  if (!r) return null;
  const hora = horaDeLima(r.guardadoAt);
  return (
    <div
      role="status"
      data-qa="borrador-a-mano"
      className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--data-info-500)]/30 bg-[var(--data-info-50)] px-3 py-2 text-sm text-[var(--text-primary)] dark:bg-[var(--data-info-500)]/10"
    >
      <History className="h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b>
          Recuperé {r.trozas} {r.trozas === 1 ? "troza anotada" : "trozas anotadas"} a mano
        </b>
        {hora ? ` (borrador de las ${hora})` : ""}.
      </span>
      <Btn size="sm" variant="secondary" onClick={borrador.descartar}>
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Descartar borrador
      </Btn>
    </div>
  );
}
