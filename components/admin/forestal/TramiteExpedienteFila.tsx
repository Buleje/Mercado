"use client";

/**
 * Una fila del Expediente: sello de fecha a la izquierda, qué es y en qué
 * estado está al centro, y a la derecha «Abrir» a la vista + «⋯» con lo demás
 * (duplicar, borrar). Antes eran tres botones de 36 px apilados por fila y el
 * de borrar no pedía confirmación (11-10).
 */

import { useRef } from "react";
import { m as motion } from "framer-motion";
import { Clock, Copy, MoreHorizontal, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { staggerChild } from "@/components/ui-system/motion";
import { AUTORIDADES, type AutoridadTramite } from "@/lib/forestal/tramites-catalogo";
import {
  diasDesdePresentacion,
  diasHastaLimite,
  ESTADOS_TRAMITE,
  type TramiteRegistro,
} from "@/lib/forestal/tramites-registro";
import { fechaDeEmision } from "@/lib/forestal/tramites-carta";
import { formatDateLong, formatMonth } from "@/lib/format";
import { TONO_ESTADO } from "./chip-estado";

const tonoDe = (estado: string) => TONO_ESTADO[ESTADOS_TRAMITE.find((e) => e.key === estado)?.tono ?? "muted"];

/** Día y mes cortos, para el sello de la izquierda. */
const sello = (iso: string | null): { dia: string; mes: string } => {
  if (!iso) return { dia: "—", mes: "" };
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return { dia: "—", mes: "" };
  return {
    /* Fecha sin hora (AAAA-MM-DD): el día se lee en UTC, como se guardó. */
    dia: String(d.getUTCDate()).padStart(2, "0"),
    mes: formatMonth(d, { soloFecha: true }).replace(".", ""),
  };
};

const fechaLarga = (iso: string | null): string => {
  if (!iso) return "sin fecha";
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? iso : formatDateLong(d, { soloFecha: true });
};

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

export default function TramiteExpedienteFila({
  t,
  hoy,
  onAbrir,
  onDuplicar,
  onBorrar,
}: {
  t: TramiteRegistro;
  hoy: Date;
  onAbrir: (t: TramiteRegistro) => void;
  onDuplicar: (t: TramiteRegistro) => void;
  /** Pide confirmación: la fila no borra sola. */
  onBorrar: (t: TramiteRegistro) => void;
}) {
  const meta = ESTADOS_TRAMITE.find((e) => e.key === t.estado);
  const tono = tonoDe(t.estado);
  const desde = diasDesdePresentacion(t, hoy);
  const s = sello(t.fechaPresentacion);
  const atrasado = (t.estado === "presentado" || t.estado === "observado") && (desde ?? 0) >= 15;
  const limite = t.estado !== "resuelto" && t.estado !== "desistido" ? diasHastaLimite(t, hoy) : null;

  /* El menú cierra sin devolverle el foco a su botón: la ventana de confirmar
     guardaría «body» y, al cerrarla, el teclado volvería al inicio de la página. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const acciones: MenuAccion[] = [
    { id: "duplicar", label: "Duplicar", hint: "Un trámite nuevo con estos mismos datos (sin fechas ni guías)", icon: Copy, onSelect: () => onDuplicar(t) },
    { id: "borrar", label: "Borrar del expediente", icon: Trash2, tone: "danger", onSelect: () => { enfocarMenu(); onBorrar(t); } },
  ];

  return (
    <motion.li
      variants={staggerChild}
      className="flex items-stretch gap-0 overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-shadow hover:shadow-[var(--shadow-sm)]"
    >
      {/* Barra de estado + sello de fecha: se lee de lejos. */}
      <div className={`w-1.5 shrink-0 ${tono.barra}`} aria-hidden="true" />
      <div className="flex w-14 shrink-0 flex-col items-center justify-center border-r-2 sm:w-16 border-[var(--rule-soft)] bg-[var(--surface-sunken)] py-3">
        <span className="font-mono text-xl font-bold tabular-nums leading-none text-[var(--text-primary)]">{s.dia}</span>
        <span className="mt-1 text-sm text-[var(--text-secondary)]">{s.mes}</span>
      </div>

      {/* En el celular «Abrir» y «⋯» bajan debajo del texto: al costado lo dejaban en 150 px. */}
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`inline-flex h-7 items-center rounded-full border-2 px-2.5 text-sm font-bold ${tono.activo}`}>
            {meta?.label ?? t.estado}
          </span>
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            {AUTORIDADES[t.autoridad as AutoridadTramite]?.corto ?? t.autoridad}
          </span>
          {t.codigoInterno && (
            <span
              className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-sm font-bold text-[var(--text-secondary)]"
              title="Código interno — para identificarlo y buscarlo, no es el N° oficial ante la autoridad"
            >
              {t.codigoInterno}
            </span>
          )}
          {atrasado && (
            <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-warning-ink)]">
              <Clock className="h-4 w-4" aria-hidden /> {dias(desde ?? 0)} sin respuesta
            </span>
          )}
          {limite !== null && (
            <span
              className={`inline-flex items-center gap-1 text-sm font-bold ${
                limite < 0
                  ? "text-[var(--data-error-ink)]"
                  : limite <= 3
                    ? "text-[var(--data-warning-ink)]"
                    : "text-[var(--text-secondary)]"
              }`}
            >
              <Clock className="h-4 w-4" aria-hidden />
              {limite < 0 ? `Venció hace ${dias(Math.abs(limite))}` : limite === 0 ? "Vence hoy" : `Vence en ${dias(limite)}`}
            </span>
          )}
        </div>
        <p className="mt-1 text-base font-bold leading-snug text-[var(--text-primary)]">{t.formatoNombre}</p>
        {t.asunto && <p className="truncate text-sm text-[var(--text-secondary)]" title={t.asunto}>{t.asunto}</p>}
        <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
          {t.expedienteAutoridad ? `Expediente ${t.expedienteAutoridad} · ` : ""}
          Presentado el {fechaLarga(t.fechaPresentacion)}
          {t.fechaRespuesta ? ` · respondido el ${fechaLarga(t.fechaRespuesta)}` : ""}
        </p>
        {t.emision && (
          <p className="text-sm text-[var(--text-tertiary)]">
            Impresa el {fechaDeEmision(t.emision.en)} por {t.emision.por} · {t.emision.guias.length}{" "}
            {t.emision.guias.length === 1 ? "guía" : "guías"}
            {t.emision.permisoCodigo ? ` · permiso ${t.emision.permisoCodigo}` : ""}
            {t.emision.expediente ? ` · expediente ${t.emision.expediente}` : ""}
          </p>
        )}
        {t.notas && <p className="text-sm italic text-[var(--text-secondary)]">{t.notas}</p>}
      </div>

      <div ref={ref} className="flex shrink-0 items-center gap-1 px-3 pb-3 sm:py-3 sm:pl-0">
        <button
          type="button"
          onClick={() => onAbrir(t)}
          className="inline-flex h-12 items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          aria-label={`Abrir el trámite ${t.formatoNombre}`}
        >
          Abrir
        </button>
        <ActionMenu
          label={`Más acciones de ${t.formatoNombre}`}
          title="Duplicar o borrar"
          icon={MoreHorizontal}
          actions={acciones}
          soloIcono
          size="md"
          className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
        />
      </div>
      </div>
    </motion.li>
  );
}
