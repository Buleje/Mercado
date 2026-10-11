"use client";

/**
 * Compras › Proveedores › Comparar (plan «panel unificado», ola 3; fusión F4).
 * Junta en un lugar lo que comparaba proveedores y precios desde 3 pestañas:
 *
 * 1. El comparador (puntaje por calidad, precio, tiempo y condiciones; radar y
 *    «Crear orden de compra») — era Compras › Comparador.
 * 2. Cómo te entrega el proveedor elegido (`SupplierScorecard`, de tus órdenes
 *    reales: entregas a tiempo, órdenes completas, precio estable).
 * 3. Precio por producto (`SupplierPriceComparison`): el último precio de cada
 *    proveedor para el producto que elijas.
 * 4. Cuánto ganas con cada proveedor (`MargenPorProveedor`, 11-10): ventas,
 *    costo y ganancia de lo que le compras a cada uno (el de Lightspeed).
 * 5. Precios del mercado (`CompetitorPriceTracker`, era Análisis › Inteligencia):
 *    sigue guardado en el navegador (llevarlo a la base es decisión de Brandon)
 *    y se ve sólo para quien lo veía allá (`PermisoDe`, regla R2).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import Plegable from "@/components/admin/shared/Plegable";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const SupplierComparator = dynamic(() => import("@/components/admin/SupplierComparator"), { ssr: false, loading: S });
const SupplierScorecard = dynamic(() => import("./SupplierScorecard"), { ssr: false, loading: S });
const MargenPorProveedor = dynamic(() => import("@/components/admin/proveedores/MargenPorProveedor"), { ssr: false, loading: S });
const PrecioPorProducto = dynamic(() => import("./PrecioPorProducto"), { ssr: false, loading: S });
const CompetitorPriceTracker = dynamic(() => import("@/components/admin/CompetitorPriceTracker"), { ssr: false, loading: S });

type Proveedor = { id: string; name: string };

export default function CompararProveedores({ onCreateOC }: { onCreateOC: (proveedor: Proveedor) => void }) {
  const [elegido, setElegido] = useState<Proveedor | null>(null);

  return (
    <div className="space-y-4">
      <SupplierComparator onCreateOC={onCreateOC} onSeleccion={setElegido} />

      {elegido && (
        <Plegable
          clave="compras:comparar:entregas"
          titulo={`Cómo te entrega ${elegido.name}`}
          resumen="De tus órdenes de compra: a tiempo, completas y con precio estable"
          abiertoAlInicio
        >
          <SupplierScorecard key={elegido.id} supplierId={elegido.id} />
        </Plegable>
      )}

      <Plegable
        clave="compras:comparar:margen"
        titulo="Cuánto ganas con cada proveedor"
        resumen="Ventas, costo y ganancia de lo que le compras a cada uno"
      >
        <MargenPorProveedor />
      </Plegable>

      <Plegable
        clave="compras:comparar:precio-producto"
        titulo="Precio por producto"
        resumen="El último precio que te cobró cada proveedor por el producto que elijas"
      >
        <PrecioPorProducto />
      </Plegable>

      <PermisoDe origen="analytics-pro">
        <Plegable
          clave="compras:comparar:mercado"
          titulo="Precios del mercado"
          resumen="Lo que cobra la competencia, guardado en este navegador · venía de Análisis › Inteligencia"
        >
          <CompetitorPriceTracker embebido />
        </Plegable>
      </PermisoDe>
    </div>
  );
}
