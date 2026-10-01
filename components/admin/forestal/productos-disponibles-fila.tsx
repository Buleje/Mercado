"use client";

/**
 * Una fila de «Paquete por paquete»: el paquete (o la corrida sin paquete) con
 * sus pastillas —importado, de tercero, apartado, usado— y lo que se puede
 * hacer con esa madera, en la fila donde se la mira (ADR-367).
 *
 * A la vista, lo de uso constante: cubicar y apartar. El resto va en «Más»
 * (ley de Brandon, regla 4): ficha, editar, escuadría, reprocesar y marcar como
 * usado / desmarcar. Nada se sacó: antes eran seis botones por fila.
 */

import {
  BookmarkPlus,
  CheckCircle2,
  Download,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  RefreshCw,
  RotateCcw,
  Ruler,
  Users,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { fmtEdad, type TramoEdad } from "@/lib/forestal/edad-del-patio";
import { esInventarioDeApertura } from "@/lib/forestal/lotes-aserrio";
import { ptDe, type FilaProducto } from "@/lib/forestal/productos-disponibles-resumen";
import { IconAction, productLabel } from "./ctp-shared";
import { CeldaApartado } from "./ctp-celda-apartado";
import { CeldaEscuadria } from "./ctp-celda-escuadria";
import type { ColumnasVisibles } from "./productos-disponibles-columnas";
import type { AccionesProductos } from "./productos-disponibles-acciones";

const nf = (n: number) => formatNumber(n);
const fmtDia = (iso: string) => formatDate(iso, { soloFecha: true });
/** En la tarjeta del celular (< 640 px) se saca lo secundario; en pantalla ancha sigue todo.
 *  `!`: las tarjetas móviles ponen `display:flex` a cada celda sin capa. */
const SOLO_ANCHO = "max-sm:hidden!";
/** «Acciones» queda a la vista aunque la tabla se corra a lo ancho (a 1280 mide 1 424 px en
 *  una caja de 960: el menú «Más» quedaba fuera, medido 27-09). En el celular es tarjeta. */
export const ACCIONES_FIJAS = "sm:sticky sm:right-0 sm:z-[1] sm:border-l sm:border-[var(--rule-soft)]";
const PASTILLA =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold";

/** El color de la pastilla de edad, por tramo (clases enteras: Tailwind lee texto). */
const EDAD_TONO: Record<TramoEdad, string> = {
  fresco: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  maduro: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  viejo: "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

export interface FilaPaqueteProps {
  f: FilaProducto;
  cols: ColumnasVisibles;
  ordenCols: readonly string[];
  tildada: boolean;
  ahora: Date | null;
  a: AccionesProductos;
  desmarcando: string | null;
  onDesmarcar: (f: FilaProducto) => void;
}

export function FilaPaquete({ f, cols, ordenCols, tildada, ahora, a, desmarcando, onDesmarcar }: FilaPaqueteProps) {
  const { corrida: c, paquete: p, dias, tramo, valorSoles, apartado } = f;
  const etiqueta = p?.codigo ?? `Corrida N° ${c.lineNo ?? "—"}`;
  const mas: MenuAccion[] = [
    ...(p?.codigo
      ? [{ id: "ficha", label: "Ver la ficha", hint: "De qué corrida y de qué madera salió", icon: PackageOpen, onSelect: () => a.setFicha(p.codigo) }]
      : []),
    { id: "editar", label: "Editar los datos", hint: "Especie, producto, cantidad, volumen", icon: Pencil, onSelect: () => a.abrirEditar(c) },
    ...(p ? [{ id: "escuadria", label: "Cargar escuadría", hint: "Espesor, ancho y largo del paquete", icon: Ruler, onSelect: () => a.abrirEscuadria(c, p) }] : []),
    {
      id: "reprocesar",
      label: "Reprocesar",
      hint: c.disponible > 0 ? "Vuelve a la sierra y sale como otro producto" : "Sin saldo para reprocesar",
      icon: RefreshCw,
      disabled: c.disponible <= 0,
      onSelect: () => a.setReprocesar(c),
    },
    c.usadoAt
      ? {
          id: "desmarcar",
          label: "Desmarcar",
          hint: "Vuelve a Productos disponibles",
          icon: RotateCcw,
          busy: desmarcando === c.id,
          disabled: desmarcando != null,
          onSelect: () => onDesmarcar(f),
        }
      : {
          id: "usado",
          label: "Marcar como usado",
          hint: "Sale sin despacharse ni reprocesarse",
          icon: CheckCircle2,
          onSelect: () => a.setMarcarUsado(c),
        },
  ];

  return (
    <tr className={tildada ? "bg-primary/5" : "hover:bg-[var(--surface-sunken)]"}>
      <td className="px-2! py-2">
        <input
          type="checkbox"
          aria-label={`Elegir ${p?.codigo ?? `la corrida N° ${c.lineNo ?? "—"}`}`}
          className="h-5 w-5 accent-[var(--accent)]"
          checked={tildada}
          onChange={(ev) => a.alternarFilas([f.clave], ev.target.checked)}
        />
      </td>
      <EnOrden
        orden={ordenCols}
        celdas={{
          codigo: (
            <td className="px-2! py-2 font-mono font-bold text-[var(--text-primary)]">
              {p?.codigo ? (
                <button
                  type="button"
                  onClick={() => a.setFicha(p.codigo)}
                  title={`Ver de qué corrida y de qué madera salió ${p.codigo}`}
                  className="rounded-xl underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--accent)]"
                >
                  {p.codigo}
                </button>
              ) : (
                <span className="font-sans text-[var(--text-tertiary)]">sin paquete</span>
              )}
            </td>
          ),
          producto: (
            <td className="px-2! py-2 text-[var(--text-secondary)]">
              <div className="flex flex-wrap items-center gap-1">
                {productLabel(f.producto)}
                {esInventarioDeApertura(c.observations) && (
                  <span title="Existencia de apertura: entró por el importador del libro" className={`${PASTILLA} bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`}>
                    <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
                  </span>
                )}
                {/* Madera de tercero (ADR-412): lo que se asierra por encargo NO es del centro. */}
                {c.duenoMadera === "tercero" && (
                  <span
                    title={c.titularNombre ? `La madera es de ${c.titularNombre} — el centro la asierra por encargo` : "Madera de un tercero: el centro la asierra por encargo"}
                    className={`${PASTILLA} bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`}
                  >
                    <Users className="h-3 w-3 shrink-0" aria-hidden />
                    {c.titularNombre ?? "De tercero"}
                  </span>
                )}
                {apartado && (
                  <CeldaApartado apartado={apartado} ahora={ahora ?? undefined} onAbrir={() => a.abrirApartar([f], apartado)} />
                )}
                {c.usadoAt && (
                  <span
                    title={c.usadoMotivo ? `Marcado como usado: ${c.usadoMotivo}` : "Marcado como usado"}
                    className={`${PASTILLA} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}
                  >
                    <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden /> Usado
                  </span>
                )}
              </div>
            </td>
          ),
          especie: <td className="px-2! py-2 text-[var(--text-secondary)]">{c.especie ?? "—"}</td>,
          presentacion: cols.presentacion && (
            <td className={`px-2! py-2 text-[var(--text-tertiary)] ${SOLO_ANCHO}`}>{p?.presentacion ?? c.presentacion ?? "—"}</td>
          ),
          medidas: cols.medidas && (
            <td className="px-2! py-2 font-mono text-xs text-[var(--text-secondary)]">
              <CeldaEscuadria paquete={p} onEditar={() => p && a.abrirEscuadria(c, p)} />
            </td>
          ),
          piezas: (
            <td className="px-2! py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
              {p ? nf(p.cantidad) : "—"}
            </td>
          ),
          volumen: (
            <td className="px-2! py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
              {fmtM3(f.volumenM3)}
            </td>
          ),
          pieTablar: cols.pieTablar && (
            <td className="px-2! py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{nf(ptDe(f.volumenM3))}</td>
          ),
          valor: cols.valor && (
            <td className="px-2! py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
              {valorSoles == null ? (
                /* Un guion, nunca S/ 0: el costo de la guía todavía no se cargó. */
                <span title="No se puede valorizar: falta el costo de la guía que trajo esta madera" className="text-[var(--text-tertiary)]">
                  —
                </span>
              ) : (
                formatCurrency(valorSoles)
              )}
            </td>
          ),
          lote: cols.lote && (
            <td className={`px-2! py-2 text-xs text-[var(--text-tertiary)] ${SOLO_ANCHO}`}>
              <span className="font-mono">N° {c.lineNo ?? "—"}</span>
              {/* El lote es texto libre y a veces largo: en una línea, entero en el title.
                  Envuelto estiraba CADA fila a 165 px (medido 27-09). */}
              {c.lote && (
                <span title={c.lote} className="block max-w-[10rem] truncate font-mono">
                  {c.lote}
                </span>
              )}
              <div>{fmtDia(c.fecha)}</div>
            </td>
          ),
          edad: cols.edad && (
            <td className="px-2! py-2 text-right">
              {dias == null ? (
                <span className="text-[var(--text-tertiary)]">—</span>
              ) : (
                <span
                  title={`Aserrado el ${fmtDia(c.fecha)}`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums ${EDAD_TONO[tramo ?? "fresco"]}`}
                >
                  {fmtEdad(dias)}
                </span>
              )}
            </td>
          ),
          saldo: (
            <td className={`px-2! py-2 text-right ${SOLO_ANCHO}`}>
              <span className="font-mono font-bold tabular-nums text-[var(--data-success-ink)]">{fmtM3(c.disponible)}</span>
              {c.despachado > 0 && (
                <div className="font-mono text-xs text-[var(--text-tertiary)]">
                  de {fmtM3(c.producido)} · salió {fmtM3(c.despachado)}
                </div>
              )}
            </td>
          ),
          permiso: cols.permiso && (
            <td className="px-2! py-2 font-mono text-xs text-[var(--text-secondary)]">
              {c.titularOrigen?.length ? c.titularOrigen.join(" · ") : "—"}
            </td>
          ),
        }}
      />
      <td className={`px-2! py-2 ${ACCIONES_FIJAS} bg-[var(--surface-raised)]`}>
        <div className="flex items-center justify-end gap-1">
          <IconAction
            icon={Ruler}
            tone="info"
            onClick={() => a.setCubicar(f)}
            label={`Cubicar ${etiqueta}: medir pieza por pieza y cuadrar (sale el ANEXO N° 04)`}
          />
          {!apartado && a.puedeApartar && (
            <IconAction
              icon={BookmarkPlus}
              tone="info"
              onClick={() => a.abrirApartar([f], null)}
              label={`Apartar ${etiqueta} para un cliente hasta que salga la guía`}
            />
          )}
          <ActionMenu label="Más" title={`Más acciones de ${etiqueta}`} icon={MoreHorizontal} size="xs" actions={mas} soloIcono />
        </div>
      </td>
    </tr>
  );
}

