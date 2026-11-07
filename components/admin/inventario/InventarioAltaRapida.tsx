"use client";

import { useState } from "react";
import { Plus } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import AltaRapidaProducto from "@/components/admin/inventario/AltaRapidaProducto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/**
 * Productos: si lo que buscas no existe, lo creas ahí mismo (alta rápida) en vez de salir a otra pantalla.
 * Se ve sólo cuando hay una búsqueda sin resultados.
 */
export default function InventarioAltaRapida({ inv }: { inv: Inventario }) {
  const { search, formCategories, load, setAddForm, setShowAdd } = inv;
  const [abierto, setAbierto] = useState(false);
  const texto = search.trim();
  if (!texto && !abierto) return null;
  return (
    <>
      <div className="flex justify-center pb-4">
        <button type="button" onClick={() => setAbierto(true)} className={button({ variant: "secondary", className: "gap-2" })} data-qa="inventario-alta-rapida">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Crear «{texto}» ahora
        </button>
      </div>
      <AltaRapidaProducto
        open={abierto}
        onClose={() => setAbierto(false)}
        textoBuscado={texto}
        categorias={formCategories}
        onCreado={async () => { await load({ silencioso: true }); }}
        onFormularioCompleto={(d) => {
          setAbierto(false);
          setAddForm((f) => ({ ...f, name: d.name, price: d.price, stock: d.stock, category: d.category || f.category, barcode: d.barcode, taxType: d.taxType || f.taxType }));
          setShowAdd(true);
        }}
      />
    </>
  );
}
