"use client";

import { Loader2, Upload, X as XIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { nombrePlantilla, type PlantillasCompra } from "./use-plantillas-compra";

interface Props {
  plantillas: PlantillasCompra;
  hayItems: boolean;
  processing: boolean;
}

const CHIP = "flex items-center gap-1 bg-[var(--surface-sunken)] rounded-lg px-2 py-1";

/** Plantillas de pedido guardadas en el negocio (y las viejas de este navegador, para subirlas). */
export default function CompraPlantillas({ plantillas: pl, hayItems, processing }: Props) {
  const { plantillas, cargando, errorCarga, locales, guardando, saveAsTemplate, loadTemplate, deleteTemplate, subirLocal } = pl;
  return (
    <div className="border-t border-[var(--rule-soft)] pt-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1">
          <p className="text-xs font-semibold text-[var(--text-tertiary)]">Plantillas</p>
          <InfoTip
            title="Plantillas de pedido"
            what={<span>Se guardan en el negocio con su proveedor: las ves desde cualquier equipo.</span>}
            example={<span>Una plantilla no se pide sola: tócala y su lista pasa a la canasta con el mismo proveedor.</span>}
          />
        </span>
        {hayItems && (
          <button type="button" onClick={() => void saveAsTemplate()} disabled={processing || guardando} className="text-xs text-primary hover:underline font-medium disabled:opacity-50">
            {guardando ? "Guardando…" : "+ Guardar actual"}
          </button>
        )}
      </div>

      {cargando ? (
        <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Cargando…
        </p>
      ) : errorCarga ? (
        <p className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">No se pudieron cargar las plantillas</p>
      ) : plantillas.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {plantillas.map((p) => {
            const nombre = nombrePlantilla(p);
            return (
              <div key={p.id} className={CHIP}>
                <button
                  type="button"
                  onClick={() => loadTemplate({ nombre, supplierId: p.supplierId, items: p.items })}
                  title={`${p.supplierName} · ${p.items.length} productos${p.active ? ` · se repite cada ${p.intervalDays} días` : ""}`}
                  className="text-xs font-medium text-[var(--text-primary)] hover:text-primary"
                >
                  {nombre}
                </button>
                {p.active && <span className="text-xs text-[var(--text-tertiary)]">· {p.intervalDays} d</span>}
                <button type="button" onClick={() => void deleteTemplate(p)} aria-label={`Eliminar plantilla ${nombre}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] ml-0.5">
                  <XIcon className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ) : locales.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">Ninguna guardada</p>
      ) : null}

      {locales.length > 0 && (
        <div className="space-y-1 rounded-lg border border-dashed border-[var(--rule-base)] p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              {locales.length === 1 ? "1 sólo en este equipo" : `${locales.length} sólo en este equipo`}
              <InfoTip
                title="Plantillas de este navegador"
                what={<span>Antes se guardaban sólo aquí y se perdían al cambiar de equipo.</span>}
                example={<span>Tócala para verla en la canasta, elige su proveedor arriba y súbela con la flecha: queda en el negocio con ese proveedor y sale de aquí. De a una, porque cada una puede ser de otro proveedor.</span>}
              />
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {locales.map((tpl, idx) => (
              <div key={`${tpl.name}-${idx}`} className={CHIP}>
                <button
                  type="button"
                  onClick={() => loadTemplate({ nombre: tpl.name, items: tpl.items })}
                  className="text-xs font-medium text-[var(--text-primary)] hover:text-primary"
                >
                  {tpl.name}
                </button>
                <button
                  type="button"
                  onClick={() => void subirLocal(tpl)}
                  disabled={guardando}
                  aria-label={`Subir la plantilla ${tpl.name} al negocio`}
                  title="Subir al negocio con el proveedor elegido"
                  className="ml-0.5 text-[var(--text-tertiary)] hover:text-primary disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
