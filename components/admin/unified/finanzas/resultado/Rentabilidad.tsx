"use client";

/**
 * Resultado › Rentabilidad en dos secciones (`?sub=`): la ganancia de cada
 * producto y el punto de equilibrio del día.
 *
 * Antes (medido 2026-10-11 a 1280 px): las dos pantallas apiladas, 1,45
 * pantallas con dos títulos de bloque y el período de la primera sin decir que
 * no tocaba a la segunda (el equilibrio es siempre de HOY). Ahora se ve una a
 * la vez y la barra va en la fila del título de cada una (ley 11 de la vista).
 */

import dynamic from "next/dynamic";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { BarraDeSecciones, idPestanaDeSeccion, type SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import { CuerpoDeSeccion } from "@/components/admin/inventario/movimientos/CabeceraVista";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";

const ProfitabilityTab = dynamic(() => import("@/components/admin/ProfitabilityTab"), { loading: S });
const BreakEvenDashboard = dynamic(() => import("@/components/admin/BreakEvenDashboard"), { loading: S });

type Seccion = "productos" | "equilibrio";

const SECCIONES: readonly SeccionDeBarra<Seccion>[] = [
  { clave: "productos", rotulo: "Productos" },
  { clave: "equilibrio", rotulo: "Equilibrio" },
];
const CLAVES: readonly Seccion[] = SECCIONES.map((s) => s.clave);
const ID_PANEL = "plata-rentabilidad-seccion";

export default function Rentabilidad() {
  const { vista: seccion, irA } = useSubvistaModulo("plata-rentabilidad", CLAVES, "productos");
  const barra = (
    <BarraDeSecciones secciones={SECCIONES} activa={seccion} onCambiar={irA} etiqueta="Secciones de Rentabilidad" idPanel={ID_PANEL} />
  );
  return (
    <CuerpoDeSeccion panel={{ id: ID_PANEL, etiquetadoPor: idPestanaDeSeccion(ID_PANEL, seccion) }}>
      {seccion === "equilibrio" ? <BreakEvenDashboard secciones={barra} /> : <ProfitabilityTab secciones={barra} />}
    </CuerpoDeSeccion>
  );
}
