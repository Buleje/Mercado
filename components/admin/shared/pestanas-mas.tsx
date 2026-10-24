"use client";

/**
 * Las piezas del «Más ▾» de las barras de pestañas (priority+, Brandon 19-10
 * «Más espacio arriba»): el menú con las que no entraron, el contenido de
 * una pestaña (el mismo en la pestaña de verdad y en su copia medida) y el
 * medidor escondido. Las usan `AdminTabBar` y `BarraDeSecciones`.
 */
import type { ReactNode, Ref } from "react";
import { ChevronRight, GripVertical, LayoutList, RotateCcw, TrendingUp } from "@buleje/design-system/icons";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import ActionMenu, { type MenuAccion } from "./action-menu";
import type { ModoOrden } from "@/hooks/use-uso-de-pestanas";

export interface PestanaDelMas {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: LucideIcon;
  badge?: number | string;
  disabled?: boolean;
}

/**
 * Un texto de la pestaña. En la copia que se mide va como `content` de CSS:
 * ocupa lo mismo pero no es texto del documento, así un `getByText` (o el
 * buscador del navegador) no encuentra la pestaña dos veces.
 */
export function Texto({ texto, copia }: { texto: string; copia: boolean }) {
  return copia ? <span data-texto={texto} className="before:content-[attr(data-texto)]" /> : <span>{texto}</span>;
}

/** Ícono, rótulo y contador de una pestaña: idéntico en la de verdad y en la copia que se mide. */
export function ContenidoPestana({
  tab,
  conAsa = false,
  copia = false,
}: {
  tab: PestanaDelMas;
  conAsa?: boolean;
  copia?: boolean;
}) {
  const Icono = tab.icon;
  return (
    <>
      {/* El asa de arrastrar sólo en escritorio (en touch el arrastre no es un gesto usable). */}
      {conAsa && <GripVertical className="hidden h-3 w-3 shrink-0 opacity-30 lg:inline-block" />}
      {Icono && <Icono className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" />}
      <Texto texto={tab.shortLabel || tab.label} copia={copia} />
      {tab.badge != null && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-bold text-white">
          <Texto texto={String(tab.badge)} copia={copia} />
        </span>
      )}
    </>
  );
}

/** Lo que dice el «Más» si esconde contadores: la suma, o cuántas tienen uno si no son números. */
export function contadorDelMas(escondidas: readonly { badge?: number | string }[]): number {
  let suma = 0;
  let conAlgo = 0;
  for (const t of escondidas) {
    if (t.badge == null || t.badge === "" || t.badge === 0) continue;
    conAlgo += 1;
    const n = typeof t.badge === "number" ? t.badge : Number(t.badge);
    if (Number.isFinite(n)) suma += n;
  }
  return suma > 0 ? suma : conAlgo;
}

/**
 * Cómo se ve el «Más» en cada barra: como una pestaña más, no como un botón
 * aparte. `fase` = la caja hundida de la banda con título (h-9);
 * `linea` = la barra subrayada; `seccion` = BarraDeSecciones (48 px).
 */
export const CLASE_MAS = {
  fase: "h-9! gap-1! rounded-lg! border-0! bg-transparent! px-2.5! text-[var(--text-tertiary)]! hover:text-[var(--text-primary)]! aria-expanded:bg-[var(--surface-raised)]! [&>svg:first-child]:hidden",
  linea:
    "h-auto! gap-1.5! self-stretch rounded-none! border-0! border-b-[3px]! border-transparent! bg-transparent! px-3! py-2.5! text-[var(--text-secondary)]! hover:text-[var(--text-primary)]! [&>svg:first-child]:hidden",
  seccion:
    "h-12! gap-1.5! rounded-xl! border-0! bg-transparent! px-3.5! font-semibold! text-[var(--text-secondary)]! hover:text-[var(--text-primary)]! aria-expanded:bg-[var(--surface-raised)]! [&>svg:first-child]:hidden",
} as const;
export type EstiloMas = keyof typeof CLASE_MAS;

interface PestanasMasProps {
  estilo: EstiloMas;
  escondidas: readonly PestanaDelMas[];
  onElegir: (id: string) => void;
  /** «Orden de siempre / Ordenar por mi uso»: sólo en la barra del módulo. */
  orden?: { modo: ModoOrden; onModo: (modo: ModoOrden) => void; diasQueFaltan: number } | null;
  /** Hay un orden arrastrado a mano: se ofrece volver al de fábrica. */
  restablecer?: (() => void) | null;
  /** El número del «Más» en rojo (contadores de alerta) o no se muestra. */
  conContador?: boolean;
}

