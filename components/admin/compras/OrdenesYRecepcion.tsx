"use client";

/**
 * Compras › Órdenes y recepción (plan «panel unificado», ola 3): las órdenes de
 * compra y la recepción de mercadería en UNA vista, con dos secciones en
 * `?sub=`: «Órdenes» (`ordenes`) y «Recepciones» (`recibir`).
 *
 * Sin tercer nivel de pestañas (10-10): las secciones son una `BarraDeSecciones`
 * que va DENTRO de la fila del título de cada una (prop `barra`), como Ofertas y
 * cupones. Antes era un SegmentedControl suelto arriba de todo.
 *
 * Recibir va con o sin orden: `ReceivingTab` (la orden es un auto-completado
 * opcional) y el «Recibir» de cada orden (`OCRecepcionModal`) escriben al mismo
 * `POST /api/compras/recepciones`. Lo que antes era `?vista=recepcion` llega con
 * `seccionInicial` (lo lee `ComprasModule` antes de reescribir la URL) o con
 * `&sub=recibir` (VISTA_MIGRATION).
 *
 * Una orden abierta por enlace (`?oc=`) siempre abre «Órdenes»: es la que la
 * lee. También con la vista ya montada en «Recibir»: ver `useSeccionDeLaFicha`.
 */

import dynamic from "next/dynamic";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useParamPedido } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { useSeccionDeLaFicha } from "./use-seccion-de-la-ficha";

const PurchaseOrdersTab = dynamic(() => import("@/components/admin/PurchaseOrdersTab"), { loading: S });
const ReceivingTab = dynamic(() => import("@/components/admin/ReceivingTab"), { loading: S });

export const SECCIONES_ORDENES = ["ordenes", "recibir"] as const;
export type SeccionOrdenes = (typeof SECCIONES_ORDENES)[number];

const ID_PANEL = "panel-ordenes-y-recepcion";
const SECCIONES = [
  { clave: "ordenes" as const, rotulo: "Órdenes" },
  { clave: "recibir" as const, rotulo: "Recepciones" },
];

export default function OrdenesYRecepcion({
  seccionInicial,
}: {
  /** La sección que pidió un nombre viejo al abrir (`?vista=recepcion` → «recibir»). */
  seccionInicial?: string;
} = {}) {
  const oc = useParamPedido("oc");
  const { vista, irA } = useSubvistaModulo<SeccionOrdenes>(
    "compras-ordenes",
    SECCIONES_ORDENES,
    "ordenes",
    oc ? "ordenes" : seccionInicial,
  );
  useSeccionDeLaFicha(oc, "ordenes", irA);

  const barra = (
    <BarraDeSecciones secciones={SECCIONES} activa={vista} onCambiar={irA} etiqueta="Secciones de Órdenes y recepción" idPanel={ID_PANEL} />
  );

  return (
    <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, vista)} className="space-y-4">
      {vista === "ordenes" ? <PurchaseOrdersTab barra={barra} /> : <ReceivingTab barra={barra} />}
    </div>
  );
}
