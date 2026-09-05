"use client";

/**
 * Las PIEZAS de la guía, al momento de ingresarla (ADR-335 · ADR-336).
 *
 * Cuatro cosas que el que descarga el camión sabe JUSTO en ese momento y que
 * antes había que hacer después —o pieza por pieza, que es lo mismo que no
 * hacerlas—:
 *
 *  1. **Qué llegó.** La guía declara 30 trozas y bajaron 28: se destildan las
 *     dos y quedan «no recepcionadas» (ADR-325). El documento no se toca —sigue
 *     declarando 30— pero el patio no muestra madera que no está.
 *  2. **Cuándo llegó cada una.** Una guía grande se descarga en dos viajes: el
 *     saldo del lunes no puede incluir la madera que bajó el miércoles.
 *  3. **El código del centro**, único: es la marca que alguien pinta sobre la
 *     troza, y dos piezas con el mismo número no se distinguen en el patio.
 *  4. **Cuánto entra de verdad.** El pie compara lo declarado contra lo que se
 *     está recibiendo: es el número que tiene que cuadrar con la pila.
 *
 * Todo se hace EN LOTE sobre una selección. Marcar sesenta veces lo mismo no lo
 * hace nadie, y lo que no se hace en el patio se inventa después en la oficina.
 */

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarClock, Check, Eraser, Hash, Loader2, PackageCheck, X,
} from "@buleje/design-system/icons";
import type { TrozaImportada } from "@/lib/forestal/trozas-import";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  codigosRepetidos,
  fecharRecepcion,
  limpiarCodigos,
  marcarRecepcion,
  normalizarCodigo,
  numerarTrozas,
  ordenarTrozas,
  resumenRecepcion,
  type CampoOrden,
  type DireccionOrden,
} from "@/lib/forestal/trozas-recepcion";
import { useCodigosPlantaEnUso } from "@/hooks/use-codigos-planta";
import CtpPiezasTabla, { type FilaTroza } from "./CtpPiezasTabla";

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";
const CHIP =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";

