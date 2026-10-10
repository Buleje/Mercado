"use client";

/**
 * Compras › Proveedores (plan «panel unificado», ola 3): la lista de
 * proveedores y, en una 2.ª sección (`?sub=comparar`), todo lo que compara
 * proveedores y precios (`CompararProveedores`). Lo que antes era
 * `?vista=comparador` llega con `seccionInicial` (lo lee `ComprasModule` antes
 * de reescribir la URL) o con `&sub=comparar` (VISTA_MIGRATION).
 *
 * Una ficha abierta por enlace (`?proveedor=`) siempre abre la lista: es la que
 * la lee. También con la vista ya montada en Comparar («Precio por producto» →
 * un proveedor): ver `useSeccionDeLaFicha`.
 */

import dynamic from "next/dynamic";
import { BarChart3, Users } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useParamPedido } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { useSeccionDeLaFicha } from "./use-seccion-de-la-ficha";

const SuppliersTab = dynamic(() => import("@/components/admin/SuppliersTab"), { loading: S });
const CompararProveedores = dynamic(() => import("./CompararProveedores"), { ssr: false, loading: S });

export const SECCIONES_PROVEEDORES = ["lista", "comparar"] as const;
export type SeccionProveedores = (typeof SECCIONES_PROVEEDORES)[number];

export default function ProveedoresVista({
  onCrearOC,
  seccionInicial,
}: {
  /** «Crear orden» del comparador: lleva a Órdenes con el proveedor elegido. */
  onCrearOC: (proveedor: { id: string; name: string }) => void;
  /** La sección que pidió un nombre viejo al abrir (`?vista=comparador` → «comparar»). */
  seccionInicial?: string;
}) {
  const proveedor = useParamPedido("proveedor");
  const { vista, irA } = useSubvistaModulo<SeccionProveedores>(
    "compras-proveedores",
    SECCIONES_PROVEEDORES,
    "lista",
    proveedor ? "lista" : seccionInicial,
  );
  useSeccionDeLaFicha(proveedor, "lista", irA);

  return (
    <div className="space-y-4">
      <SegmentedControl<SeccionProveedores>
        value={vista}
        onChange={irA}
        label="Lista o comparar"
        size="lg"
        options={[
          { value: "lista", label: "Proveedores", icon: <Users className="h-4 w-4" aria-hidden /> },
          { value: "comparar", label: "Comparar", icon: <BarChart3 className="h-4 w-4" aria-hidden /> },
        ]}
      />
      {vista === "lista" ? <SuppliersTab /> : <CompararProveedores onCreateOC={onCrearOC} />}
    </div>
  );
}
