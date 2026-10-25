"use client";

/**
 * ZonasTabla — las zonas del negocio en una tabla (ADR-497): nombre, tipo,
 * área con su unidad, uso y responsable, con el área total por unidad debajo
 * (m² y ha por separado: no se mezclan). Borrar se deshace.
 */
import { useState } from "react";
import { DataTable, undoToast } from "@buleje/design-system";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId, useSeccionPlan } from "@/hooks/use-plan-empresa";
import { cn } from "@/lib/utils";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { MAX_ZONAS, NOMBRE_TIPO, formatoArea, totalesArea, zonaNueva, type Zona } from "./espacios-config";
import { ZonaModal } from "./ZonaModal";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";

/** Hasta 100 zonas, todas en el cliente. El área no lleva filtro: mezcla m² y ha. */
const COLUMNAS: readonly ColumnaFiltro<Zona>[] = [
  { id: "zona", label: "Zona", tipo: "texto", valor: (z) => [z.nombre, z.nota ?? ""] },
  { id: "tipo", label: "Tipo", tipo: "multi", valor: (z) => NOMBRE_TIPO[z.tipo], soloConVarios: true },
  { id: "uso", label: "Uso", tipo: "texto", valor: (z) => z.uso ?? "" },
  { id: "responsable", label: "Responsable", tipo: "multi", valor: (z) => z.responsable || "", soloConVarios: true },
];

const ORDEN: Record<string, AccesorOrden<Zona>> = {
  zona: { valor: (z) => z.nombre, texto: true },
  tipo: { valor: (z) => NOMBRE_TIPO[z.tipo], texto: true },
  uso: { valor: (z) => z.uso, texto: true },
  responsable: { valor: (z) => z.responsable, texto: true },
};

const ROTULO = "text-sm font-semibold text-[var(--text-secondary)]";
const VACIO = <span className="text-[var(--text-tertiary)]">—</span>;

export function ZonasTabla() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("espacios");
  const { zonas } = datos;
  const [editando, setEditando] = useState<{ inicial: Zona; esNueva: boolean } | null>(null);
  const f = useFiltrosTabla(zonas, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  /* El área total suma lo que se ve (con filtros), por unidad. */
  const { totales, sinArea } = totalesArea(f.filtradas);
  const lleno = zonas.length >= MAX_ZONAS;
  const nueva = () => setEditando({ inicial: zonaNueva(nuevoId()), esNueva: true });

  const guardar = (z: Zona) =>
    cambiar((prev) => ({ ...prev, zonas: prev.zonas.some((x) => x.id === z.id) ? prev.zonas.map((x) => (x.id === z.id ? z : x)) : [...prev.zonas, z] }));

  const borrar = (z: Zona) => {
    const indice = zonas.findIndex((x) => x.id === z.id);
    cambiar((prev) => ({ ...prev, zonas: prev.zonas.filter((x) => x.id !== z.id) }));
    undoToast({
      message: `Borraste la zona ${z.nombre}`,
      onUndo: () =>
        cambiar((prev) => {
          if (prev.zonas.some((x) => x.id === z.id)) return prev;
          const lista = [...prev.zonas];
          lista.splice(Math.min(indice, lista.length), 0, z);
          return { ...prev, zonas: lista };
        }),
    });
  };

  return (
    <section className="space-y-3" aria-label="Zonas">
      <div className="flex flex-wrap items-center gap-2">
        <span className={ROTULO}>Zonas</span>
        <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{zonas.length}</span>
        <InfoTip
          title="Zonas"
          what="Cada parte del negocio con su tamaño y quién la cuida: el salón, el almacén, el patio, una parcela."
          affects="El área se suma por unidad: lo anotado en m² y en hectáreas sale en dos totales."
          example="Salón · Local · 80 m² · atención y caja · Rosa."
        />
        {puedeEditar && zonas.length > 0 && (
          <button type="button" className={cn(button({ variant: "secondary" }), "ml-auto")} onClick={nueva} disabled={lleno} title={lleno ? `Hasta ${MAX_ZONAS} zonas` : undefined}>
            <Plus className="size-4" aria-hidden />
            Nueva zona
          </button>
        )}
      </div>

      {zonas.length === 0 ? (
        <EstadoVacio frase="Sin zonas: anota el salón, el almacén o la parcela con su tamaño.">
          {puedeEditar && (
            <button type="button" className={button({ variant: "primary" })} onClick={nueva}>
              <Plus className="size-4" aria-hidden />
              Nueva zona
            </button>
          )}
        </EstadoVacio>
      ) : (
        <>
          <BarraFiltrosTabla f={f} />
          <DataTable aria-label="Zonas">
            <thead>
              <tr>
                <ThColumna label="Zona" ids={["zona"]} f={f} orden={ord} ordenId="zona" />
                <ThColumna label="Tipo" ids={["tipo"]} f={f} orden={ord} ordenId="tipo" />
                <th className="text-right" data-label="Área">Área</th>
                <ThColumna label="Uso" ids={["uso"]} f={f} orden={ord} ordenId="uso" />
                <ThColumna label="Responsable" ids={["responsable"]} f={f} orden={ord} ordenId="responsable" />
                {puedeEditar && (
                  <th className="w-12">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
              {filas.map((z) => {
                const acciones: MenuAccion[] = [
                  { id: "editar", label: "Editar", icon: Pencil, onSelect: () => setEditando({ inicial: z, esNueva: false }) },
                  { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: () => borrar(z) },
                ];
                return (
                  <tr key={z.id}>
                    <td className="font-medium">
                      {z.nombre}
                      {z.nota && <span className="block text-xs font-normal text-[var(--text-tertiary)]">{z.nota}</span>}
                    </td>
                    <td>{NOMBRE_TIPO[z.tipo]}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{z.area == null ? VACIO : formatoArea(z.area, z.unidad)}</td>
                    <td>{z.uso || VACIO}</td>
                    <td>{z.responsable || VACIO}</td>
                    {puedeEditar && (
                      <td className="text-right">
                        <div className="inline-block shrink-0">
                          <ActionMenu label={`Opciones de ${z.nombre}`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]" aria-live="polite">
            <span className="font-semibold text-[var(--text-primary)]">{f.activos > 0 ? "Área total de lo que se ve" : "Área total"}</span>
            {totales.length === 0 ? (
              <span className="text-[var(--text-tertiary)]">sin áreas anotadas</span>
            ) : (
              totales.map((t) => (
                <span key={t.unidad}>
                  <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatoArea(t.total, t.unidad)}</span> en {t.zonas}{" "}
                  {t.zonas === 1 ? "zona" : "zonas"}
                </span>
              ))
            )}
            {sinArea > 0 && totales.length > 0 && (
              <span className="text-[var(--text-tertiary)]">
                {sinArea} sin área
              </span>
            )}
          </p>
        </>
      )}

      {editando && (
        <ZonaModal key={editando.inicial.id} abierto inicial={editando.inicial} esNueva={editando.esNueva} onCerrar={() => setEditando(null)} onGuardar={guardar} />
      )}
    </section>
  );
}
