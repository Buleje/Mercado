"use client";

/**
 * TramitesExpediente — qué se presentó, ante quién y en qué estado quedó.
 *
 * Diseño: los estados no son adornos, son el filtro. Los chips de arriba filtran
 * la lista de un toque, y lo que espera respuesta hace más de dos semanas sale
 * en una tira aparte — es lo único que pide una acción hoy.
 *
 * Cada fila lleva la marca de tiempo grande a la izquierda (día y mes, como un
 * sello de mesa de partes) porque "cuándo lo presenté" es la pregunta que se le
 * hace a esta pantalla.
 */

import { useMemo, useState } from "react";
import { m as motion } from "framer-motion";
import { Clock, Copy, Inbox, RefreshCw, Search, Trash2 } from "@buleje/design-system/icons";
import { staggerContainer, staggerChild } from "@/components/ui-system/motion";
import { AUTORIDADES, type AutoridadTramite } from "@/lib/forestal/tramites-catalogo";
import {
  contarPorEstado,
  diasDesdePresentacion,
  diasHastaLimite,
  ESTADOS_TRAMITE,
  tramitesSinRespuesta,
  type EstadoTramite,
  type TramiteRegistro,
} from "@/lib/forestal/tramites-registro";
import { Btn } from "./ctp-shared";

const TONO: Record<string, { chip: string; activo: string; barra: string }> = {
  muted: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo: "border-[var(--rule-strong)] bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    barra: "bg-[var(--text-tertiary)]",
  },
  info: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
    barra: "bg-[var(--data-info-500)]",
  },
  warning: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
  },
  success: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
    barra: "bg-[var(--data-success-500)]",
  },
};

const tonoDe = (estado: string) => TONO[ESTADOS_TRAMITE.find((e) => e.key === estado)?.tono ?? "muted"];

/** Sin tildes ni mayúsculas: "relación"/"relacion" tienen que dar el mismo resultado. */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Día y mes cortos, para el sello de la izquierda. */
const sello = (iso: string | null): { dia: string; mes: string } => {
  if (!iso) return { dia: "—", mes: "" };
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return { dia: "—", mes: "" };
  return {
    dia: d.toLocaleDateString("es-PE", { day: "2-digit", timeZone: "UTC" }),
    mes: d.toLocaleDateString("es-PE", { month: "short", timeZone: "UTC" }).replace(".", ""),
  };
};

const fechaLarga = (iso: string | null): string => {
  if (!iso) return "sin fecha";
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
};

