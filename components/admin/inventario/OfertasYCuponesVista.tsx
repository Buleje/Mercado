"use client";

/**
 * Productos e inventario › Ofertas y cupones.
 *
 * Junta lo que estaba en tres lugares (plan «panel unificado» F17 + F24, ola 3,
 * 2026-10-10): las ofertas de la tienda (PromotionsTab), sus cupones
 * (CouponsTab), que vivían en la pestaña Productos, y los cupones del
 * marketplace. Los cupones son UNA lista: la tabla `Coupon` es una sola por
 * negocio (código único por tenant), `/api/coupons/validate` no mira `storeId`
 * y el validador del marketplace acepta los de tu tienda y los sin tienda; en
 * la base, 0 de 63 cupones tienen `storeId`. Hasta el 11-10 había un selector
 * «Vale en» que mostraba la misma lista dos veces.
 *
 * Permiso por origen (R2): las ofertas se ven con `productos`; los cupones,
 * con `productos` o `marketplace` (la sección no se esconde).
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const PromotionsTab = dynamic(() => import("@/components/admin/PromotionsTab"), { loading: S });
const CouponsTab = dynamic(() => import("@/components/admin/CouponsTab"), { loading: S });

/** Las secciones de la vista (`?sub=`). La lee `admin-subvistas-sincronizadas`. */
export const SUBS_OFERTAS = ["ofertas", "cupones"] as const;
type SubOfertas = (typeof SUBS_OFERTAS)[number];

const MODULE_ID = "inventario-ofertas";
const ID_PANEL = "panel-ofertas-y-cupones";

const ORIGEN_TIENDA = ["productos"] as const;

export default function OfertasYCuponesVista() {
  const ctx = useContextoPermiso();
  const permisoTienda = usePermisoDe(ORIGEN_TIENDA);
  /* Sin rol confirmado (el hub ya esperó y se cansó) queda lo de la tienda, que
     es lo que veía cualquiera con la pestaña Productos. */
  const veTienda = ctx === null || permisoTienda;

  const secciones = useMemo(
    () => [
      ...(veTienda ? [{ clave: "ofertas" as const, rotulo: "Ofertas" }] : []),
      { clave: "cupones" as const, rotulo: "Cupones" },
    ],
    [veTienda],
  );
  const ids = useMemo(() => secciones.map((x) => x.clave as SubOfertas), [secciones]);
  /* Al hook van TODAS las secciones (constante estable): con sólo las visibles,
     un `?sub=cupones` que llega antes de confirmar el rol se perdería. */
  const { vista: pedida, irA } = useSubvistaModulo<SubOfertas>(MODULE_ID, SUBS_OFERTAS, "ofertas");
  const vista: SubOfertas = ids.includes(pedida) ? pedida : ids[0];

  const barra = (
    <BarraDeSecciones secciones={secciones} activa={vista} onCambiar={irA} etiqueta="Secciones de Ofertas y cupones" idPanel={ID_PANEL} />
  );

  return (
    <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, vista)} className="space-y-4">
      {vista === "ofertas" && <PromotionsTab barra={barra} />}
      {vista === "cupones" && <CouponsTab barra={barra} />}
    </div>
  );
}
