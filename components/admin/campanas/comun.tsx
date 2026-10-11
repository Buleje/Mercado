"use client";

/**
 * Piezas comunes de las vistas de Crecimiento que no son campañas (Tarjetas de
 * regalo, Socio Buleje, Bodega al Mes, En Vivo): la cabecera en una fila, la
 * tarjeta de un indicador, el buscador de 48 px, la frase del estado vacío y
 * el CSV. Antes cada vista tenía su copia (cabecera de dos filas, 4 tarjetas
 * siempre abiertas, botones de 40 px y texto de 12 px).
 */
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip, type InfoTipProps } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import CampoBuscar from "@/components/ui-system/CampoBuscar";

/** Una fila: título + ⓘ · (secciones) · … · indicadores + acción principal + «⋯». */
export function CabeceraVista({
  titulo,
  ayuda,
  secciones,
  indicadores,
  principal,
  menu,
  tituloMenu,
}: {
  titulo: string;
  ayuda: Omit<InfoTipProps, "children">;
  secciones?: ReactNode;
  indicadores?: ReactNode;
  principal?: ReactNode;
  menu?: MenuAccion[];
  tituloMenu?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">{titulo}</SectionTitle>
        <InfoTip {...ayuda} />
      </div>
      {secciones && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">{secciones}</div>}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {indicadores}
        {principal}
        {menu && menu.length > 0 && (
          <ActionMenu label="Más" icon={MoreHorizontal} actions={menu} soloIcono size="md" className="w-12 shrink-0" title={tituloMenu ?? "Más acciones"} />
        )}
      </div>
    </div>
  );
}

export interface DatoIndicador {
  rotulo: string;
  valor: string;
  detalle?: string;
  /** `aviso` pinta el valor en ámbar de texto: algo que mirar, no un adorno. */
  tono?: "aviso";
}

export function tarjetasDe(datos: DatoIndicador[]): ReactNode[] {
  return datos.map((t) => (
    <div key={t.rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <span className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">{t.rotulo}</span>
      <p className={cn("text-lg font-extrabold tabular-nums", t.tono === "aviso" ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{t.valor}</p>
      {t.detalle && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{t.detalle}</p>}
    </div>
  ));
}

/** Buscador de 48 px; los demás controles de la fila van como hijos. */
export function FilaFiltros({
  valor,
  onCambio,
  placeholder,
  etiqueta,
  children,
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
  etiqueta: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CampoBuscar valor={valor} onCambiar={onCambio} placeholder={placeholder} etiqueta={etiqueta} className="min-w-[12rem]" />
      {children}
    </div>
  );
}

export const CLASE_SELECT =
  "h-12 cursor-pointer rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

/** Estado vacío de una frase, sin ícono gigante. */
export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center">
      <p className="text-sm text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

/** CSV con comillas: un nombre con coma («Pérez, Juan») ya no corre las columnas. */
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [encabezados, ...filas].map((f) => f.map(celda).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Cabecera de tabla del panel: 14 px, sin mayúsculas forzadas. */
export const TH = "px-4 py-3 text-left text-sm font-bold text-[var(--text-secondary)]";

/** Clase de la tabla: la cabecera a 14 px sin mayúsculas (el CSS global del panel la baja a 12). */
export const CLASE_TABLA = "w-full text-sm [&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal";
