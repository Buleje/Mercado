"use client";

/**
 * Las tarjetas del patio que ayudan a decidir HOY: qué se lleva a la sierra,
 * cuánto vale lo que está parado y a qué ritmo se mueve la cancha.
 *
 * Toda la cuenta vive en `lib/forestal/trozas-patio-kpis.ts` (puro, con tests);
 * acá sólo se dibuja. Lo derivado se rotula como derivado: los pies tablares
 * llevan «≈» y su fórmula en el ⓘ, y lo que no tiene factura dice «Sin costear»,
 * nunca S/ 0.
 */

import { ArrowLeftRight, Axe, Coins } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import type { FlujoPatio, PrimeroALaSierra, ValorPatio } from "@/lib/forestal/trozas-patio-kpis";
import type { GrupoTrozas } from "@/lib/forestal/trozas-patio";
import { AccionTarjeta, BarraMini, TarjetaPatio } from "./ctp-trozas-kpi-tarjeta";
import { n2 } from "./ctp-trozas-ui";
import type { PatioMeta } from "./hooks/use-trozas-patio";

const pz = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

export function TarjetaSierra({
  libres, pt, rendimiento, primero, filtrando, onLibres, onPrimero,
}: {
  libres: GrupoTrozas;
  pt: number | null;
  rendimiento: PatioMeta["rendimientoLibro"];
  primero: PrimeroALaSierra | null;
  filtrando: boolean;
  onLibres: () => void;
  onPrimero: (p: PrimeroALaSierra) => void;
}) {
  const formula = rendimiento
    ? `${n2(libres.m3)} m³ × ${n2(rendimiento.pct)} % × 424 pt/m³`
    : "falta una corrida con entrada para tener el rendimiento";
  return (
    <TarjetaPatio
      label="Listas para la sierra"
      icono={Axe}
      valor={libres.piezas}
      contexto={`${n2(libres.m3)} m³ libres · toca para filtrar`}
      tono={libres.piezas > 0 ? "success" : "muted"}
      onClick={onLibres}
      filtrando={filtrando}
      titulo="Ver sólo las libres en la lista"
      info={{
        what: "Libres en el patio: bajaron del camión y no están apartadas en un lote.",
        affects: rendimiento
          ? `Los pies tablares son una ESTIMACIÓN: ${formula}. El rendimiento sale de ${rendimiento.corridas} ${rendimiento.corridas === 1 ? "corrida" : "corridas"} del libro (${n2(rendimiento.entradaM3)} m³ de troza). No es una cubicación.`
          : "Sin corridas con entrada no hay rendimiento real: no se estiman pies tablares (nunca se supone el 56 %, que es un tope legal).",
        example: "«Primero» propone las libres más viejas: la troza parada se mancha y se raja.",
      }}
      accion={
        primero && primero.desde > 0 ? (
          <AccionTarjeta onClick={() => onPrimero(primero)} titulo="Filtrar la lista: libres de ese tramo">
            Primero: {primero.piezas} de {primero.label.replace(" días", " d")} · {n2(primero.m3)} m³
          </AccionTarjeta>
        ) : primero ? (
          <span className="text-xs text-[var(--text-secondary)]">Ninguna libre pasa de 14 días</span>
        ) : undefined
      }
    >
      {libres.piezas > 0 && (
        <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]" title={formula}>
          {pt != null ? (
            <>
              ≈ {n2(pt)} pt{" "}
              <span className="font-sans text-xs font-normal text-[var(--text-secondary)]">estimados al {n2(rendimiento?.pct ?? 0)} % del libro</span>
            </>
          ) : (
            <span className="font-sans text-xs font-normal text-[var(--text-secondary)]">pt sin estimar: el libro no tiene rendimiento</span>
          )}
        </p>
      )}
    </TarjetaPatio>
  );
}