export default function CtpPiezasDelIngreso({
  trozas,
  onChange,
  /** Fecha de recepción del ingreso: es el default razonable para las piezas. */
  fechaSugerida,
}: {
  trozas: TrozaImportada[];
  onChange: (t: TrozaImportada[]) => void;
  fechaSugerida?: string;
}) {
  const [numerando, setNumerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [orden, setOrden] = useState<{ campo: CampoOrden; dir: DireccionOrden }>({ campo: "orden", dir: "asc" });
  const [fechaLote, setFechaLote] = useState(fechaSugerida ?? "");
  /** Última fila tocada — el ancla del shift+click. */
  const ancla = useRef<number | null>(null);
  /**
   * La lista TAL COMO ESTÁ AHORA, para las acciones que esperan al servidor.
   *
   * Numerar pide el correlativo al backend y eso tarda: si el operador aplica
   * una fecha mientras la respuesta viaja, el `trozas` capturado en el closure
   * ya es viejo y al volver pisa ese cambio. Medido: la fecha de las 7 piezas
   * se perdía sola.
   */
  const trozasRef = useRef(trozas);
  trozasRef.current = trozas;

  const resumen = useMemo(() => resumenRecepcion(trozas), [trozas]);
  const repetidos = useMemo(() => codigosRepetidos(trozas), [trozas]);
  const codigos = useMemo(
    () => trozas.map((t) => normalizarCodigo(t.codigoPlanta)).filter((c): c is string => Boolean(c)),
    [trozas],
  );
  const { enUso, verificando } = useCodigosPlantaEnUso(codigos);

  /** Lo que se ve: el orden elegido, con la posición real de cada pieza. */
  const filas: FilaTroza[] = useMemo(() => {
    const conIdx = trozas.map((troza, idx) => ({ troza, idx }));
    if (orden.campo === "orden" && orden.dir === "asc") return conIdx;
    const ordenadas = ordenarTrozas(trozas, orden.campo, orden.dir);
    // El índice REAL se resuelve por identidad del objeto: dos trozas pueden
    // compartir código y orden si la lista vino mal, y ahí `indexOf` por valor
    // devolvería siempre la primera.
    const usados = new Set<number>();
    return ordenadas.map((t) => {
      const idx = conIdx.find((c) => c.troza === t && !usados.has(c.idx))?.idx ?? -1;
      usados.add(idx);
      return { troza: t, idx };
    });
  }, [trozas, orden]);

  /** Nada seleccionado = la acción vale para TODAS. Es lo que espera el patio. */
  const objetivo = seleccion.size > 0 ? seleccion : undefined;
  const alcance = seleccion.size > 0 ? seleccion.size : trozas.length;

  /** Cualquier cambio invalida el aviso anterior: si no, «no había nada para
   *  numerar» queda colgado sobre una lista que ya se renumeró. */
  const aplicar = (nuevas: TrozaImportada[]) => {
    setError(null);
    onChange(nuevas);
  };

  const seleccionar = (idx: number, opts: { rango: boolean }) => {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (opts.rango && ancla.current != null) {
        // El rango va sobre lo que SE VE, no sobre el orden del documento: si la
        // tabla está ordenada por volumen, "de ésta a aquélla" son las de la
        // pantalla.
        const posiciones = filas.map((f) => f.idx);
        const a = posiciones.indexOf(ancla.current);
        const b = posiciones.indexOf(idx);
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) s.add(posiciones[i]!);
          return s;
        }
      }
      if (s.has(idx)) s.delete(idx);
      else s.add(idx);
      return s;
    });
    ancla.current = idx;
  };

  const seleccionarTodas = () => setSeleccion(new Set(trozas.map((_, i) => i)));
  const seleccionarSi = (pred: (t: TrozaImportada) => boolean) =>
    setSeleccion(new Set(trozas.map((t, i) => (pred(t) ? i : -1)).filter((i) => i >= 0)));

  const cambiarOrden = (campo: CampoOrden) =>
    setOrden((prev) => ({ campo, dir: prev.campo === campo && prev.dir === "asc" ? "desc" : "asc" }));

  /**
   * Numera las piezas desde el próximo correlativo libre del centro.
   *
   * El correlativo lo da el SERVIDOR (`MAX + 1`): calcularlo en el navegador con
   * lo que hay en pantalla numeraría encima de guías que este modal no vio.
   */
  const generarCodigos = async (pisarExistentes = false) => {
    setNumerando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas?siguienteCodigo=1", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const desde = Number((await r.json()).siguiente) || 1;
      // `trozasRef` y no `trozas`: entre el pedido y la respuesta el operador
      // pudo marcar o fechar piezas, y numerar sobre la foto vieja borraría eso.
      const res = numerarTrozas(trozasRef.current, {
        desde,
        seleccion: objetivo,
        pisarExistentes,
        // Lo que el libro ya tiene tomado: el correlativo salta esos números en
        // vez de chocar y que el servidor rechace la guía entera al guardar.
        ocupados: [...enUso.keys()],
      });
      aplicar(res.trozas);
      if (res.asignados === 0) {
        setError("No había ninguna pieza para numerar: las recibidas ya tienen código (usá «Renumerar» para pisarlos).");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNumerando(false);
    }
  };

  if (trozas.length === 0) return null;

  const hayChoques = resumen.repetidos.length > 0 || enUso.size > 0;

  return (
    <div className="space-y-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      {/* ── Qué hay y qué está elegido ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <PackageCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Lista de trozas · {trozas.length} pieza{trozas.length === 1 ? "" : "s"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-[var(--text-tertiary)]">
            {seleccion.size > 0 ? `${seleccion.size} elegida${seleccion.size === 1 ? "" : "s"}` : "Elegí piezas o aplicá a todas"}
          </span>
          <button type="button" onClick={seleccionarTodas} className={CHIP}>Todas</button>
          <button type="button" onClick={() => setSeleccion(new Set())} disabled={seleccion.size === 0} className={CHIP}>
            Ninguna
          </button>
          <button
            type="button"
            onClick={() => seleccionarSi((t) => !t.noRecepcionada && !normalizarCodigo(t.codigoPlanta))}
            className={CHIP}
            title="Las recibidas que todavía no tienen código de planta"
          >
            Sin código ({resumen.sinCodigo})
          </button>
          <button
            type="button"
            onClick={() => seleccionarSi((t) => !t.noRecepcionada && !(t.fechaRecepcion ?? "").trim())}
            className={CHIP}
            title="Las recibidas que todavía no tienen fecha de llegada"
          >
            Sin fecha ({resumen.sinFecha})
          </button>
        </div>
      </div>

      {/* ── Lo que se hace con ellas ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2">
        <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Sobre {alcance} {alcance === 1 ? "pieza" : "piezas"}
        </span>
        <button type="button" onClick={() => aplicar(marcarRecepcion(trozas, objetivo, true))} className={BTN}>
          <Check className="h-4 w-4" /> Llegaron
        </button>
        <button type="button" onClick={() => aplicar(marcarRecepcion(trozas, objetivo, false))} className={BTN}>
          <X className="h-4 w-4" /> No llegaron
        </button>

        <span className="mx-1 hidden h-6 w-px bg-[var(--rule-base)] sm:block" aria-hidden />

        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
          <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <span className="sr-only sm:not-sr-only">Recibidas el</span>
          <input
            type="date"
            value={fechaLote}
            onChange={(e) => setFechaLote(e.target.value)}
            aria-label="Fecha de recepción a aplicar en lote"
            className="h-9 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="button"
          onClick={() => aplicar(fecharRecepcion(trozas, objetivo, fechaLote))}
          disabled={!fechaLote}
          className={BTN}
          title="Le pone esa fecha de llegada a las piezas elegidas"
        >
          Aplicar fecha
        </button>

        <span className="mx-1 hidden h-6 w-px bg-[var(--rule-base)] sm:block" aria-hidden />

        <button
          type="button"
          onClick={() => void generarCodigos(false)}
          disabled={numerando}
          className={BTN}
          title="Numera las recibidas desde el próximo correlativo del centro, salteando los que ya existen y sin pisar los tipeados a mano"
        >
          {numerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
          Generar códigos
        </button>
        <button
          type="button"
          onClick={() => void generarCodigos(true)}
          disabled={numerando}
          className={BTN}
          title="Renumera TODAS las elegidas, incluso las que ya tienen código"
        >
          Renumerar
        </button>
        <button type="button" onClick={() => aplicar(limpiarCodigos(trozas, objetivo))} className={BTN}>
          <Eraser className="h-4 w-4" /> Limpiar códigos
        </button>
        {verificando && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
            <Loader2 className="h-3 w-3 animate-spin" /> verificando códigos…
          </span>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[var(--data-warning-50)] px-2.5 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* Un código repetido hace que el servidor rechace el ingreso ENTERO: se
          dice acá, con las piezas delante, y no al apretar Registrar. */}
      {hayChoques && (
        <p className="flex items-start gap-1.5 rounded-lg border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-2.5 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Hay códigos de planta que se repiten
            {resumen.repetidos.length > 0 && ` en esta lista (${resumen.repetidos.join(", ")})`}
            {enUso.size > 0 && `${resumen.repetidos.length > 0 ? " y" : ""} contra el libro (${[...enUso.keys()].join(", ")})`}.
            El código se pinta sobre la troza: dos piezas con el mismo número no se distinguen en el patio. Renumeralas
            antes de registrar.
          </span>
        </p>
      )}

      <CtpPiezasTabla
        filas={filas}
        seleccion={seleccion}
        orden={orden}
        repetidos={repetidos}
        enUso={enUso}
        onOrden={cambiarOrden}
        onSeleccionar={seleccionar}
        onLlego={(idx, llego) => aplicar(marcarRecepcion(trozas, new Set([idx]), llego))}
        onCodigo={(idx, valor) =>
          aplicar(trozas.map((t, k) => (k === idx ? { ...t, codigoPlanta: valor.trim() || null } : t)))
        }
        onFecha={(idx, valor) => aplicar(fecharRecepcion(trozas, new Set([idx]), valor))}
      />

      {/* Lo declarado contra lo que entra: el número que cuadra con la pila. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
        <span>
          Declara <b className="text-[var(--text-primary)]">{resumen.declaradas}</b> · {fmtM3(resumen.m3Declarado)} m³
        </span>
        <span
          className={
            resumen.faltantes === 0
              ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          }
        >
          Entra <b>{resumen.recibidas}</b> · {fmtM3(resumen.m3Recibido)} m³
        </span>
        {resumen.sinCodigo > 0 && (
          <span className="text-[var(--text-tertiary)]">{resumen.sinCodigo} sin código de planta</span>
        )}
        {resumen.sinFecha > 0 && (
          <span className="text-[var(--text-tertiary)]">{resumen.sinFecha} sin fecha de recepción</span>
        )}
      </p>
    </div>
  );
}
