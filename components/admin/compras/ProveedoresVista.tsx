"use client";

/**
 * Compras › Proveedores (plan «panel unificado», ola 3): la lista de
 * proveedores y, en una 2.ª sección (`?sub=comparar`), todo lo que compara
 * proveedores y precios (`CompararProveedores`). Lo que antes era
 * `?vista=comparador` llega con `seccionInicial` (lo lee `ComprasModule` antes
 * de reescribir la URL) o con `&sub=comparar` (VISTA_MIGRATION).
 *
 * Las dos secciones comparten la fila del título (`CabeceraProveedores`): la
 * lista le suma sus Indicadores y «Nuevo proveedor»; Comparar va sola.
 *
 * Una ficha abierta por enlace (`?proveedor=`) siempre abre la lista: es la que
 * la lee. También con la vista ya montada en Comparar («Precio por producto» →
 * un proveedor): ver `useSeccionDeLaFicha`.
 */

import dynamic from "next/dynamic";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useParamPedido } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import CabeceraProveedores, { ID_PANEL_PROVEEDORES, idPestanaDeSeccion } from "@/components/admin/proveedores/CabeceraProveedores";
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
  const barra = { activa: vista, onCambiar: irA };

  if (vista === "lista") return <SuppliersTab barra={barra} />;
  return (
    <div className="space-y-4">
      <CabeceraProveedores barra={barra} />
      <div role="tabpanel" id={ID_PANEL_PROVEEDORES} aria-labelledby={idPestanaDeSeccion(ID_PANEL_PROVEEDORES, vista)}>
        <CompararProveedores onCreateOC={onCrearOC} />
      </div>
    </div>
  );
}