export function TarjetaValor({ valor, onCargar }: { valor: ValorPatio; onCargar?: () => void }) {
  const propio = Math.max(0, valor.m3Total - valor.m3DeServicio);
  const sinNada = valor.m3Total === 0;
  const faltan = valor.guiasSinCosto;
  const guias = `${faltan} ${faltan === 1 ? "guía" : "guías"}`;
  const contexto = sinNada
    ? "no hay nada parado"
    : valor.soles == null
      ? faltan > 0
        ? `${guias} sin factura · ${n2(valor.m3SinCosto)} m³`
        : "madera de servicio: no se compró"
      : valor.m3SinCosto > 0
        ? `parados · faltan ${guias}: ${n2(valor.m3SinCosto)} de ${n2(propio)} m³ sin costear`
        : `parados · todo costeado · ${n2(valor.m3Costeado)} m³`;
  const { guiaMayor, masVieja } = valor;
  return (
    <TarjetaPatio
      label="Valor parado"
      icono={Coins}
      valor={valor.soles == null ? (sinNada ? "—" : "Sin costear") : formatCurrency(valor.soles)}
      contexto={contexto}
      tono={valor.soles == null ? "muted" : valor.m3SinCosto > 0 ? "warning" : "neutral"}
      info={{
        what: "Lo que costó la madera que sigue parada: cada pieza × el costo por m³ de su guía (factura ÷ m³ del asiento).",
        affects: "Sin factura no se valoriza: nunca S/ 0, que diría que esa madera no costó nada. La madera de servicio no es tuya y no entra. «Cargar costos» guarda la factura de cada guía sin ir a Ingresos.",
        example: "Guía de S/ 4,000.00 por 10 m³ → S/ 400.00 el m³; una troza de 1.5 m³ vale S/ 600.00.",
      }}
      accion={
        onCargar && faltan > 0 ? (
          <AccionTarjeta onClick={onCargar} titulo="El costo de cada guía sin factura, sin ir a Ingresos">
            Cargar costos · {guias}
          </AccionTarjeta>
        ) : undefined
      }
    >
      {!sinNada && (
        <div className="space-y-1">
          <span className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden="true">
            <span style={{ width: `${(valor.m3Costeado / valor.m3Total) * 100}%`, background: "var(--data-5)" }} />
            <span style={{ width: `${(valor.m3SinCosto / valor.m3Total) * 100}%`, background: "var(--data-warning-500)" }} />
            <span style={{ width: `${(valor.m3DeServicio / valor.m3Total) * 100}%`, background: "var(--data-3)" }} />
          </span>
          <p className="flex flex-wrap gap-x-2.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
            <Leyenda color="var(--data-5)" texto={`costeado ${n2(valor.m3Costeado)} m³`} />
            {valor.m3SinCosto > 0 && <Leyenda color="var(--data-warning-500)" texto={`sin factura ${n2(valor.m3SinCosto)} m³`} />}
            {valor.m3DeServicio > 0 && <Leyenda color="var(--data-3)" texto={`de servicio ${n2(valor.m3DeServicio)} m³`} />}
          </p>
          {masVieja && (
            <p className="text-xs text-[var(--text-secondary)]">
              La más vieja ({masVieja.dias} d){masVieja.codigo ? ` · ${masVieja.codigo}` : ""}:{" "}
              <b className="tabular-nums text-[var(--text-primary)]">{formatCurrency(masVieja.soles)}</b>
            </p>
          )}
          {guiaMayor && valor.guiasConCosto > 1 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Más plata: guía <span className="font-mono">{guiaMayor.gtfNumber}</span> ·{" "}
              <b className="tabular-nums text-[var(--text-primary)]">{formatCurrency(guiaMayor.soles)}</b>
            </p>
          )}
        </div>
      )}
    </TarjetaPatio>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {texto}
    </span>
  );
}

export function TarjetaRotacion({ flujo }: { flujo: FlujoPatio }) {
  const filas = [
    { label: "Entraron", g: flujo.entradas, color: "var(--data-6)" },
    { label: "A la sierra", g: flujo.aSierra, color: "var(--data-5)" },
    ...(flujo.enteras.piezas > 0 ? [{ label: "Enteras", g: flujo.enteras, color: "var(--data-8)" }] : []),
  ];
  const max = Math.max(...filas.map((f) => f.g.m3), 0);
  const d = flujo.diasASierra;
  return (
    <TarjetaPatio
      label={`Rotación · ${flujo.dias} días`}
      icono={ArrowLeftRight}
      valor={d ? `${n2(d.promedio)} d` : "—"}
      contexto={d ? `de la llegada a la sierra · promedio de ${pz(d.piezas)}` : "ninguna pieza fue a la sierra todavía"}
      tono={d ? "neutral" : "muted"}
      info={{
        what: `Cuánto tarda una troza desde que baja del camión hasta que entra a una corrida, y lo que entró contra lo que se aserró en los últimos ${flujo.dias} días.`,
        affects: "Si entra más de lo que se asierra, la cancha se llena y la madera envejece. Los pedazos de un retrozado no cuentan como entrada: es la misma madera.",
        example: "Bajó el lunes y entró a la sierra el jueves → 3 d.",
      }}
    >
      <div className="space-y-1.5">
        {filas.map((f) => (
          <div key={f.label} className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">{f.label}</span>
            <BarraMini valor={f.g.m3} max={max} color={f.color} />
            <span className="font-mono text-xs tabular-nums text-[var(--text-primary)]">
              <b>{f.g.piezas}</b> <span className="text-[var(--text-secondary)]">· {n2(f.g.m3)} m³</span>
            </span>
          </div>
        ))}
      </div>
    </TarjetaPatio>
  );
}
