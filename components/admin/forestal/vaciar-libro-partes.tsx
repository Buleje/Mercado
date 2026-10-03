"use client";

/**
 * Piezas del modal «Vaciar el Libro de Operaciones»: las casillas con sus
 * textos, la lista de lo que se borra (la misma antes de confirmar y después
 * de borrar) y los lotes que no se pueden borrar con su motivo.
 *
 * Textos (Brandon 2026-10-02, «que cada texto sea fácil de entender para no
 * confundirse»): un título corto de QUÉ es, una línea de qué se borra y qué
 * NO, y el ejemplo en el ⓘ — nunca un párrafo a la vista.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { ResumenVaciado, ScopeVaciado, LoteBloqueado } from "@/lib/forestal/ctp-purga-tipos";

type Alcance = { valor: ScopeVaciado; titulo: string; linea: string; que: string; ejemplo: string };

export const ALCANCES: Alcance[] = [
  {
    valor: "trozas_disponibles",
    titulo: "Trozas que están en el patio",
    linea: "Borra las piezas que no se aserraron, no salieron ni están en un lote. No borra los ingresos ni las guías.",
    que: "Las trozas sueltas del patio. Las que ya entraron a la sierra, salieron en un camión o están apartadas en un lote se quedan.",
    ejemplo: "Importaste 60 trozas de una guía de prueba y no usaste ninguna: se borran las 60 piezas y la guía sigue en Ingresos.",
  },
  {
    valor: "madera_disponible",
    titulo: "Madera aserrada que no salió",
    linea: "Borra las corridas con madera declarada que nadie despachó, reprocesó ni puso en un lote. No borra trozas ni guías.",
    que: "Las corridas de producción que declararon madera y no tienen nada encima. Se borran con lo que consumieron de cada guía.",
    ejemplo: "Declaraste 3 corridas de cedro por error y no se vendieron: se borran las 3. Una que ya salió con una guía se queda.",
  },
  {
    valor: "consumo",
    titulo: "Consumos (troza → producción)",
    linea: "Borra todas las corridas sin salida ni lote encima, aunque no hayan declarado madera. No borra trozas ni guías.",
    que: "Igual que «Madera aserrada», pero también las corridas a medio declarar: las que consumieron troza y no dicen cuánta madera salió.",
    ejemplo: "Una corrida consumió 2 m³ de la guía 019-001-0000003 pero no anotó la madera: se borra. Con «Lotes» marcado, también caen las corridas de esos lotes.",
  },
  {
    valor: "lotes",
    titulo: "Lotes de aserrío y comerciales",
    linea: "Borra los lotes (también los mixtos). Sus trozas vuelven al patio. No borra madera ni producción.",
    que: "Los lotes que armaste para la sierra y los lotes comerciales. Si un lote ya se aserró, su corrida sólo se borra si marcas también «Consumos». Si su madera ya salió con una guía, el lote no se puede borrar y te decimos cuál.",
    ejemplo: "El lote LA-2026-004 tiene 12 trozas apartadas: se borra el lote y las 12 trozas quedan libres en el patio.",
  },
  {
    valor: "todo",
    titulo: "Todo el libro",
    linea: "Borra todo: ingresos, guías, trozas, producción, despachos y lotes.",
    que: "El libro entero, para empezar de cero. Incluye todo lo de las otras casillas.",
    ejemplo: "Cargaste un archivo equivocado: vacías el libro y vuelves a importar del SNIFFS.",
  },
];

const TITULO = Object.fromEntries(ALCANCES.map((a) => [a.valor, a.titulo])) as Record<ScopeVaciado, string>;

export function AlcancesVaciado({
  elegidos,
  onAlternar,
  deshabilitado,
}: {
  elegidos: ScopeVaciado[];
  onAlternar: (a: ScopeVaciado) => void;
  deshabilitado: boolean;
}) {
  const todo = elegidos.includes("todo");
  return (
    <fieldset>
      <legend className="text-base font-extrabold text-[var(--text-primary)]">Qué quieres borrar</legend>
      <p className="text-sm text-[var(--text-tertiary)]">Puedes marcar varias.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {ALCANCES.map((a) => {
          const marcado = elegidos.includes(a.valor);
          const apagado = deshabilitado || (todo && a.valor !== "todo");
          return (
            <div
              key={a.valor}
              className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2.5 transition-colors ${
                a.valor === "todo" ? "sm:col-span-2" : ""
              } ${
                marcado
                  ? "border-[var(--accent)] bg-[var(--accent)]/8"
                  : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]"
              } ${apagado && !marcado ? "opacity-50" : ""}`}
            >
              <label className={`flex flex-1 items-start gap-2 ${apagado ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  value={a.valor}
                  checked={marcado}
                  onChange={() => onAlternar(a.valor)}
                  disabled={apagado}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-sm font-bold text-[var(--text-primary)]">{a.titulo}</span>
                  <span className="block text-xs text-[var(--text-tertiary)]">{a.linea}</span>
                </span>
              </label>
              <InfoTip title={a.titulo} what={a.que} example={a.ejemplo} side="left" />
            </div>
          );
        })}
      </div>
      {todo && (
        <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
          «Todo el libro» ya incluye lo demás: las otras casillas quedan apagadas.
        </p>
      )}
    </fieldset>
  );
}

const n = (x: number, sing: string, plur = `${sing}s`) => `${formatNumber(x, 0)} ${x === 1 ? sing : plur}`;

/** Una fila por alcance elegido, con sus números. Misma lista antes y después. */
function filas(r: ResumenVaciado): { alcance: ScopeVaciado; detalle: string }[] {
  const pa = r.porAlcance;
  const out: { alcance: ScopeVaciado; detalle: string }[] = [];
  for (const a of r.alcances) {
    if (a === "trozas_disponibles" && pa.trozas_disponibles) {
      out.push({ alcance: a, detalle: n(pa.trozas_disponibles.trozas, "troza") });
    } else if (a === "madera_disponible" && pa.madera_disponible) {
      out.push({
        alcance: a,
        detalle:
          `${n(pa.madera_disponible.corridas, "corrida")} · ${n(pa.madera_disponible.consumos, "consumo")}` +
          (r.alcances.includes("consumo") ? " (ya cuentan en Consumos)" : ""),
      });
    } else if (a === "consumo" && pa.consumo) {
      out.push({
        alcance: a,
        detalle:
          `${n(pa.consumo.corridas, "corrida")} · ${n(pa.consumo.consumos, "consumo")}` +
          (pa.consumo.deLotes ? ` · ${pa.consumo.deLotes} son de los lotes que también borras` : ""),
      });
    } else if (a === "lotes" && pa.lotes) {
      const l = pa.lotes;
      out.push({
        alcance: a,
        detalle:
          `${n(l.aserrio, "de aserrío", "de aserrío")} · ${n(l.mixtos, "mixto")} · ${n(l.comerciales, "comercial", "comerciales")}` +
          ` · ${n(l.trozasAlPatio, "troza vuelve", "trozas vuelven")} al patio`,
      });
    } else if (a === "todo" && pa.todo) {
      const t = pa.todo;
      out.push({
        alcance: a,
        detalle:
          `${n(t.ingresos, "ingreso")} · ${n(t.trozas, "troza")} · ${n(t.produccion, "corrida")} · ` +
          `${n(t.despachos, "despacho")} · ${n(t.lotes, "lote")}`,
      });
    }
  }
  return out;
}

