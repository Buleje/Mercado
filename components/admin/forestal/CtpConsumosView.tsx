"use client";

/**
 * La Sección 2 del Libro de Operaciones —CONSUMOS— en pantalla.
 *
 * Era la única de las cuatro secciones del formato sin vista propia: existía en
 * el Excel oficial, pero para ver qué se consumió había que abrir corrida por
 * corrida. Un fiscalizador pregunta "¿qué madera entró a la sierra este mes?" y
 * eso tiene que responderse de una.
 *
 * Las filas las arma `filasConsumo()`, la MISMA que la hoja "2. Consumos" del
 * Excel: pantalla y libro presentado no pueden declarar consumos distintos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Flame, Loader2, Search } from "@buleje/design-system/icons";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { unidadOficial } from "@/lib/forestal/loctp-campos";
import {
  filasConsumo,
  type FilaConsumo,
  type GrafoConsumos,
  type IngresoConsumo,
} from "@/lib/forestal/loctp-consumos";
import { consumosACsv, nombreArchivoSeccion } from "@/lib/forestal/ctp-secciones-csv";
import { Celda, Cuadro, SinDatos, Texto, Th } from "./ctp-cuadro-shared";

/** Sin tildes ni mayúsculas: se busca como se tipea, no como se escribió. */
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default function CtpConsumosView({ period }: { period: CtpPeriod }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaConsumo[]>([]);
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [gtf, setGtf] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const url = (base: string, extra: Record<string, string> = {}) => {
        const u = new URL(base, window.location.origin);
        for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
        applyCtpPeriodParams(u.searchParams, period);
        return u.toString();
      };
      const pedir = async <T,>(u: string): Promise<T> => {
        const r = await fetch(u, { credentials: "include" });
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        return (await r.json()) as T;
      };
      const [gra, ing] = await Promise.all([
        pedir<{ grafo?: GrafoConsumos }>(url("/api/admin/forestal/ctp", { grafo: "1" })),
        pedir<{ entries?: (IngresoConsumo & { status?: string })[] }>(
          url("/api/admin/forestal/wood-entries", { limit: "5000" }),
        ),
      ]);
      const ingresos = (ing.entries ?? []).filter((e) => e.status !== "anulado" && e.status !== "rechazado");
      setFilas(filasConsumo(gra.grafo ?? null, ingresos));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Las opciones salen de TODO el período, no de lo filtrado: si se achicaran
   *  con el filtro, quitar uno no se podría deshacer desde el propio selector. */
  const opcionesEspecie = useMemo(
    () => [...new Set(filas.map((f) => f.especieComun).filter((x) => x && x !== "—"))].sort(),
    [filas],
  );
  const opcionesGtf = useMemo(
    () => [...new Set(filas.map((f) => f.gtf).filter((x) => x && x !== "—"))].sort(),
    [filas],
  );

  const visibles = useMemo(() => {
    const t = norm(texto);
    return filas.filter((f) => {
      if (especie && norm(f.especieComun) !== norm(especie)) return false;
      if (gtf && norm(f.gtf) !== norm(gtf)) return false;
      if (t) {
        const campos = [f.gtf, f.especieComun, f.especieCientifica, f.codigoOrigen, f.fuenteOrigen, f.observaciones];
        if (!campos.some((c) => norm(c).includes(t))) return false;
      }
      return true;
    });
  }, [filas, texto, especie, gtf]);

  const total = useMemo(() => visibles.reduce((a, f) => a + f.cantidad, 0), [visibles]);
  const especies = useMemo(() => new Set(visibles.map((f) => f.especieComun)).size, [visibles]);
  const guias = useMemo(() => new Set(visibles.map((f) => f.gtf)).size, [visibles]);

  /** Se baja lo que se está VIENDO — el filtro es parte de lo que se exporta. */
  function descargarCsv() {
    const csv = consumosACsv(visibles);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSeccion("consumos", period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)] dark:bg-[var(--surface-raised)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Recorriendo la cadena de custodia del período…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>No se pudieron cargar los consumos: {error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 py-3 dark:bg-[var(--surface-raised)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Flame className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {visibles.length === filas.length
              ? `${filas.length} consumo${filas.length === 1 ? "" : "s"}`
              : `${visibles.length} de ${filas.length} consumos`}{" "}
            · {period.label}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {total.toFixed(4)} m³ de {especies} especie{especies === 1 ? "" : "s"} · {guias} guía
            {guias === 1 ? "" : "s"} de origen
          </p>
        </div>
        <button
          type="button"
          onClick={descargarCsv}
          disabled={visibles.length === 0}
          title={`Descargar en Excel/CSV los ${visibles.length} consumos de este filtro`}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] disabled:opacity-40"
        >
          <Download className="h-4 w-4" aria-hidden /> Descargar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Guía, especie, código de origen…"
            aria-label="Buscar en los consumos"
            className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-transparent pl-9 pr-3 text-sm text-[var(--text-primary)]"
          />
        </label>
        <select
          value={especie}
          onChange={(e) => setEspecie(e.target.value)}
          aria-label="Filtrar por especie"
          className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-transparent px-3 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todas las especies</option>
          {opcionesEspecie.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={gtf}
          onChange={(e) => setGtf(e.target.value)}
          aria-label="Filtrar por guía de ingreso"
          className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-transparent px-3 text-sm text-[var(--text-primary)]"
        >
          <option value="">Todas las guías</option>
          {opcionesGtf.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {(texto || especie || gtf) && (
          <button
            type="button"
            onClick={() => { setTexto(""); setEspecie(""); setGtf(""); }}
            className="h-12 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)]"
          >
            Limpiar
          </button>
        )}
      </div>

      <Cuadro
        titulo="Sección 2 · Consumos"
        subtitulo="11 casilleros. Un consumo no es un registro suelto: es la madera de una guía entrando a una corrida. El casillero (10) va vacío porque las trozas no tienen lote — los lotes se arman recién en producción."
      >
        <thead className="border-b-2 border-[var(--rule-base)]">
          <tr>
            <Th ancho="w-14">(1) N°</Th>
            <Th>(2) Fecha</Th>
            <Th>(3) Tipo de producto</Th>
            <Th>(4) N. común</Th>
            <Th>(5) N. científico</Th>
            <Th>(6) Cód. origen/CTP</Th>
            <Th>(7) N° fuente</Th>
            <Th>(8) Unidad</Th>
            <Th>(9) Cantidad</Th>
            <Th>(11) Observaciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-base)]">
          {visibles.length === 0 ? (
            <SinDatos cols={10}>
              {filas.length === 0
                ? "Sin consumos atribuidos en el período. Se registran al declarar de qué ingreso salió cada corrida de producción."
                : "Ningún consumo coincide con el filtro."}
            </SinDatos>
          ) : (
            visibles.map((f) => (
              <tr key={`${f.woodEntryId}-${f.corridaId}-${f.nro}`} className="hover:bg-[var(--surface-sunken)]">
                <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{f.nro}</td>
                <Texto v={fmtFecha(f.fecha)} className="whitespace-nowrap" />
                <Texto v={f.tipoProducto} />
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.especieComun}</td>
                <Texto v={f.especieCientifica} className="italic" />
                <Texto v={f.codigoOrigen} className="font-mono" />
                <Texto v={f.fuenteOrigen} className="font-mono" />
                <Texto v={unidadOficial(f.unidad)} />
                <Celda v={f.cantidad} />
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-mono font-bold text-[var(--text-primary)]">{f.gtf}</span> → {f.observaciones}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Cuadro>
    </div>
  );
}