export function PestanasMas({ estilo, escondidas, onElegir, orden, restablecer, conContador = true }: PestanasMasProps) {
  const conOrden = Boolean(orden) || Boolean(restablecer);
  const acciones: MenuAccion[] = escondidas.map((t) => ({
    id: `pestana-${t.id}`,
    label: t.label,
    icon: t.icon ?? ChevronRight,
    meta: t.badge != null && t.badge !== "" ? String(t.badge) : undefined,
    disabled: t.disabled,
    seccion: conOrden ? "Más pestañas" : undefined,
    onSelect: () => onElegir(t.id),
  }));
  if (orden) {
    acciones.push(
      {
        id: "orden-siempre",
        label: "Orden de siempre",
        hint: "Las pestañas como vienen",
        icon: LayoutList,
        activo: orden.modo === "siempre",
        seccion: "Orden",
        onSelect: () => orden.onModo("siempre"),
      },
      {
        id: "orden-uso",
        label: "Ordenar por mi uso",
        hint:
          orden.diasQueFaltan > 0
            ? `Empieza con una semana de uso: faltan ${orden.diasQueFaltan} día${orden.diasQueFaltan === 1 ? "" : "s"}`
            : "Primero las que más abres; las que no abres hace un mes, acá",
        icon: TrendingUp,
        activo: orden.modo === "uso",
        seccion: "Orden",
        onSelect: () => orden.onModo("uso"),
      },
    );
  }
  if (restablecer) {
    acciones.push({
      id: "restablecer-orden",
      label: "Restablecer orden",
      hint: "Quita lo que moviste arrastrando",
      icon: RotateCcw,
      seccion: "Orden",
      onSelect: restablecer,
    });
  }
  const contador = conContador ? contadorDelMas(escondidas) : 0;
  return (
    <ActionMenu
      label="Más"
      size={estilo === "seccion" ? "md" : "sm"}
      actions={acciones}
      badge={contador || undefined}
      tonoBadge="alerta"
      title={escondidas.length > 0 ? `${escondidas.length} pestaña${escondidas.length === 1 ? "" : "s"} más` : "Orden de las pestañas"}
      className={CLASE_MAS[estilo]}
    />
  );
}

/**
 * Copias escondidas de las pestañas y del «Más» para saber cuánto mide cada
 * una sin depender de cuáles se ven. `fuera` = caja propia (absoluta, alto 0);
 * si no, va en el flujo para que su ancho natural sostenga el de la barra.
 */
export function MedidorDePestanas({
  medidorRef,
  tabs,
  claseTab,
  claseFila,
  estiloMas,
  conAsa = false,
  conContador = false,
  fuera = true,
  copia,
}: {
  medidorRef: Ref<HTMLDivElement>;
  tabs: readonly PestanaDelMas[];
  claseTab: string;
  claseFila: string;
  estiloMas: EstiloMas;
  conAsa?: boolean;
  conContador?: boolean;
  fuera?: boolean;
  /** El contenido de cada copia si la barra no usa `ContenidoPestana` (textos con `<Texto copia>`). */
  copia?: (tab: PestanaDelMas) => ReactNode;
}) {
  return (
    <div
      aria-hidden
      inert
      className={cn("pointer-events-none invisible h-0 overflow-hidden", fuera && "absolute inset-x-0 top-0")}
    >
      <div ref={medidorRef} className={cn("flex w-max", claseFila)}>
        {tabs.map((t) => (
          <span key={t.id} data-medir-pestana={t.id} className={claseTab}>
            {copia ? copia(t) : <ContenidoPestana tab={t} conAsa={conAsa} copia />}
          </span>
        ))}
        <span data-medir-mas="" className="inline-flex shrink-0">
          {/* El real, con un contador de dos cifras si alguna pestaña lleva uno: mide lo peor. */}
          <ActionMenu label="Más" size={estiloMas === "seccion" ? "md" : "sm"} actions={[]} badge={conContador ? 99 : undefined} className={CLASE_MAS[estiloMas]} />
        </span>
      </div>
    </div>
  );
}
