"use client";

/**
 * Los lotes que esperan la sierra, en una línea (ADR-334).
 *
 * El armado del lote vive en su pestaña; lo que las demás necesitan es el
 * semáforo: cuánta madera está apartada y a un click de dónde se toca. Antes el
 * armado entero colgaba arriba de Consumos —una pantalla dentro de otra— y el
 * cuadro oficial de la sección quedaba debajo de un formulario.
 *
 * Silenciosa mientras carga: una tira que aparece con ceros y después se
 * corrige se lee como un dato que cambió solo.
 */

import { useEffect, useState } from "react";
import { ChevronRight, Layers } from "@buleje/design-system/icons";
import { pieTablarDe, piezasLibres, volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { Btn } from "./ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export default function CtpLotesTira({ onIr }: { onIr: () => void }) {
  const [lotes, setLotes] = useState<LoteAserrio[] | null>(null);

  useEffect(() => {
    let vivo = true;
    /* Deduplicado (ADR-347): esta tira se monta desde varias vistas del libro y
       cada montaje pedía los lotes de nuevo. */
    ctpGet<{ lotes?: LoteAserrio[] }>("/api/admin/forestal/lotes-aserrio?status=abierto&limite=500")
      .then((j) => { if (vivo) setLotes(j.lotes ?? []); })
      .catch(() => { if (vivo) setLotes([]); });
    return () => { vivo = false; };
  }, []);

  if (lotes == null) return null;

  const piezas = lotes.reduce((a, l) => a + piezasLibres(l).length, 0);
  const volumen = lotes.reduce((a, l) => a + volumenLibre(l), 0);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <Layers className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      {lotes.length === 0 ? (
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          No hay lotes armados. En <b className="text-[var(--text-primary)]">Lotes</b> se aparta la madera que entra
          junta a la sierra: después la corrida se declara eligiendo el lote, no tipeando el volumen.
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">
            {lotes.length} lote{lotes.length === 1 ? "" : "s"} esperando la sierra
          </b>{" "}
          ·{" "}
          <span className="font-mono tabular-nums">
            {piezas} pza · {fmtM3(volumen)} m³ · {pieTablarDe(volumen).toLocaleString("es-PE")} pt
          </span>{" "}
          · {lotes.slice(0, 3).map((l) => l.code).join(", ")}
          {lotes.length > 3 ? ` y ${lotes.length - 3} más` : ""}
        </p>
      )}
      <Btn size="sm" variant="secondary" onClick={onIr}>
        {lotes.length === 0 ? "Armar un lote" : "Ver los lotes"} <ChevronRight className="h-4 w-4" />
      </Btn>
    </div>
  );
}
