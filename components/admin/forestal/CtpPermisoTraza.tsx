"use client";

/**
 * «Trazabilidad» en la ficha de un permiso (ADR-432): el hilo que responde
 * «¿de qué guía salió esto?» — la pregunta que hace SERFOR/OSINFOR.
 *
 *  1. Cada guía de ingreso, expandible → sus corridas → sus despachos.
 *  2. La producción que no tiene guía de ingreso de este permiso detrás
 *     (corridas sin un m³ de consumo registrado).
 *  3. Los despachos del permiso, con su GTF de salida.
 *
 * Lee la misma respuesta que «Volumen»: pasar de una sección a la otra no
 * vuelve a pedir nada.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Layers } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { DespachoDelPermiso, VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import CtpDescontarMaderaModal from "./CtpDescontarMaderaModal";
import CtpPermisoTrazaGuia, { MarcaDeCorrida, nLinea } from "./CtpPermisoTrazaGuia";
import { fechaDelLibro, m3, tipoCorto } from "./permiso-volumen-ui";

const VACIO =
  "rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-3 text-sm text-[var(--text-secondary)]";
const FILA =
  "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm";

function Titulo({ id, texto, n, what }: { id: string; texto: string; n: number; what: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <CardTitle id={id}>
        {texto} <span className="font-mono text-[var(--text-tertiary)] tabular-nums">({n})</span>
      </CardTitle>
      <InfoTip title={texto} what={what} />
    </div>
  );
}

export default function CtpPermisoTraza({
  volumen,
  onRecargar,
}: {
  volumen: VolumenDelPermiso;
  /** Vuelve a sumar la ficha después de vincular una corrida. */
  onRecargar?: () => void;
}) {
  const { guias, corridas, despachos, avisos } = volumen;
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  /** La corrida que se está vinculando desde «Producción sin guía de ingreso». */
  const [vincular, setVincular] = useState<string | null>(null);

  const porId = useMemo(() => new Map(corridas.map((c) => [c.id, c])), [corridas]);
  const despachosPorCorrida = useMemo(() => {
    const m = new Map<string, DespachoDelPermiso[]>();
    for (const d of despachos) {
      for (const id of d.corridaIds) m.set(id, [...(m.get(id) ?? []), d]);
    }
    return m;
  }, [despachos]);
  const deOtroPermiso = useMemo(
    () => new Map(avisos.corridasDeOtroPermiso.map((c) => [c.id, c.contratoCodigo])),
    [avisos.corridasDeOtroPermiso],
  );
  /* La lista sale de los MISMOS ids que cuenta el aviso de Volumen: filtrar acá
     por `consumidoM3 === 0` podía dar otra cantidad que la del aviso. */
  const sinGuia = useMemo(() => {
    const ids = new Set(avisos.corridasSinMateriaPrima.ids);
    return corridas.filter((c) => ids.has(c.id));
  }, [corridas, avisos.corridasSinMateriaPrima.ids]);

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const todasAbiertas = guias.length > 0 && abiertas.size === guias.length;

  return (
    <div className="space-y-5">
      <section aria-labelledby="traza-guias" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Titulo
            id="traza-guias"
            texto="Guías de ingreso"
            n={guias.length}
            what="Ábrela para ver qué corridas comieron de esa guía y por qué GTF de salida se fue lo aserrado."
          />
          {guias.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setAbiertas(todasAbiertas ? new Set() : new Set(guias.map((g) => g.id)))
              }
              className="inline-flex h-10 items-center rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              {todasAbiertas ? "Cerrar todas" : "Abrir todas"}
            </button>
          )}
        </div>
        {guias.length === 0 ? (
          <p className={VACIO}>Ninguna guía de ingreso bajo este permiso.</p>
        ) : (
          <ul className="space-y-2">
            {guias.map((g) => (
              <CtpPermisoTrazaGuia
                key={g.id}
                guia={g}
                abierta={abiertas.has(g.id)}
                onAlternar={() => alternar(g.id)}
                corridas={porId}
                despachosPorCorrida={despachosPorCorrida}
                deOtroPermiso={deOtroPermiso}
              />
            ))}
          </ul>
        )}
      </section>

      {sinGuia.length > 0 && (
        <section aria-labelledby="traza-sin-guia" className="space-y-2">
          <Titulo
            id="traza-sin-guia"
            texto="Producción sin guía de ingreso"
            n={sinGuia.length}
            what="Corridas atadas al permiso sin un solo m³ de consumo registrado: no se puede decir de qué guía salieron. La rolliza que usaron sigue contando como saldo."
          />
          <ul className="space-y-1.5">
            {sinGuia.map((c) => (
              <li key={c.id} className={FILA}>
                <span className="font-mono font-bold tabular-nums">{nLinea(c.lineNo)}</span>
                <span className="text-[var(--text-secondary)]">{fechaDelLibro(c.fecha)}</span>
                <span className="font-semibold">{c.especie ?? "Sin especie"}</span>
                <span className="text-[var(--text-secondary)]">{tipoCorto(c.tipo)}</span>
                <span className="ml-auto font-mono tabular-nums">
                  {c.m3 == null
                    ? `${formatNumber(c.cantidad, { max: 3 })} ${c.unidad ?? ""} · sin convertir`
                    : `${m3(c.m3DelPermiso)} m³`}
                </span>
                <MarcaDeCorrida origen={c.origen} />
                {c.m3 != null && c.m3 > 0 && (
                  <button
                    type="button"
                    onClick={() => setVincular(c.id)}
                    aria-label={`Vincular la corrida ${nLinea(c.lineNo)} con sus trozas`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
                  >
                    <Layers className="h-4 w-4" aria-hidden /> Vincular
                  </button>
                )}
              </li>
            ))}
          </ul>
          {vincular && (
            <CtpDescontarMaderaModal
              volumen={volumen}
              ids={[vincular]}
              individual
              onCerrar={() => setVincular(null)}
              onRecargar={onRecargar}
            />
          )}
        </section>
      )}

      <section aria-labelledby="traza-despachos" className="space-y-2">
        <Titulo
          id="traza-despachos"
          texto="Despachos"
          n={despachos.length}
          what="Cada salida con madera de este permiso y su GTF de salida. Una salida que mezcla permisos cuenta acá sólo lo de este."
        />
        {despachos.length === 0 ? (
          <p className={VACIO}>
            Sin despachos todavía: ninguna GTF de salida lleva madera de este permiso.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {despachos.map((d) => {
              const lineas = d.corridaIds
                .map((id) => porId.get(id)?.lineNo)
                .filter((n): n is number => n != null);
              return (
                <li key={d.id} className={FILA}>
                  <span className="font-mono font-bold tabular-nums">
                    {d.gtf ? `GTF ${d.gtf}` : "Sin GTF"}
                  </span>
                  <span className="text-[var(--text-secondary)]">{fechaDelLibro(d.fecha)}</span>
                  <span>{d.destino ?? "Sin destino"}</span>
                  <span className="text-[var(--text-secondary)]">
                    {d.especie ?? "Sin especie"} · {tipoCorto(d.tipo)}
                  </span>
                  <span className="ml-auto font-mono font-bold tabular-nums">{m3(d.m3)} m³</span>
                  {(lineas.length > 0 || d.rollizaM3 > 0) && (
                    <span className="basis-full text-xs text-[var(--text-secondary)]">
                      {lineas.length > 0 && `De ${lineas.map((n) => `N° ${n}`).join(", ")}`}
                      {lineas.length > 0 && d.rollizaM3 > 0 && " · "}
                      {d.rollizaM3 > 0 &&
                        `${m3(d.rollizaM3)} m³ en troza (${d.trozas} ${d.trozas === 1 ? "troza" : "trozas"})`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
