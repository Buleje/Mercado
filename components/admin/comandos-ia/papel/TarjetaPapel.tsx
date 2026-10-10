"use client";

/**
 * Un papel en la bandeja: «Leí: factura de Distribuidora Ucayali · S/ 55.50 →
 * Lo que haré: registrar la compra» + [Revisar]. Mientras lee, la barra del
 * OCR; si el rol no puede guardar ahí, lo dice (y la revisión no trae Guardar).
 */

import { useState } from "react";
import {
  Receipt, Smartphone, Tags, FileText, X, RotateCcw, Loader2, CheckCircle2, AlertTriangle, Sparkles, ArrowRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  PUNTAJE_SEGURO, pagadorSugerido, type CamposFactura, type CamposLista, type CamposYape, type RespuestaEntender, type TipoPapel,
} from "@/lib/admin/comandos-ia/papel";
import type { Papel } from "./use-leer-papel";
import { ACCION_DESTINO, BOTON_PRIMARIO, BOTON_SECUNDARIO, NOMBRE_TIPO, SIN_PERMISO, costoIa, soles, permite } from "./formato";

const ICONO: Record<TipoPapel, LucideIcon> = { factura: Receipt, yape: Smartphone, "lista-precios": Tags, otro: FileText };

/** «factura de Distribuidora Ucayali · S/ 55.50» */
function queLei(r: RespuestaEntender): string {
  if (r.tipo === "factura") {
    const c = r.campos as CamposFactura;
    const prov = r.propuesta.destino === "compra" ? r.propuesta.proveedor.nombre : c.proveedor.nombre;
    return [`factura${prov ? ` de ${prov}` : ""}`, c.total != null ? soles(c.total) : null].filter(Boolean).join(" · ");
  }
  if (r.tipo === "yape") {
    const c = r.campos as CamposYape;
    return [`pago por Yape`, c.monto != null ? soles(c.monto) : null].filter(Boolean).join(" · ");
  }
  if (r.tipo === "lista-precios") {
    const c = r.campos as CamposLista;
    return `lista de precios${c.proveedor ? ` de ${c.proveedor}` : ""} · ${c.filas.length} filas`;
  }
  const titulo = (r.campos as { titulo?: string | null }).titulo;
  return titulo ? `${NOMBRE_TIPO.otro} · ${titulo}` : NOMBRE_TIPO.otro;
}

function queHare(r: RespuestaEntender): string {
  const accion = ACCION_DESTINO[r.propuesta.destino];
  if (r.propuesta.destino === "compra") {
    const sin = r.propuesta.filas.filter((f) => !f.producto).length;
    const n = r.propuesta.filas.length;
    return `${accion} (${n} ${n === 1 ? "producto" : "productos"}${sin ? `, ${sin} por elegir` : ""})`;
  }
  if (r.propuesta.destino === "cobro") {
    /* Debajo del puntaje seguro la revisión NO lo elige solo: la tarjeta tampoco lo afirma. */
    const c = pagadorSugerido(r.propuesta.candidatos);
    if (!c) return `${accion} (elige al cliente)`;
    return c.puntaje >= PUNTAJE_SEGURO ? `${accion} de ${c.nombre}` : `${accion} (¿de ${c.nombre}?)`;
  }
  return accion;
}

const NIVEL = (c: number) => (c >= 0.8 ? "alta" : c >= 0.5 ? "media" : "baja");

export function TarjetaPapel({ papel, rol, onRevisar, onQuitar, onReintentar, onVision }: {
  papel: Papel;
  rol: string | null;
  onRevisar: () => void;
  onQuitar: () => void;
  onReintentar: () => void;
  /** Releer la foto con la IA de visión; null = no se ofrece. */
  onVision: (() => Promise<void>) | null;
}) {
  const [viendo, setViendo] = useState(false);
  const r = papel.resultado;
  const Icono = r ? ICONO[r.tipo] : FileText;
  const ocupado = papel.estado === "leyendo" || papel.estado === "entendiendo";
  const puede = r ? permite(rol, r.propuesta.destino) : true;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {ocupado ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Icono className="h-5 w-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-[var(--text-tertiary)]" title={papel.nombre}>{papel.nombre}</p>
          {r ? (
            <p className="text-sm font-semibold text-[var(--text-primary)]">Leí: {queLei(r)}</p>
          ) : papel.estado === "error" ? (
            <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{papel.error}</p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
              {papel.estado === "entendiendo" ? "Entendiendo el papel…" : papel.progreso?.etapa ?? "En cola…"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${papel.nombre}`}
          className="-m-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {papel.estado === "leyendo" && papel.progreso && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="progressbar" aria-label="Lectura del papel"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(papel.progreso.progreso * 100)}>
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--dur-base)]" style={{ width: `${Math.round(papel.progreso.progreso * 100)}%` }} />
        </div>
      )}

      {r && (
        <p className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>Lo que haré: <b className="text-[var(--text-primary)]">{queHare(r)}</b></span>
        </p>
      )}
      {r?.aviso && (
        <p className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--data-warning-500)]" aria-hidden /> {r.aviso}
        </p>
      )}
      {r && !puede && (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--data-warning-500)]" aria-hidden /> {SIN_PERMISO[r.propuesta.destino]}
        </p>
      )}
      {papel.guardado && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {papel.guardado}
        </p>
      )}

      {(r || papel.estado === "error") && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-3">
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
            {r ? `${costoIa(r.costoIaUsd)} · certeza ${NIVEL(r.confianza)}` : ""}
            {papel.confianzaOcr != null ? ` · lectura ${papel.confianzaOcr} %` : ""}
          </span>
          <div className="flex flex-wrap gap-2">
            {onVision && !papel.guardado && (
              <button type="button" disabled={viendo} className={BOTON_SECUNDARIO}
                onClick={() => { setViendo(true); onVision().finally(() => setViendo(false)); }}>
                {viendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                Leer con IA de visión ≈ $0.02
              </button>
            )}
            {papel.estado === "error" ? (
              <button type="button" onClick={onReintentar} className={BOTON_SECUNDARIO}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
              </button>
            ) : !papel.guardado ? (
              <button type="button" onClick={onRevisar} className={BOTON_PRIMARIO}>Revisar</button>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}
