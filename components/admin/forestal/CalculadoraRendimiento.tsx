"use client";

/**
 * CalculadoraRendimiento — el coeficiente de rendimiento del aserrío
 * (producto obtenido ÷ materia prima consumida), el número que SERFOR pide
 * en cada registro de transformación del LO-CTP.
 *
 * Entrada en m³ de troza; salida en PT o m³ de aserrada. Al lado, el promedio
 * REAL de las corridas registradas en el Libro CTP del tenant — para saber si
 * la corrida que estás por anotar está dentro de lo normal del aserradero.
 */
import { useEffect, useMemo, useState } from "react";
import { Gauge, Percent, Download } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Totales de lo que ya está cubicado en las otras herramientas (localStorage). */
function totalesCubicador(): { aserradoPt: number; trozasM3: number } {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  const read = (k: string): unknown[] => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const madera = read(`buleje-cubicacion-${slug}`) as { pieTablar?: number }[];
  const trozas = read(`buleje-cubicacion-trozas-${slug}`) as { m3?: number }[];
  return {
    aserradoPt: madera.reduce((a, r) => a + (Number(r.pieTablar) || 0), 0),
    trozasM3: trozas.reduce((a, r) => a + (Number(r.m3) || 0), 0),
  };
}

/** Rangos orientativos del aserrío peruano (coeficiente output/input). */
const RANGOS = [
  { hasta: 40, label: "bajo para aserrío", tono: "error" },
  { hasta: 65, label: "normal de aserrío (40–65%)", tono: "success" },
  { hasta: 85, label: "alto — ¿reaserrado o producto poco escuadrado?", tono: "warning" },
  { hasta: Infinity, label: "imposible: salió más de lo que entró", tono: "error" },
] as const;

const fmtPct = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface PromedioLibro {
  promedio: number;
  corridas: number;
}

