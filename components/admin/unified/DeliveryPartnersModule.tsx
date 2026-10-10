"use client";

/**
 * Reparto — el delivery del negocio, en 5 secciones (plan «panel unificado»,
 * 2026-10-09; Brandon eligió Delivery DENTRO de Pedidos y reparto).
 *
 *   En vivo        ← delivery-partners:live + pedidos-vivo (= delivery-live)
 *   Repartidores   ← delivery-partners:repartidores + solicitudes («Postulantes»)
 *   Asignaciones   ← delivery-partners:asignaciones + permisos (mismo /api/store-permissions)
 *   Pagos          ← delivery-partners:retiros
 *   Ranking        ← delivery-partners:ranking
 *
 * Se monta de dos maneras, con el MISMO cuerpo (R5: mover = montar):
 *  - dentro de Pedidos y reparto (`anidado`): la sección vive en `?sub=`,
 *    porque `?vista=reparto` es de Pedidos; la barra no dibuja título (la
 *    pestaña del hub ya lo dice, module-depth);
 *  - suelto, por `?tab=delivery-partners` mientras ese id no sea un alias:
 *    la sección vive en `?vista=` y los nombres viejos (`live`, `retiros`…)
 *    llevan a la sección que hoy los cubre.
 */
import dynamic from "next/dynamic";
import { ClipboardList, MapPin, Trophy, Truck, Users, Wallet } from "@buleje/design-system/icons";
import { useSubvistaModulo, useVistaModulo, type AliasDeVista } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import Plegable from "@/components/admin/shared/Plegable";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import FranjaReparto from "@/components/admin/delivery/FranjaReparto";
import { RepartidoresTab } from "@/components/admin/delivery-partners/tabs/RepartidoresTab";
import { AsignacionesTab } from "@/components/admin/delivery-partners/tabs/AsignacionesTab";
import { PermisosTab } from "@/components/admin/delivery-partners/tabs/PermisosTab";
import { RankingTab } from "@/components/admin/delivery-partners/tabs/RankingTab";
import { SolicitudesTab } from "@/components/admin/delivery-partners/tabs/SolicitudesTab";
import { RetirosTab } from "@/components/admin/repartidores/RetirosTab";

// Lazy-load del mapa Leaflet (usa window).
const DeliveryPartnersLiveMap = dynamic(
  () => import("@/components/admin/delivery/DeliveryPartnersLiveMap"),
  { ssr: false, loading: () => <LoadingSpinner className="mx-auto my-16" /> },
);

// Rutas y paradas (antes la pestaña «Pedidos en vivo» y, antes, el módulo
// «delivery-live»). No trae cabecera propia.
const DeliveryEnVivoTab = dynamic(() => import("@/components/admin/DeliveryTab"), {
  ssr: false,
  loading: () => <LoadingSpinner className="mx-auto my-8" />,
});

const MODULE_ID = "delivery-partners";

const TABS = [
  { id: "en-vivo", label: "En vivo", icon: MapPin },
  { id: "repartidores", label: "Repartidores", icon: Users },
  { id: "asignaciones", label: "Asignaciones y permisos", shortLabel: "Asignaciones", icon: ClipboardList },
  { id: "pagos", label: "Pagos a repartidores", shortLabel: "Pagos", icon: Wallet },
  { id: "ranking", label: "Ranking", icon: Trophy },
];

/**
 * Lo que la URL puede pedir. `postulantes` no es pestaña: es Repartidores con el
 * filtro de quienes postularon (la vieja «Solicitudes»), y así tiene link propio.
 */
const SECCIONES_REPARTO = ["en-vivo", "repartidores", "postulantes", "asignaciones", "pagos", "ranking"] as const;
type Seccion = (typeof SECCIONES_REPARTO)[number];

/** Los ids de las 8 pestañas de antes → la sección que hoy los cubre. */
const NOMBRES_VIEJOS: AliasDeVista<Seccion> = {
  live: "en-vivo",
  "pedidos-vivo": "en-vivo",
  solicitudes: "postulantes",
  retiros: "pagos",
  permisos: "asignaciones",
};

export default function DeliveryPartnersModule({
  initialTab,
  anidado = false,
}: { initialTab?: string; anidado?: boolean } = {}) {
  return anidado ? <RepartoAnidado /> : <RepartoSuelto initialTab={initialTab} />;
}

function RepartoSuelto({ initialTab }: { initialTab?: string }) {
  const forzada = initialTab ? (NOMBRES_VIEJOS[initialTab] ?? initialTab) : undefined;
  const { vista, irA } = useVistaModulo<Seccion>(MODULE_ID, SECCIONES_REPARTO, "en-vivo", forzada, {
    alias: NOMBRES_VIEJOS,
  });
  return <Reparto seccion={vista} irA={irA} />;
}

/**
 * `?sub=` acepta también los nombres viejos (un `?sub=retiros` armado a mano o
 * migrado de `?tab=delivery-partners&vista=retiros`): `useSubvistaModulo` no
 * tiene alias, así que entran como válidos y acá se traducen.
 */
const SUB_ACEPTADAS = [...SECCIONES_REPARTO, ...Object.keys(NOMBRES_VIEJOS)] as readonly string[];

function RepartoAnidado() {
  const { vista, irA } = useSubvistaModulo<string>(MODULE_ID, SUB_ACEPTADAS, "en-vivo");
  const seccion = (NOMBRES_VIEJOS[vista] ?? vista) as Seccion;
  return <Reparto seccion={seccion} irA={irA} />;
}

function Reparto({ seccion, irA }: { seccion: Seccion; irA: (v: string) => void }) {
  const activa = seccion === "postulantes" ? "repartidores" : seccion;
  return (
    <AdminTabBar
      heading={{
        title: "Delivery",
        description: "Repartidores en vivo, tu equipo y quienes postulan, asignaciones, pagos y ranking. Vive en Pedidos y reparto › Reparto.",
        icon: Truck,
      }}
      tabs={TABS}
      activeTab={activa}
      onTabChange={irA}
      moduleId={MODULE_ID}
    >
      <div className="space-y-4">
        <FranjaReparto />
        {activa === "en-vivo" && (
          <>
            <DeliveryPartnersLiveMap />
            <Plegable clave="pedidos:reparto:rutas" titulo="Rutas y paradas">
              <DeliveryEnVivoTab />
            </Plegable>
          </>
        )}
        {activa === "repartidores" && (
          <>
            <SegmentedControl<"repartidores" | "postulantes">
              value={seccion === "postulantes" ? "postulantes" : "repartidores"}
              onChange={irA}
              label="Qué repartidores ver"
              size="lg"
              options={[
                { value: "repartidores", label: "Tu equipo" },
                { value: "postulantes", label: "Postulantes" },
              ]}
            />
            {seccion === "postulantes" ? <SolicitudesTab /> : <RepartidoresTab />}
          </>
        )}
        {activa === "asignaciones" && (
          <>
            <AsignacionesTab />
            <PermisosTab />
          </>
        )}
        {activa === "pagos" && <RetirosTab />}
        {activa === "ranking" && <RankingTab />}
      </div>
    </AdminTabBar>
  );
}
