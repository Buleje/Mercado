"use client";

/**
 * CtpFichaCarnet — la identidad del CTP como carnet: es lo que va impreso
 * arriba de cada papel que emite el centro, así que se muestra con esa
 * jerarquía y con los datos duros copiables de un toque para pegarlos en el
 * SNIFFS.
 *
 * Salió de `CtpFichaReadView` cuando la vista pasó de 300 líneas al sumar los
 * campos de la carátula del Libro (Anexo 1 de la RDE D000025-2023).
 */

import { useState } from "react";
import {
  AlertCircle, AlertTriangle, Building2, Check, CheckCircle2, Copy,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { AvisoFicha, CtpFicha } from "@/lib/forestal/ctp-ficha-types";

function Copiable({ valor, label }: { valor: string; label: string }) {
  const [copiado, setCopiado] = useState(false);
  if (!valor) return <span className="text-white/50">—</span>;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(valor).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1600);
        });
      }}
      title={`Copiar ${label}`}
      aria-label={`Copiar ${label}: ${valor}`}
      className="group inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 -mx-1.5 font-mono text-sm text-white transition hover:bg-white/15"
    >
      {valor}
      {copiado
        ? <Check className="h-3.5 w-3.5 text-white" aria-hidden />
        : <Copy className="h-3.5 w-3.5 text-white/80 group-hover:text-white" aria-hidden />}
    </button>
  );
}

function DatoCarnet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-xs)] font-semibold uppercase tracking-wide text-white/95">{label}</div>
      <div className="mt-0.5 truncate">{children}</div>
    </div>
  );
}

/** Encabezado con la identidad del centro: es lo que va impreso arriba de cada
 *  papel que emite el CTP, así que se muestra con esa jerarquía. */
function Carnet({ f, avisos }: { f: CtpFicha; avisos: AvisoFicha[] }) {
  const criticos = avisos.filter((a) => a.nivel === "critico").length;
  const estado = criticos > 0
    ? { texto: `${criticos} ${criticos === 1 ? "problema crítico" : "problemas críticos"}`, clase: "bg-[var(--data-error-500)] text-white", Icono: AlertCircle }
    : avisos.length > 0
      ? { texto: `${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"}`, clase: "bg-[var(--surface-raised)] text-[var(--text-primary)]", Icono: AlertTriangle }
      : { texto: "Lista para emitir", clase: "bg-[var(--surface-raised)] text-[var(--text-primary)]", Icono: CheckCircle2 };

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-md)]"
      style={{ background: "linear-gradient(135deg, var(--accent-dark) 0%, #0d3b3b 55%, #072424 100%)" }}
    >
      {/* Velo: el teal del DS es claro y el texto del carnet es blanco.
          Medido sin él: 2.6:1. Con él, ~5:1 (AA). */}
      <span className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden />
      {/* Greca amazónica: identidad de marca, decorativa. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]" aria-hidden>
        <defs>
          <pattern id="greca-ficha" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M0 13h6V7h7v6h6v6H13v6H6v-6H0z" fill="none" stroke="white" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#greca-ficha)" />
      </svg>

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {f.logo
            // eslint-disable-next-line @next/next/no-img-element -- dataURL local del tenant, no pasa por el optimizador
            ? <img src={f.logo} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-white/90 object-contain p-1" />
            : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25"><Building2 className="h-7 w-7" aria-hidden /></span>}
          <div className="min-w-0">
            <div className="text-[length:var(--ts-xs)] font-semibold uppercase tracking-wider text-white/95">Centro de Transformación Primaria</div>
            <CardTitle as="h3" className="font-display text-2xl leading-tight break-words text-white">{f.nombreCtp || "Sin nombre cargado"}</CardTitle>
            <p className="break-words text-sm text-white/90">{f.razonSocial || "Sin razón social"}</p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${estado.clase}`}>
          <estado.Icono className="h-4 w-4" aria-hidden /> {estado.texto}
        </span>
      </div>

      <div className="relative mt-5 grid gap-4 border-t border-white/20 pt-4 sm:grid-cols-3">
        <DatoCarnet label="Código de CTP (ARFFS)"><Copiable valor={f.codigoCtp} label="el código de CTP" /></DatoCarnet>
        <DatoCarnet label="RUC"><Copiable valor={f.ruc} label="el RUC" /></DatoCarnet>
        <DatoCarnet label="Serie GTF autorizada"><Copiable valor={f.gtfSerie} label="la serie GTF" /></DatoCarnet>
      </div>
    </div>
  );
}

export default Carnet;
