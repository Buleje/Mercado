"use client";

/**
 * Las metas de cada indicador en el modal de Ajustes (ADR-508): verde,
 * amarillo (y «hasta» en los de rango), la frase del rojo y el interruptor
 * para apagarlo. Campo vacío = sin meta (la tarjeta queda en gris).
 *
 * «Ganancia desde el lanzamiento» no tiene umbrales propios: los toma de la
 * decisión (sección Negocio), así que acá sólo se apaga o se cambia su frase.
 */
import { INDICADORES, type DefIndicador, type IndicadorId } from "@/lib/semaforo/indicadores";
import type { FilaIndicadorForm } from "@/lib/semaforo/formulario";
import { CAMPO } from "@/components/admin/metas/clases-meta";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { Casilla } from "@/components/ui-system/Casilla";

interface Props {
  filas: Record<IndicadorId, FilaIndicadorForm>;
  onCambiar: (filas: Record<IndicadorId, FilaIndicadorForm>) => void;
}

const UNIDAD: Record<DefIndicador["unidad"], string> = { soles: "S/", porcentaje: "%", cantidad: "", dias: "días" };

function ayudaUmbral(def: DefIndicador): string {
  if (def.sentido === "rango") return "Verde entre «desde» y «hasta»; amarillo hasta el tope; más es rojo. Debajo del «desde» también es amarillo (se acaba).";
  if (def.sentido === "menor") return "Menos es mejor: verde hasta el primer número, amarillo hasta el segundo, más es rojo.";
  return "Más es mejor: verde desde el primer número, amarillo desde el segundo, menos es rojo.";
}

export function FilasIndicadores({ filas, onCambiar }: Props) {
  const poner = (id: IndicadorId, cambio: Partial<FilaIndicadorForm>) => onCambiar({ ...filas, [id]: { ...filas[id], ...cambio } });

  return (
    <ul className="divide-y divide-[var(--rule-soft)]">
      {INDICADORES.map((def) => {
        const f = filas[def.id];
        const conUmbral = def.id !== "ganancia_acumulada";
        const u = UNIDAD[def.unidad];
        const caja = (campo: "verde" | "amarillo" | "verdeHasta", etiqueta: string) => (
          <label className="flex min-w-0 flex-col gap-0.5 text-xs font-semibold text-[var(--text-secondary)]">
            {etiqueta}
            {u ? ` (${u})` : ""}
            <input
              value={f[campo]}
              inputMode="decimal"
              autoComplete="off"
              disabled={f.apagado}
              placeholder="Sin meta"
              aria-label={`${def.nombre}: ${etiqueta}`}
              onChange={(e) => {
                const cambio: Partial<FilaIndicadorForm> = {}; // clave variable sin perder el tipo
                cambio[campo] = e.target.value;
                poner(def.id, cambio);
              }}
              className={cn(CAMPO, "h-12 tabular-nums")}
            />
          </label>
        );
        return (
          <li key={def.id} data-fila-indicador={def.id} className={cn("space-y-2 py-3", f.apagado && "opacity-60")}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">{def.nombre}</span>
              <InfoTip what={def.mide} affects={conUmbral ? ayudaUmbral(def) : "Usa la meta de la decisión (sección Negocio)."} />
              <label className="ml-auto inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Casilla
                 
                  checked={!f.apagado}
                  onChange={(e) => poner(def.id, { apagado: !e.target.checked })} />
                {f.apagado ? "Apagado" : "Encendido"}
              </label>
            </div>
            {conUmbral && (
              <div className={cn("grid gap-2", def.sentido === "rango" ? "grid-cols-3" : "grid-cols-2")}>
                {caja("verde", def.sentido === "rango" ? "Verde desde" : def.sentido === "menor" ? "Verde hasta" : "Verde desde")}
                {def.sentido === "rango" && caja("verdeHasta", "Verde hasta")}
                {caja("amarillo", def.sentido === "mayor" ? "Amarillo desde" : "Amarillo hasta")}
              </div>
            )}
            <label className="flex flex-col gap-0.5 text-xs font-semibold text-[var(--text-secondary)]">
              Qué hacer en rojo
              <input
                value={f.rojo}
                maxLength={160}
                disabled={f.apagado}
                aria-label={`${def.nombre}: qué hacer en rojo`}
                onChange={(e) => poner(def.id, { rojo: e.target.value })}
                className={cn(CAMPO, "h-12")}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
