"use client";

/**
 * CtpPlantaZonas — el terreno: cómo se reparte y qué hay en cada pedazo.
 *
 * Antes esto eran DOS bloques de 668 px sumados que decían lo mismo con
 * distinta forma: «Ocupación de la planta» (el % del área por tipo) y «Zonas de
 * la planta» (una tarjeta por zona con su área y su inventario). La barra de
 * ocupación se queda —de un vistazo dice si el patio se comió la planta— y las
 * tarjetas se vuelven filas: código, tipo, superficie, participación y qué hay
 * adentro, todo en una línea.
 *
 * Read-only: tocar una zona en el MAPA es lo que abre su ficha.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { Layers, MapPin, Truck } from "@buleje/design-system/icons";
import {
  zonaTipoMeta,
  type Item,
  type PlantaZona,
} from "@/lib/forestal/planta-zona-types";
import { fmtSubtotales, resumirItems } from "@/lib/forestal/planta-resumen";

const fmtArea = (m2: number) =>
  m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString("es-PE")} m²`;

export interface CtpPlantaZonasProps {
  zonas: PlantaZona[];
  /** zonaId → lo que está ubicado ahí. */
  itemsPorZona: Record<string, Item[]>;
  /** Centra el mapa en esa zona. */
  onIrAZona: (zonaId: string) => void;
  /** Emitir la guía con lo apilado en una cancha de reserva. */
  onDespachar: (zonaId: string) => void;
}

export default function CtpPlantaZonas({ zonas, itemsPorZona, onIrAZona, onDespachar }: CtpPlantaZonasProps) {
  const filas = useMemo(() => {
    const total = zonas.reduce((a, z) => a + (z.areaM2 ?? 0), 0);
    return {
      total,
      list: zonas
        .map((z) => {
          const r = resumirItems(itemsPorZona[z.id] ?? [], (it) => it.especie ?? it.sub);
          return {
            z,
            meta: zonaTipoMeta(z.tipo),
            area: z.areaM2 ?? 0,
            pct: total > 0 ? ((z.areaM2 ?? 0) / total) * 100 : 0,
            // Un renglón por tipo, sin mezclar unidades (ver `planta-resumen`).
            dentro: r.porKind.map((k) => fmtSubtotales(k.subtotales)).join(" · "),
            lineas: r.lineas,
            // Una cancha de reserva con aserrada adentro puede emitir su guía.
            puedeDespachar: z.tipo === "reserva" && (itemsPorZona[z.id] ?? []).some((it) => it.kind === "producto"),
          };
        })
        .sort((a, b) => b.area - a.area),
    };
  }, [zonas, itemsPorZona]);

  if (zonas.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Layers className="h-4 w-4 text-[var(--accent)]" /> Zonas de la planta
        </CardTitle>
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
          {zonas.length} zonas · {fmtArea(filas.total)} mapeados
        </span>
      </div>

      {/* Ocupación: cómo se reparte el terreno dibujado. */}
      {filas.total > 0 && (
        <div className="mb-2 flex h-3 w-full overflow-hidden rounded-full border-2 border-[var(--rule-base)]">
          {filas.list.map((f) => (
            <div key={f.z.id} style={{ width: `${f.pct}%`, background: f.meta.ring }} title={`${f.z.codigo} · ${f.pct.toFixed(0)}%`} />
          ))}
        </div>
      )}

      <ul className="space-y-1">
        {filas.list.map((f) => (
          <li key={f.z.id}>
            <button
              type="button"
              onClick={() => onIrAZona(f.z.id)}
              title={`Ir a ${f.z.codigo} en el mapa`}
              className="flex w-full items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5 text-left transition hover:bg-[var(--surface-canvas)]"
            >
              <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: f.meta.ring }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <b className="truncate text-xs font-bold text-[var(--text-primary)]">{f.z.codigo}</b>
                  <span className="truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{f.z.nombre || f.meta.label}</span>
                </span>
                <span className="block truncate text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
                  {f.dentro || <span className="font-medium text-[var(--text-tertiary)]">sin madera ubicada</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)]">
                  {f.area > 0 ? fmtArea(f.area) : "—"}
                </span>
                {f.area > 0 && (
                  <span className="block font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{f.pct.toFixed(0)}%</span>
                )}
              </span>
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            </button>
            {/* La cancha apartada emite su guía desde acá: la madera ya tiene
                dueño, no hace falta volver a elegirla en una lista de cien. */}
            {f.puedeDespachar && (
              <button
                type="button"
                onClick={() => onDespachar(f.z.id)}
                className="mt-0.5 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] text-[length:var(--ts-2xs)] font-bold text-white hover:bg-[var(--accent-600)]"
              >
                <Truck className="h-3.5 w-3.5" /> Nuevo despacho con lo apartado acá
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        El % es sobre el área dibujada, no sobre el terreno real · tocá una zona en el mapa para su ficha.
      </p>
    </div>
  );
}
