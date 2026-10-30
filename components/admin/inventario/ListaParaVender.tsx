"use client";

import { Barcode, Coins, ScanBarcode, Boxes } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import LectorGondola from "@/components/admin/inventario/LectorGondola";
import { useListaParaVender } from "@/components/admin/inventario/hooks/use-lista-para-vender";
import type { FaltaDeCatalogo } from "@/lib/inventario/catalogo-incompleto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

const atajo = (activo: boolean) => button({ variant: activo ? "primary" : "secondary", className: "shrink-0 gap-1.5 rounded-xl px-3 text-sm" });

/**
 * «Lista para vender»: tres contadores de lo que le falta al catálogo (sin
 * código, sin costo, sin control de stock) que filtran la tabla al tocarlos, y
 * el lector para completarlos pasando el código de cada producto.
 */
export default function ListaParaVender({ inv }: { inv: Inventario }) {
  const lista = useListaParaVender(inv);
  const { faltaDato, setFaltaDato } = inv;
  const { conteo } = lista;
  const items: Array<{ falta: FaltaDeCatalogo; n: number; texto: string; icono: typeof Coins }> = [
    { falta: "sin-codigo", n: conteo.sinCodigo, texto: "Sin código", icono: Barcode },
    { falta: "sin-costo", n: conteo.sinCosto, texto: "Sin costo", icono: Coins },
    { falta: "sin-control", n: conteo.sinControl, texto: "Sin control", icono: Boxes },
  ];
  /* Celular (29-10): «Sin control» y el lector sólo con ícono: eran 3 filas de
     botones (170 px) antes del buscador; así entran en 2. */
  return (
    <section aria-label="Lista para vender" className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
        Lista para vender
        <InfoTip what="Lo que le falta a tu catálogo para vender rápido: el código para el lector de la caja, el costo para saber tu ganancia y el control para que el stock baje solo." example="Toca «Sin código» para ver esos productos, o pasa el lector por la góndola y complétalos uno a uno." />
      </span>
      {items.map(({ falta, n, texto, icono: Icono }) => {
        const activo = faltaDato === falta;
        if (n === 0 && !activo) return null;
        return (
          <button key={falta} type="button" aria-pressed={activo} onClick={() => setFaltaDato(activo ? null : falta)} className={atajo(activo)}>
            <Icono className="h-4 w-4" aria-hidden /> {texto}
            {falta === "sin-control" && <span className="max-sm:hidden">de stock</span>} <span className={cn("tabular-nums", !activo && "font-bold")}>({n})</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => lista.setAbierto(true)}
        aria-label="Pasar el lector"
        title="Pasar el lector"
        className={button({ variant: "accent", className: "shrink-0 gap-1.5 rounded-xl px-3 text-sm max-sm:w-12 max-sm:px-0" })}
      >
        <ScanBarcode className="h-4 w-4" aria-hidden /> <span className="max-sm:hidden">Pasar el lector</span>
      </button>
      <LectorGondola lista={lista} />
    </section>
  );
}
