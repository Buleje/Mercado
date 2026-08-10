"use client";

/**
 * CtpPlantaEspecies — qué madera hay parada en la planta, por especie.
 *
 * Los cuatro KPIs de arriba dicen cuánto hay en total; esto dice **de qué**, que
 * es lo que decide si un pedido se puede cumplir: 47 m³ de troza no sirven si
 * el pedido es de shihuahuaco y todo lo que hay es tornillo.
 *
 * Dos lecturas del mismo dato: la barra de composición (dónde está el volumen,
 * de un vistazo) y la tabla (el número exacto, por especie y por tipo).
 *
 * La regla que evita mentir es la misma del resumen: **cada unidad lleva su
 * propio total**. La barra se dibuja SÓLO con los m³, porque una barra que
 * mezcle metros cúbicos con pies tablares reparte un porcentaje inventado.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { Boxes, PackageCheck, TreePine } from "@buleje/design-system/icons";
import {
  fmtSubtotales,
  normalizarUnidad,
  resumirItems,
  type PorEspecie,
} from "@/lib/forestal/planta-resumen";
import type { Item, ItemKind } from "@/lib/forestal/planta-zona-types";

/** Paleta de series: tokens de dataviz, que siguen el tema (ADR-071). */
const SERIE = ["var(--data-5)", "var(--data-6)", "var(--data-8)", "var(--data-7)", "var(--data-2)", "var(--data-3)"];

const KIND_LABEL: Record<ItemKind, string> = {
  troza: "Troza",
  producto: "Aserrada",
  despacho: "Despacho",
};

const pct1 = (n: number) => (n >= 10 ? Math.round(n) : Number(n.toFixed(1)));

export default function CtpPlantaEspecies({ items, ubicados }: { items: Item[]; ubicados: number }) {
  const resumen = useMemo(() => resumirItems(items, (it) => it.especie ?? it.sub), [items]);

  /** Sólo lo que está en m³ entra a la barra: es la única unidad comparable. */
  const enM3 = useMemo(() => {
    const filas = resumen.porEspecie
      .map((e: PorEspecie) => ({ especie: e.especie, m3: e.subtotales.find((s) => s.unidad === "m³")?.cantidad ?? 0, lineas: e.lineas }))
      .filter((f) => f.m3 > 0);
    const total = filas.reduce((a, f) => a + f.m3, 0);
    return { filas, total };
  }, [resumen]);

  /** Lo que NO está en m³ se declara aparte en vez de desaparecer del gráfico. */
  const otrasUnidades = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const u = normalizarUnidad(it.unidad);
      if (u === "m³" || it.kind === "despacho") continue;
      m.set(u, (m.get(u) ?? 0) + (Number.isFinite(it.cantidad) ? it.cantidad : 0));
    }
    return [...m.entries()].map(([unidad, cantidad]) => ({ unidad, cantidad }));
  }, [items]);

  if (items.length === 0) return null;

  const porKind = new Map(resumen.porKind.map((k) => [k.kind, k]));

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <TreePine className="h-4 w-4 text-[var(--accent)]" /> Qué madera hay, por especie
        </CardTitle>
        <span className="text-xs font-bold text-[var(--text-tertiary)]">
          {ubicados} de {items.length} con lugar en el mapa
        </span>
      </div>

      {/* Las dos cifras que importan, en una fila: la troza que espera sierra y
          la aserrada que espera camión. */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        {(["troza", "producto"] as const).map((k) => {
          const d = porKind.get(k);
          return (
            <div key={k} className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)]">
                {k === "troza" ? <Boxes className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-base font-bold tabular-nums leading-none text-[var(--text-primary)]">
                  {d ? fmtSubtotales(d.subtotales) : "—"}
                </span>
                <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {KIND_LABEL[k]} · {d?.lineas ?? 0} líneas
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {enM3.filas.length > 0 ? (
        <>
          {/* Barra de composición: dónde está el volumen. */}
          <div className="flex h-5 w-full overflow-hidden rounded-lg border-2 border-[var(--rule-base)]">
            {enM3.filas.map((f, i) => (
              <div
                key={f.especie}
                style={{ width: `${(f.m3 / enM3.total) * 100}%`, background: SERIE[i % SERIE.length] }}
                title={`${f.especie} · ${f.m3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³ (${pct1((f.m3 / enM3.total) * 100)}%)`}
              />
            ))}
          </div>

          {/* La tabla: el número exacto por especie. */}
          <ul className="mt-2 space-y-0.5">
            {resumen.porEspecie.map((e, i) => {
              const m3 = e.subtotales.find((s) => s.unidad === "m³")?.cantidad ?? 0;
              const p = enM3.total > 0 ? (m3 / enM3.total) * 100 : 0;
              return (
                <li key={e.especie} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIE[i % SERIE.length] }} />
                    <span className="truncate font-bold text-[var(--text-primary)]">{e.especie}</span>
                    <span className="shrink-0 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· {e.lineas}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">{fmtSubtotales(e.subtotales)}</span>
                    {m3 > 0 && <span className="ml-1.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{pct1(p)}%</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
            % sobre <strong className="text-[var(--text-secondary)]">{enM3.total.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³</strong> · es la existencia <strong className="text-[var(--text-secondary)]">disponible en el libro</strong>, no el saldo del período de arriba
            {otrasUnidades.length > 0 && (
              <> · aparte hay {otrasUnidades.map((u) => `${u.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ${u.unidad}`).join(" y ")}, que no se suman a los m³ porque son otra unidad</>
            )}
            {resumen.cites && <> · <strong className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">hay especies CITES</strong></>}
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--text-tertiary)]">
          Nada de lo disponible está medido en m³ — el desglose por volumen no aplica.
        </p>
      )}
    </div>
  );
}
