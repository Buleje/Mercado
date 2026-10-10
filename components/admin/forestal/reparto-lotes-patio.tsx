"use client";

/**
 * Pestaña «Sugeridos del patio» del panel «Lotes» (03-10): los lotes que el
 * patio propone por especie + permiso, con casillas para crear varios de una
 * vez. Cada lote creado entra a la Distribución como bloque con sus trozas.
 * Si el patio no propone nada, se dice por qué y dónde se arregla.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, PackagePlus, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { notasDelPatio } from "@/lib/forestal/panel-lotes-reparto";
import type { ResultadoCrearLotes } from "@/lib/forestal/propuesta-de-lotes";
import { formatNumber } from "@/lib/format";
import type { PanelLotes } from "./hooks/use-panel-lotes";
import { Aviso, BTN, BTN_PRIMARIO } from "./reparto-panel-lotes-ui";

export default function RepartoLotesPatio({ panel }: { panel: PanelLotes }) {
  const { patio, errorPatio, cargandoPatio, recargarPatio, crearDelPatio } = panel;
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCrearLotes | null>(null);

  const propuestas = patio?.propuestas ?? [];
  const notas = patio ? notasDelPatio(patio) : [];
  const vivas = propuestas.filter((p) => elegidas.has(p.clave));
  const todas = propuestas.length > 0 && vivas.length === propuestas.length;

  const alternar = (clave: string) =>
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  const crear = async () => {
    if (vivas.length === 0 || creando) return;
    setCreando(true);
    setError(null);
    setResultado(null);
    try {
      setResultado(await crearDelPatio(vivas));
      setElegidas(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  };

  return (
    <section aria-label="Lotes sugeridos del patio" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">
            Lo que propone el patio{patio ? ` (${propuestas.length})` : ""}
          </CardTitle>
          <InfoTip
            title="Un lote por especie y permiso"
            what="Las trozas libres del patio, ya recibidas y con permiso en su ingreso, agrupadas en un lote por especie y título habilitante."
            affects="Cada lote creado entra a la tabla como bloque con su lote y sus trozas: sus jornadas se registran en el Libro. El volumen se descuenta al registrar la producción, como siempre."
            example="Tornillo · 19-SEC/REG-PLT-2021-017 · 12 trozas · 8.412 m³ → lote LA-2026-014 y un bloque «Lote LA-2026-014»."
          />
        </div>
        <button type="button" onClick={() => void recargarPatio()} disabled={cargandoPatio} className={BTN} title="Volver a leer el patio">
          <RefreshCw className={`h-4 w-4 ${cargandoPatio ? "animate-spin" : ""}`} aria-hidden /> Actualizar
        </button>
      </div>

      {errorPatio && <Aviso tono="error">No se pudo leer el patio: {errorPatio}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      {!patio && cargandoPatio && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el patio…
        </p>
      )}
      {notas.map((n) => (
        <Aviso key={n} tono="aviso">{n}</Aviso>
      ))}

      {propuestas.length > 0 && (
        <>
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={todas}
              onChange={() => setElegidas(todas ? new Set() : new Set(propuestas.map((p) => p.clave)))}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Elegir todos
          </label>
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" aria-label="Lotes que puedes crear">
            {propuestas.map((p) => (
              <li key={p.clave}>
                <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-[var(--surface-sunken)]">
                  <input
                    type="checkbox"
                    checked={elegidas.has(p.clave)}
                    onChange={() => alternar(p.clave)}
                    aria-label={`Crear el lote de ${p.especie} del permiso ${p.permiso ?? "sin permiso"}`}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[var(--text-primary)]">{p.especie}</span>
                    <span className="block break-all text-xs text-[var(--text-secondary)]">
                      {p.permiso ?? "Sin permiso"}{p.titular ? ` · ${p.titular}` : ""}
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums text-[var(--text-primary)]">
                    {formatNumber(p.trozas)} {p.trozas === 1 ? "troza" : "trozas"} · <b>{fmtM3(p.m3)} m³</b>
                    <span className="block text-xs text-[var(--text-tertiary)]">≈ {formatNumber(p.ptAserrable)} PT aserr.</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button type="button" onClick={crear} disabled={vivas.length === 0 || creando} className={BTN_PRIMARIO}>
              {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackagePlus className="h-4 w-4" aria-hidden />}
              {creando ? "Creando…" : vivas.length === 0 ? "Elige los lotes" : `Crear ${vivas.length} ${vivas.length === 1 ? "lote" : "lotes"}`}
            </button>
          </div>
        </>
      )}

      {resultado && (
        <ul className="space-y-1.5" aria-label="Resultado">
          {resultado.creados.map((c) => (
            <li key={c.loteId}>
              <Aviso tono="ok">
                {c.code} · {c.especie} · {c.trozas} trozas · {fmtM3(c.m3)} m³ — ya está en la tabla como bloque «Lote {c.code}».
                {c.noEntraron.length > 0 ? ` No entraron ${c.noEntraron.length}: ${c.noEntraron[0]?.motivo}.` : ""}
              </Aviso>
            </li>
          ))}
          {resultado.noCreados.map((n) => (
            <li key={`${n.especie}|${n.permiso ?? ""}`}>
              <Aviso tono="aviso">{n.especie}: {n.motivo}</Aviso>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
