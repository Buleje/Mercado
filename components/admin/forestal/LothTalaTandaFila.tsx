"use client";

/**
 * Una fila de «Talar varios árboles»: el árbol con lo que dice el censo, la
 * fecha (la de todos o la suya), las medidas en la forma fijada en el equipo
 * y lo que sale de ellas —volumen, medido vs censo, ≈ pt—. Lo que casi nunca
 * cambia por árbol (motosierrista, hora, GPS, foto, nota) va plegado debajo.
 *
 * Desde lg es una fila de planilla con su cabecera de columnas; más angosto,
 * una tarjeta con el rótulo en cada campo. Es el MISMO DOM (grilla que se
 * reacomoda): nada se duplica para el celular.
 *
 * La fila de una especie del REGISTRO de una plantación (ADR-459) no tiene
 * árbol marcado: en vez de lo que dice el censo lleva el código propuesto,
 * que se puede cambiar.
 */

import { AlertTriangle, CheckCircle2, ChevronDown, ShieldAlert, Trash2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import { efectivosDeFila, nombreDeFila, type ComunesTala, type FilaCalculada, type FilaTala } from "@/lib/forestal/loth-tala-tanda";
import { camposDeRenglon, type CampoDeRenglon } from "@/lib/forestal/loth-trozado-multiple";
import { formatNumber } from "@/lib/format";
import { CampoMedida } from "./LothMedicionPartes";
import { CitesPill } from "./loth-plan-ui";

/** Árbol · fecha · medidas · resultado · más · quitar. Más angosto que lg, tarjeta. */
export const FILA_TANDA =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-2 gap-y-2 lg:grid-cols-[10rem_9rem_minmax(0,1fr)_7.5rem_2.75rem_2.75rem] lg:items-center lg:gap-x-2.5";

/** Las medidas de una fila de tala: las del trozado múltiple, con la longitud APROVECHABLE. */
export function camposDeTala(forma: FormaMedicion): CampoDeRenglon[] {
  return camposDeRenglon(forma).map((c) =>
    c.clave === "largo" ? { ...c, corto: "Long. aprov.", grupo: "Long. aprov. (m)" } : c,
  );
}

/** Las columnas de medidas: a 400 px «Varias medidas» va en 4 + la longitud abajo. */
export const colsMedidasTala = (forma: FormaMedicion) => (forma === "promedio" ? "grid-cols-3" : "grid-cols-4 sm:grid-cols-5");

/** `text-base` en el celular: con menos de 16 px el iPhone hace zoom al enfocar. */
const INPUT =
  "h-11 w-full min-w-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1.5 text-center font-mono text-base tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-70 sm:text-sm";
const ROTULO = "mb-0.5 block truncate text-xs font-semibold text-[var(--text-secondary)] lg:sr-only";
const AMBAR = "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

const m = (v: number | null, min = 0, max = 2) => (v == null ? "—" : formatNumber(v, { min, max }));

/** Cuántas cosas propias tiene la fila plegada (para que se note sin abrirla). */
export function extrasDeFila(f: FilaTala): number {
  return [f.motosierrista != null, f.hora != null, f.gps?.origen === "telefono", f.fotoUrl != null, f.nota.trim() !== "", f.justificacionDmc.trim() !== ""].filter(Boolean).length;
}

export default function LothTalaTandaFila({
  fila: f,
  calc: c,
  forma,
  comunes,
  abierta,
  bloqueada,
  onAbrir,
  onEditar,
  onCodigo,
  fueraDelRegistro = false,
  numero,
  onQuitar,
  children,
}: {
  fila: FilaTala;
  calc: FilaCalculada;
  forma: FormaMedicion;
  comunes: ComunesTala;
  abierta: boolean;
  /** Guardando: nada se edita hasta que responda el libro. */
  bloqueada: boolean;
  onAbrir: () => void;
  onEditar: (cambio: Partial<Pick<FilaTala, "medidas" | "fecha">>) => void;
  /** Fila del registro: cambiar el código propuesto. */
  onCodigo?: (codigo: string) => void;
  /** Plantación: la especie no está en el registro (el libro la rechaza: T7). */
  fueraDelRegistro?: boolean;
  /** El lugar de la fila en la planilla (rótulo estable del código, que se edita). */
  numero: number;
  onQuitar: (() => void) | null;
  /** Lo plegado (motosierrista, hora, GPS, foto, nota, el motivo T8). */
  children: React.ReactNode;
}) {
  const a = f.arbol;
  const campos = camposDeTala(forma);
  const guardada = f.resultado?.estado === "guardada" ? f.resultado : null;
  const fallida = f.resultado?.estado === "fallida" ? f.resultado : null;
  const quieta = bloqueada || guardada != null;
  const fecha = efectivosDeFila(f, comunes).fecha;
  const extras = extrasDeFila(f);
  const infraccion = a.reparo?.nivel === "infraccion";
  /** Cómo se nombra en los rótulos: el código (o la especie, mientras no tiene). */
  const nombre = nombreDeFila(f);
  const delRegistro = f.origen === "registro";

  return (
    <div
      role="group"
      aria-label={`Árbol ${nombre}`}
      data-fila-tala={nombre}
      data-origen={f.origen}
      className={`${FILA_TANDA} rounded-xl border p-3 lg:rounded-none lg:border-0 lg:border-b lg:px-1 lg:py-2 ${
        guardada
          ? "border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/5 lg:border-[var(--rule-soft)]"
          : fallida
            ? "border-[var(--data-error-500)]/60 bg-[var(--data-error-500)]/5 lg:border-[var(--rule-soft)]"
            : "border-[var(--rule-base)] lg:border-[var(--rule-soft)]"
      }`}
    >
      {/* El árbol, con lo que dice el censo para cotejar (o, del registro, su código propuesto). */}
      <div className="row-start-1 min-w-0 lg:row-start-auto">
        {delRegistro ? (
          <>
            <input
              type="text"
              value={a.treeCode}
              onChange={(e) => onCodigo?.(e.target.value)}
              disabled={quieta}
              maxLength={40}
              autoCapitalize="characters"
              aria-label={`Fila ${numero} · código del árbol (${a.speciesCommon})`}
              title="Código propuesto: el correlativo del plan + la especie. Cámbialo si la placa dice otro."
              className="h-9 w-full min-w-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 font-mono text-base font-bold tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-70 sm:text-sm"
            />
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm font-medium text-[var(--text-primary)]" title={a.speciesScientific ?? undefined}>
              <span className="truncate">{a.speciesCommon}</span>
              {a.cites && <CitesPill />}
            </p>
            <p className="truncate text-xs italic text-[var(--text-tertiary)]">{a.speciesScientific ?? "Del registro"}</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {a.treeCode}
              {a.cites && <CitesPill />}
            </p>
            <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={a.speciesScientific ?? undefined}>{a.speciesCommon}</p>
            {/* Lo que dice el censo, para cotejar: el volumen primero (contra él sale el %). */}
            <p className="font-mono text-xs tabular-nums text-[var(--text-secondary)]" title="Volumen estimado en el censo">
              Censo {a.volM3 == null ? "—" : fmtM3(a.volM3)} m³
            </p>
            <p className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]" title="DAP y altura comercial del censo (árbol en pie)">
              DAP {m(a.dapM, 2, 2)} · Hc {m(a.hcM, 0, 1)} m
            </p>
          </>
        )}
        {fueraDelRegistro && !guardada && (
          <p className={`mt-0.5 flex items-center gap-1 text-xs font-bold ${AMBAR}`} title="El libro no acepta talar en una plantación una especie que no está en su registro (T7)">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Fuera del registro
          </p>
        )}
        {a.reparo && !guardada && (
          <p className={`mt-0.5 flex items-center gap-1 text-xs font-bold ${infraccion ? ROJO : AMBAR}`} title={a.reparo.detalle}>
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {infraccion ? a.reparo.titulo : "Consulta al regente"}
          </p>
        )}
        {guardada && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {guardada.lineNo != null ? `Línea N° ${guardada.lineNo}` : "En el libro"}
          </p>
        )}
        {fallida && (
          <p className={`mt-0.5 flex items-center gap-1 text-xs font-bold ${ROJO}`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> No entró: mira el motivo
          </p>
        )}
      </div>

      <label className="col-[1/-1] block min-w-0 lg:col-auto">
        <span className={ROTULO}>Fecha</span>
        <input
          type="date"
          value={fecha}
          disabled={quieta}
          onChange={(e) => onEditar({ fecha: !e.target.value || e.target.value === comunes.fecha ? null : e.target.value })}
          aria-label={`${nombre} · fecha de tala`}
          title={f.fecha ? "Distinta a la de todos" : "La de todos"}
          className={`h-11 w-full min-w-0 rounded-lg border bg-[var(--surface-canvas)] px-2 font-mono text-base tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-70 sm:text-sm ${
            f.fecha ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
          }`}
        />
      </label>

      <span className={`col-[1/-1] grid gap-1.5 lg:col-auto ${colsMedidasTala(forma)}`}>
        {campos.map((campo) => (
          <label key={campo.clave} className={`block min-w-0 ${campo.clave === "largo" && forma === "cruzadas" ? "col-span-2 sm:col-span-1" : ""}`}>
            <span className={ROTULO}>{campo.corto}</span>
            <CampoMedida
              valor={campo.leer(f.medidas)}
              onValor={(v) => onEditar({ medidas: campo.escribir(f.medidas, v) })}
              aria-label={`${nombre} · ${campo.corto}`}
              /* Sin ejemplo en gris: en una planilla de varias filas, «14.00»
                 vacío se leía como un dato ya cargado (medido 28-09). */
              disabled={quieta}
              className={INPUT}
            />
          </label>
        ))}
      </span>

      {/* `span`, no `output`: un `output` es región viva y el lector anunciaría
          cada volumen en cada tecla. */}
      <div className="col-[1/-1] flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-sm tabular-nums lg:col-auto lg:block lg:text-right">
        <span className={`font-bold ${c.tipeada && !c.lista && !guardada ? AMBAR : "text-[var(--text-primary)]"}`}>
          {c.volumenM3 != null ? `${fmtM3(c.volumenM3)} m³` : c.tipeada ? (
            <span className="inline-flex items-center gap-1 font-sans text-xs" title={`Falta ${c.faltan.join(", ")}: no se asienta`}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> falta {c.faltan[0] ?? "medida"}
            </span>
          ) : (
            "—"
          )}
        </span>
        {c.difPct != null && (
          <span
            className={`block text-xs ${c.muyDistinto ? `font-bold ${AMBAR}` : "text-[var(--text-secondary)]"}`}
            title={`Medido ${fmtM3(c.volumenM3 ?? 0)} m³ contra ${fmtM3(a.volM3 ?? 0)} m³ estimados en el censo`}
          >
            {c.difPct > 0 ? "+" : ""}
            {formatNumber(c.difPct, { min: 0, max: 1 })} % vs censo
          </span>
        )}
        {c.ptAserrable != null && (
          <span className="block text-xs text-[var(--text-secondary)]" title="Pie tablar aserrable aproximado, al 56 % de rendimiento">
            ≈ {formatNumber(c.ptAserrable)} pt
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={abierta}
        aria-label={`Más datos del árbol ${nombre}${extras > 0 ? ` (${extras} propios)` : ""}`}
        className="relative row-start-1 grid h-11 w-11 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] lg:row-start-auto"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
        {extras > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent-dark)] font-mono text-xs font-bold text-white">
            {extras}
          </span>
        )}
      </button>

      {onQuitar && !guardada ? (
        <button
          type="button"
          onClick={onQuitar}
          disabled={bloqueada}
          aria-label={`Quitar el árbol ${nombre} de la planilla`}
          className="row-start-1 grid h-11 w-11 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] disabled:opacity-50 dark:hover:text-[var(--data-error-500)] lg:row-start-auto"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <span className="row-start-1 h-11 w-11 lg:row-start-auto" />
      )}

      {abierta && <div className="col-[1/-1]">{children}</div>}
    </div>
  );
}