export default function CalculadoraRendimiento() {
  const [inputM3, setInputM3] = useState("");
  const [salida, setSalida] = useState("");
  const [unidad, setUnidad] = useState<"pt" | "m3">("pt");
  const [libro, setLibro] = useState<PromedioLibro | null>(null);
  const [libroError, setLibroError] = useState(false);
  const [disponible, setDisponible] = useState<{ aserradoPt: number; trozasM3: number }>({ aserradoPt: 0, trozasM3: 0 });

  // Lo que ya está cubicado en las otras herramientas — para traerlo de un toque.
  useEffect(() => { setDisponible(totalesCubicador()); }, []);
  const hayCubicado = disponible.aserradoPt > 0 || disponible.trozasM3 > 0;
  const traerDelCubicador = () => {
    if (disponible.trozasM3 > 0) setInputM3(String(Math.round(disponible.trozasM3 * 10000) / 10000));
    if (disponible.aserradoPt > 0) { setSalida(String(Math.round(disponible.aserradoPt * 100) / 100)); setUnidad("pt"); }
  };

  // Promedio real del Libro CTP (rendimientoPct de las corridas registradas).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/ctp?section=produccion", { credentials: "include" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { entries?: { rendimientoPct?: number | string | null }[] };
        if (cancelado) return;
        const valores = (j.entries ?? [])
          .map((e) => Number(e.rendimientoPct))
          .filter((v) => Number.isFinite(v) && v > 0);
        if (valores.length > 0) {
          setLibro({ promedio: valores.reduce((a, b) => a + b, 0) / valores.length, corridas: valores.length });
        }
      } catch {
        if (!cancelado) setLibroError(true); // sin Libro habilitado: la calculadora sigue sirviendo sola
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const resultado = useMemo(() => {
    const inp = Number(inputM3);
    const out = Number(salida);
    if (!(inp > 0 && out > 0)) return null;
    const outM3 = unidad === "pt" ? out / PT_POR_M3 : out;
    const pct = (outM3 / inp) * 100;
    const rango = RANGOS.find((r) => pct <= r.hasta) ?? RANGOS[RANGOS.length - 1];
    return { pct, outM3, rango, mermaM3: Math.max(0, inp - outM3), mermaPct: Math.max(0, 100 - pct) };
  }, [inputM3, salida, unidad]);

  const tonoCls = (tono: string) =>
    tono === "success"
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : tono === "warning"
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <CardTitle as="h3" className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Gauge className="h-4 w-4 text-[var(--accent)]" /> Coeficiente de rendimiento
      </CardTitle>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        Cuánto producto salió de la troza consumida — el porcentaje que va en cada registro de transformación del Libro CTP.
      </p>

      {/* Cerrar el loop: traer lo cubicado en las otras herramientas de un toque */}
      {hayCubicado && (
        <button type="button" onClick={traerDelCubicador} className="mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10 px-4 py-2.5 text-left transition hover:brightness-95">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
            <Download className="h-4 w-4" /> Traer del cubicador
          </span>
          <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            {disponible.trozasM3 > 0 && <>trozas {disponible.trozasM3.toLocaleString("es-PE", { maximumFractionDigits: 4 })} m³</>}
            {disponible.trozasM3 > 0 && disponible.aserradoPt > 0 && " · "}
            {disponible.aserradoPt > 0 && <>aserrado {disponible.aserradoPt.toLocaleString("es-PE", { maximumFractionDigits: 2 })} PT</>}
          </span>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Entradas */}
        <div className="space-y-3">
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Troza consumida (m³)</span>
            <input
              type="number" inputMode="decimal" value={inputM3} onChange={(e) => setInputM3(e.target.value)} placeholder="0.000"
              className="mt-1 h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div>
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Producto obtenido</span>
            <div className="mt-1 flex gap-2">
              <input
                type="number" inputMode="decimal" value={salida} onChange={(e) => setSalida(e.target.value)} placeholder="0.00"
                className="h-12 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <div className="flex overflow-hidden rounded-xl border-2 border-[var(--rule-base)]">
                {(["pt", "m3"] as const).map((u) => (
                  <button key={u} type="button" onClick={() => setUnidad(u)} aria-pressed={unidad === u}
                    className={`px-3 text-sm font-bold transition ${unidad === u ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                    {u === "pt" ? "PT" : "m³"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div aria-hidden className="hidden w-px bg-[var(--rule-base)] lg:block" />

        {/* Resultado */}
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center">
          {resultado ? (
            <>
              <div className={`font-mono text-5xl font-extrabold tabular-nums ${tonoCls(resultado.rango.tono)}`}>
                {fmtPct(resultado.pct)}<span className="text-2xl">%</span>
              </div>
              <div className={`text-xs font-bold ${tonoCls(resultado.rango.tono)}`}>{resultado.rango.label}</div>
              <div className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                Merma <span className="font-mono tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{fmtPct(resultado.mermaPct)}%</span>
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">
                {unidad === "pt" ? `${salida} PT = ${fmtM3(Number(resultado.outM3))} m³ aserrados · ` : ""}
                merma {fmtM3(Number(resultado.mermaM3))} m³
              </div>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
              <Percent className="h-4 w-4" /> Poné la troza consumida y lo que salió.
            </p>
          )}
        </div>
      </div>

      {/* Promedio real del Libro del tenant */}
      <div className="mt-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3">
        {libro ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-[var(--text-secondary)]">
              Tu aserradero, según el Libro CTP: <b className="font-mono text-[var(--text-primary)]">{fmtPct(libro.promedio)}%</b> de promedio en {libro.corridas} {libro.corridas === 1 ? "corrida" : "corridas"}.
            </span>
            {resultado && (
              <span className={`text-xs font-bold ${Math.abs(resultado.pct - libro.promedio) <= 10 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>
                {Math.abs(resultado.pct - libro.promedio) <= 10 ? "En línea con tu histórico" : `Se aparta ${fmtPct(Math.abs(resultado.pct - libro.promedio))} pts de tu histórico`}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">
            {libroError
              ? "No se pudo leer el Libro CTP (¿especialización deshabilitada?). La calculadora funciona igual."
              : "Sin corridas con rendimiento registrado en el Libro CTP todavía — cuando registres transformaciones, acá aparece tu promedio real."}
          </p>
        )}
      </div>
    </div>
  );
}
