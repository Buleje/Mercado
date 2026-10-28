"use client";

import { useMemo } from "react";
import { BadgeStatus, DataTable, ErrorAlert, LoadingState } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { useUsoDelPanel } from "@/hooks/use-uso-del-panel";
import { estadoDePestana } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import { cuandoFue, diaConFecha, filasDeUso, type FilaUsoPanel } from "@/lib/admin/uso-del-panel-filas";

const ETIQUETA_DE_TAB = new Map<string, string>(ALL_TABS.map((t) => [t.id, t.label]));
const etiquetaDeTab = (tab: string) => ETIQUETA_DE_TAB.get(tab) ?? tab;
/* Una vista sin rótulo en el catálogo («general») sale con mayúscula, no en crudo. */
const etiquetaDeVista = (tab: string, vista: string) =>
  vistasDelModulo(tab).find((v) => v.key === vista)?.label ?? vista.charAt(0).toUpperCase() + vista.slice(1);

const ORDEN: Record<string, AccesorOrden<FilaUsoPanel>> = {
  pestana: { valor: (f) => f.etiqueta, texto: true },
  categoria: { valor: (f) => f.categoria, texto: true },
  d7: { valor: (f) => f.d7 },
  d30: { valor: (f) => f.d30 },
  ultima: { valor: (f) => f.ultima },
};

/**
 * Configuración › Mi panel › «Uso del panel» (sólo admin y dueño): cuántas
 * veces se abrió cada pestaña de la barra en 7 y 30 días, sumando a todo el
 * negocio, y la última vez. Las de 0 quedan marcadas al final. Mirar no cambia
 * nada: la barra sólo usa estas cifras para ordenar lo de tu rubro.
 */
export function UsoDelPanel() {
  const { datos, cargando, error, reintentar } = useUsoDelPanel();
  const ctx = useContextoPermiso();
  const ord = useOrdenColumna(ORDEN);

  const filas = useMemo(() => {
    if (!datos || !ctx) return [];
    return filasDeUso(TAB_CATEGORIES, datos.claves, etiquetaDeTab, etiquetaDeVista, (tab) => estadoDePestana(ctx, tab) === "visible");
  }, [datos, ctx]);

  if (error) {
    return (
      <ErrorAlert
        title="No se pudo leer el uso del panel"
        description={error}
        action={<button type="button" onClick={reintentar} className={button({ variant: "secondary" })}>Reintentar</button>}
      />
    );
  }
  if (cargando || !datos || !ctx) return <LoadingState message="Contando aperturas…" />;

  const sinAbrir = filas.filter((f) => f.d30 === 0).length;
  const ahora = Date.now();
  return (
    <div className="space-y-3" data-uso-panel-filas={filas.length}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
        <span>
          <strong className="font-semibold text-[var(--text-primary)]" data-uso-panel-sin-abrir={sinAbrir}>{sinAbrir}</strong> de {filas.length} pestañas sin abrir en 30 días
          {datos.desde && <> · contando desde el {diaConFecha(datos.desde)}</>}
        </span>
        <InfoTip
          title="Cómo se cuenta"
          what="Cada pestaña del panel suma 1 la primera vez que alguien del negocio la abre en una pestaña del navegador. Recargar no suma; cerrar el navegador y volver a entrar, sí. Se guardan los últimos 35 días."
          affects="Lo de tu rubro (forestal, agricultura) va arriba en la barra y, adentro, primero lo que más abre tu negocio. Si ordenaste la barra a mano, manda tu orden. Nada se esconde solo."
          example="Cámaras con 12 en 7 días = la abrieron en 12 sesiones esta semana, entre todas las personas del equipo."
        />
      </p>
      <DataTable stickyHeader wrapperClassName="max-h-[32rem] overflow-y-auto">
        <thead>
          <tr>
            <ThColumna label="Pestaña" orden={ord} ordenId="pestana" />
            <ThColumna label="Categoría" orden={ord} ordenId="categoria" className="hidden sm:table-cell" />
            <ThColumna label="7 días" derecha orden={ord} ordenId="d7" className="whitespace-nowrap" />
            <ThColumna label="30 días" derecha orden={ord} ordenId="d30" className="whitespace-nowrap" />
            <ThColumna label="Última vez" orden={ord} ordenId="ultima" className="whitespace-nowrap" />
            <th className="hidden md:table-cell">Vista más abierta</th>
          </tr>
        </thead>
        <tbody>
          {ord.ordenar(filas).map((f) => (
            <tr key={f.tab} data-uso-tab={f.tab} data-uso-d30={f.d30}>
              <td className="font-semibold">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {f.etiqueta}
                  {f.d30 === 0 && <BadgeStatus variant="neutral" label="Sin abrir" size="sm" />}
                </span>
              </td>
              <td className="hidden text-[var(--text-secondary)] sm:table-cell">{f.categoria}</td>
              <td className="text-right tabular-nums">{f.d7}</td>
              <td className="text-right font-semibold tabular-nums">{f.d30}</td>
              <td className="whitespace-nowrap text-[var(--text-secondary)]">{f.ultima ? cuandoFue(f.ultima, ahora) : "—"}</td>
              <td className="hidden text-[var(--text-secondary)] md:table-cell">{f.vista ? `${f.vista.etiqueta} (${f.vista.d30})` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