export default function TramitesExpediente({
  tramites,
  cargando,
  onRecargar,
  onAbrir,
  onDuplicar,
  onBorrar,
}: {
  tramites: TramiteRegistro[];
  cargando: boolean;
  onRecargar: () => void;
  onAbrir: (t: TramiteRegistro) => void;
  /** Abre un trámite NUEVO con los datos de éste ya cargados (menos fechas y
   *  tabla de guías, que son del período viejo — ver `datosParaDuplicar`). */
  onDuplicar: (t: TramiteRegistro) => void;
  onBorrar: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState<EstadoTramite | "">("");
  const [busqueda, setBusqueda] = useState("");
  const porEstado = useMemo(() => contarPorEstado(tramites), [tramites]);
  const hoy = useMemo(() => new Date(), []);
  const esperando = useMemo(() => tramitesSinRespuesta(tramites, hoy), [tramites, hoy]);
  const visibles = useMemo(() => {
    const porEstadoFiltrados = filtro ? tramites.filter((t) => t.estado === filtro) : tramites;
    const q = sinTildes(busqueda.trim());
    if (!q) return porEstadoFiltrados;
    return porEstadoFiltrados.filter((t) =>
      [t.codigoInterno, t.formatoNombre, t.asunto, t.expedienteAutoridad, t.notas].some(
        (campo) => campo && sinTildes(campo).includes(q),
      ),
    );
  }, [tramites, filtro, busqueda]);

  return (
    <div className="space-y-4">
      {/* Buscador: por nombre de formato, asunto, N° de expediente o notas —
          con 14 formatos y trámites que se repiten (la Relación de guías se
          presenta todos los meses), encontrar "el de julio" a ojo deja de
          alcanzar antes de llegar a la vista de estados. */}
      <div className="flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, formato, asunto o N° de expediente…"
          className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </div>

      {/* Estados = filtro. Un chip con un número que no se puede tocar es un cartel. */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Todos" count={tramites.length} activo={filtro === ""} tono="muted" onClick={() => setFiltro("")} />
        {ESTADOS_TRAMITE.map((e) => (
          <Chip
            key={e.key}
            label={e.label}
            count={porEstado[e.key]}
            activo={filtro === e.key}
            tono={e.tono}
            onClick={() => setFiltro(filtro === e.key ? "" : (e.key as EstadoTramite))}
          />
        ))}
        <button
          type="button"
          onClick={onRecargar}
          disabled={cargando}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Recargar
        </button>
      </div>

      {esperando.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12">
          <Clock className="h-6 w-6 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {esperando.length} {esperando.length === 1 ? "trámite lleva" : "trámites llevan"} más de 15 días sin respuesta
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              No es un plazo legal (cada procedimiento tiene el suyo en el TUPA): es el recordatorio de ir a
              preguntar por el expediente, que es lo que en la práctica lo mueve.
            </p>
          </div>
          <Btn variant="secondary" size="sm" onClick={() => setFiltro("presentado")}>
            Ver presentados
          </Btn>
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)] opacity-40" aria-hidden="true" />
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {busqueda.trim() ? "Ningún trámite coincide con la búsqueda" : filtro ? "Ningún trámite en ese estado" : "Todavía no hay trámites guardados"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-tertiary)]">
            {busqueda.trim()
              ? "Probá con otra palabra o borrá la búsqueda."
              : filtro
                ? "Probá con otro estado o mirá todos."
                : "Elegí un formato en «Formatos», llenalo y guardalo: acá queda el rastro de qué presentaste, cuándo y ante quién."}
          </p>
        </div>
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
          {visibles.map((t) => {
            const meta = ESTADOS_TRAMITE.find((e) => e.key === t.estado);
            const tono = tonoDe(t.estado);
            const dias = diasDesdePresentacion(t, hoy);
            const s = sello(t.fechaPresentacion);
            const atrasado = (t.estado === "presentado" || t.estado === "observado") && (dias ?? 0) >= 15;
            const limite = t.estado !== "resuelto" && t.estado !== "desistido" ? diasHastaLimite(t, hoy) : null;
            return (
              <motion.li
                key={t.id}
                variants={staggerChild}
                className="flex items-stretch gap-0 overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] transition-shadow hover:shadow-[var(--shadow-sm)]"
              >
                {/* Barra de estado + sello de fecha: se lee de lejos. */}
                <div className={`w-1.5 shrink-0 ${tono.barra}`} aria-hidden="true" />
                <div className="flex w-16 shrink-0 flex-col items-center justify-center border-r-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] py-3">
                  <span className="font-mono text-xl font-bold tabular-nums leading-none text-[var(--text-primary)]">{s.dia}</span>
                  <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">{s.mes}</span>
                </div>

                <div className="min-w-0 flex-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {t.codigoInterno && (
                      <span
                        className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
                        title="Código interno — para identificarlo y buscarlo, no es el N° oficial ante la autoridad"
                      >
                        {t.codigoInterno}
                      </span>
                    )}
                    <span className={`inline-flex h-6 items-center rounded-full border-2 px-2.5 text-xs font-bold ${tono.activo}`}>
                      {meta?.label ?? t.estado}
                    </span>
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {AUTORIDADES[t.autoridad as AutoridadTramite]?.corto ?? t.autoridad}
                    </span>
                    {atrasado && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                        <Clock className="h-3.5 w-3.5" /> {dias} días sin respuesta
                      </span>
                    )}
                    {limite !== null && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          limite < 0
                            ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                            : limite <= 3
                              ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                              : "text-[var(--text-tertiary)]"
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {limite < 0
                          ? `Venció hace ${Math.abs(limite)} ${Math.abs(limite) === 1 ? "día" : "días"}`
                          : limite === 0
                            ? "Vence hoy"
                            : `Vence en ${limite} ${limite === 1 ? "día" : "días"}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-lg font-bold leading-snug text-[var(--text-primary)]">{t.formatoNombre}</p>
                  {t.asunto && <p className="text-sm text-[var(--text-secondary)]">{t.asunto}</p>}
                  <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                    {t.expedienteAutoridad ? `Expediente ${t.expedienteAutoridad} · ` : ""}
                    Presentado el {fechaLarga(t.fechaPresentacion)}
                    {t.fechaRespuesta ? ` · respondido el ${fechaLarga(t.fechaRespuesta)}` : ""}
                  </p>
                  {t.notas && <p className="mt-1 text-xs italic text-[var(--text-secondary)]">{t.notas}</p>}
                </div>

                <div className="flex shrink-0 flex-col justify-center gap-2 p-4">
                  <Btn variant="secondary" size="sm" onClick={() => onAbrir(t)}>Abrir</Btn>
                  <Btn
                    variant="secondary"
                    size="sm"
                    onClick={() => onDuplicar(t)}
                    title="Abrir un trámite nuevo con estos mismos datos"
                    aria-label={`Duplicar el trámite ${t.formatoNombre}`}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </Btn>
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => onBorrar(t.id)}
                    aria-label={`Borrar el trámite ${t.formatoNombre}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Btn>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
}

function Chip({
  label,
  count,
  activo,
  tono,
  onClick,
}: {
  label: string;
  count: number;
  activo: boolean;
  tono: string;
  onClick: () => void;
}) {
  const t = TONO[tono] ?? TONO.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      disabled={count === 0 && !activo}
      className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold transition disabled:opacity-40 ${
        activo ? t.activo : `${t.chip} hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]`
      }`}
    >
      {label}
      <span className="font-mono tabular-nums">{count}</span>
    </button>
  );
}