export function ListaDeLoQueSeBorra({ resumen }: { resumen: ResumenVaciado }) {
  const { conteo } = resumen;
  return (
    <div>
      <ul className="space-y-2">
        {filas(resumen).map((f) => (
          <li key={f.alcance} className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
            <span className="block text-sm font-bold text-[var(--text-primary)]">{TITULO[f.alcance]}</span>
            <span className="block text-base tabular-nums text-[var(--text-secondary)]">{f.detalle}</span>
          </li>
        ))}
      </ul>
      {resumen.alcances.length > 1 && (
        <p className="mt-2 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
          En total, sin repetir: {n(conteo.total, "registro")}
        </p>
      )}
      {conteo.saltadas ? (
        <p className="mt-1 text-sm tabular-nums text-[var(--text-tertiary)]">
          Se quedan {n(conteo.saltadas, "corrida")} porque ya tienen salida, reproceso, lote o piezas encima.
        </p>
      ) : null}
    </div>
  );
}

const TIPO: Record<LoteBloqueado["tipo"], string> = { aserrio: "Lote", mixto: "Lote mixto", comercial: "Lote comercial" };
const A_LA_VISTA = 5;

export function LotesQueNoSeBorran({ lotes }: { lotes: LoteBloqueado[] }) {
  if (lotes.length === 0) return null;
  const fila = (l: LoteBloqueado) => (
    <li key={`${l.tipo}-${l.id}`} className="text-sm text-[var(--text-secondary)]">
      <strong className="font-bold text-[var(--text-primary)]">
        {TIPO[l.tipo]} {l.codigo}
      </strong>{" "}
      — No se puede: {l.motivo}
    </li>
  );
  return (
    <div className="rounded-xl bg-[var(--data-warning)]/10 px-4 py-3">
      <p className="text-base font-extrabold text-[var(--text-primary)]">
        {n(lotes.length, "lote no se borra", "lotes no se borran")}
      </p>
      <ul className="mt-1 space-y-1">{lotes.slice(0, A_LA_VISTA).map(fila)}</ul>
      {lotes.length > A_LA_VISTA && (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">
            Ver los otros {lotes.length - A_LA_VISTA}
          </summary>
          <ul className="mt-1 space-y-1">{lotes.slice(A_LA_VISTA).map(fila)}</ul>
        </details>
      )}
    </div>
  );
}
