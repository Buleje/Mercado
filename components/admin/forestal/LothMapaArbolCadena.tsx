"use client";

/**
 * LothMapaArbolCadena — dentro de la ficha del árbol, lo que el libro hizo con
 * él, en cuatro renglones cortos: talado (día y línea) · trozado (cuántas
 * trozas y cuántas siguen en el monte) · despachado (cuántas y con qué guía) ·
 * en el CTP (cuántas se recibieron). Y, si el censo y el libro no dicen lo
 * mismo, el aviso con cuál dice qué.
 *
 * Los datos los calcula el servidor con el libro entero (`loth-etapa-arbol`).
 */

import { CheckCircle2, Circle, TriangleAlert } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diaDelLibro } from "@/lib/forestal/loth-censo-uso";
import { ETAPA_TOKEN, type EtapaArbol } from "@/lib/forestal/loth-etapa-arbol";
import type { CensoTree } from "./loth-mapa-shared";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Paso {
  id: string;
  etapa: EtapaArbol;
  titulo: string;
  hecho: boolean;
  detalle: string | null;
}

export default function LothMapaArbolCadena({ arbol, leyendo }: { arbol: CensoTree; leyendo: boolean }) {
  const c = arbol.cadena ?? null;
  const etapa = arbol.etapa ?? "en_pie";
  if (!c) {
    return leyendo ? <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">Leyendo lo que hizo el libro…</p> : null;
  }
  const t = c.trozas;
  const salidas = t.despachadas + t.consumidas;
  const sinLibro = !c.tala && t.total === 0;

  if (sinLibro && c.avisos.length === 0) {
    return (
      <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">
        {etapa === "semillero" ? "Semillero: se queda en pie." : etapa === "descartado" ? "Descartado del censo." : "Todavía sin operaciones en el libro."}
      </p>
    );
  }

  const pasos: Paso[] = [
    {
      id: "tala",
      etapa: "talado",
      titulo: "Talado",
      hecho: c.tala !== null,
      detalle: c.tala
        ? `${diaDelLibro(c.tala.fecha)} · línea N° ${c.tala.lineNo}${c.tala.volumeM3 != null ? ` · ${fmtM3(c.tala.volumeM3)} m³` : ""}`
        : c.estadoCenso === "talado"
          ? "sólo en el censo"
          : null,
    },
    {
      id: "trozado",
      etapa: "trozado",
      titulo: "Trozado",
      hecho: t.total > 0,
      detalle: t.total > 0 ? `${plural(t.total, "troza", "trozas")} · ${fmtM3(c.m3.trozado)} m³${t.enMonte > 0 ? ` · ${t.enMonte} en el monte` : ""}` : null,
    },
    {
      id: "despacho",
      etapa: "despachado",
      titulo: "Despachado",
      hecho: salidas > 0,
      detalle:
        salidas > 0
          ? [
              `${t.despachadas} de ${t.total}`,
              c.guias.length > 0 ? `GTF ${c.guias.join(", ")}` : null,
              t.consumidas > 0 ? `${t.consumidas} consumida${t.consumidas === 1 ? "" : "s"} en tu aserradero` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
    },
    {
      id: "ctp",
      etapa: "en_ctp",
      titulo: "En el CTP",
      hecho: t.enCtp > 0,
      detalle: t.enCtp > 0 ? `${t.enCtp} de ${t.total} recibida${t.enCtp === 1 ? "" : "s"}` : null,
    },
  ];

  return (
    <section aria-label="Lo que hizo el libro con este árbol" className="mt-2 rounded-lg border border-[var(--rule-soft)] px-2 py-1.5">
      <ol className="space-y-0.5">
        {pasos.map((p) => (
          <li key={p.id} className="flex items-start gap-1.5 text-xs leading-5">
            {p.hecho ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" style={{ color: ETAPA_TOKEN[p.etapa] }} aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 flex-none text-[var(--text-tertiary)]" aria-hidden="true" />
            )}
            <span className={p.hecho ? "font-bold text-[var(--text-primary)]" : "font-semibold text-[var(--text-tertiary)]"}>{p.titulo}</span>
            <span className="sr-only">{p.hecho ? ", hecho" : ", todavía no"}</span>
            {p.detalle && <span className="min-w-0 tabular-nums text-[var(--text-secondary)]">{p.detalle}</span>}
          </li>
        ))}
      </ol>
      {c.avisos.map((a) => (
        <p key={a.tipo} className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-[var(--data-error-ink)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          {a.texto}
        </p>
      ))}
    </section>
  );
}
