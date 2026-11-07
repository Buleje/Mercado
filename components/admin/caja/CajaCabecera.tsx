"use client";

/**
 * Cabecera de la pestaña Caja en UNA fila: el título de la pestaña (con la ⓘ
 * de la sección a la vista), el estado de la caja, la barra de secciones y,
 * a la derecha, lo que la sección suma (los indicadores de los cuadres), la
 * acción principal («Abrir caja» con la caja cerrada) y «Más» con lo que no es
 * de uso constante (arqueos, imprimir, exportar, WhatsApp, tolerancia…).
 *
 * En Historial › Por caja el «Indicadores» y las acciones los arma el módulo
 * de cuadres (CashAuditTab, montado tal cual) y llegan por `extra` y
 * `acciones`: siguen en ESTA fila, con un solo «Más».
 */
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CajaSecciones } from "./CajaSecciones";
import { SECCIONES, grupoDe, seccionDe } from "./secciones";
import type { VistaCaja } from "./tipos";

interface Props {
  vista: VistaCaja;
  onVista: (v: VistaCaja) => void;
  /** Con la caja cerrada «Hoy» va como una sola pestaña. */
  hoyConSecciones: boolean;
  /** Título del grupo «Hoy» cuando la caja viene de otro día («Caja en curso»). */
  titulo?: string;
  /** Chip de la caja (abierta o cerrada). Sólo en «Hoy»: en el historial no dice nada nuevo. */
  estado?: ReactNode;
  acciones: MenuAccion[];
  /** Controles propios de la sección, antes de «Más» (los indicadores de los cuadres). */
  extra?: ReactNode;
  /** La acción principal de la pestaña («Abrir caja»). */
  principal?: ReactNode;
  /**
   * Con la caja abierta «Más» va en la fila de las acciones de la caja (ingreso,
   * retiro, cerrar): en ésta no entraba con las cuatro secciones y quedaba solo
   * en un renglón (medido a 1280 px).
   */
  sinMas?: boolean;
}

/**
 * «Más» de Caja: arqueos, imprimir, exportar, WhatsApp, tolerancia, refrescar.
 * `cuadrado` = sólo los tres puntos, de 48 px: en la fila de la caja abierta
 * (Indicadores + Ingreso + Retiro + Adelanto + Cerrar) el «Más» con texto caía
 * solo a un segundo renglón a 1280 px (medido 17-10: faltaban 49 px).
 */
export function MenuMasCaja({ acciones, cuadrado = false }: { acciones: MenuAccion[]; cuadrado?: boolean }) {
  return (
    <ActionMenu
      label="Más"
      icon={MoreHorizontal}
      actions={acciones}
      size="md"
      compactoEnMovil
      soloIcono={cuadrado}
      className={cuadrado ? "w-12!" : ""}
      title="Más: arqueos, imprimir, exportar y ajustes"
    />
  );
}

export function CajaCabecera({ vista, onVista, hoyConSecciones, titulo, estado, acciones, extra, principal, sinMas }: Props) {
  const grupo = grupoDe(vista);
  /* Con la caja cerrada «Hoy» es una sola pantalla: la ⓘ es la del Resumen. */
  const { ayuda } = seccionDe(grupo === "hoy" && !hoyConSecciones ? "hoy" : vista);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">{(grupo === "hoy" && titulo) || SECCIONES[grupo].titulo}</SectionTitle>
        <InfoTip what={ayuda.what} affects={ayuda.affects} example={ayuda.example} />
        {grupo === "hoy" && estado}
      </div>
      {/* En el celular la barra baja a su propia fila (con desplazamiento) y lo de la derecha se queda arriba. */}
      <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
        <CajaSecciones vista={vista} onVista={onVista} hoyConSecciones={hoyConSecciones} />
      </div>
      {(extra || principal || !sinMas) && (
        <div className="ml-auto flex items-center gap-2">
          {extra}
          {principal}
          {!sinMas && <MenuMasCaja acciones={acciones} />}
        </div>
      )}
    </div>
  );
}
