"use client";

/**
 * Reparto — el delivery del negocio, dentro de Pedidos y reparto (plan «panel
 * unificado», 09-10; Brandon eligió Delivery DENTRO de Pedidos).
 *
 * 10-10 (Brandon: «cada pestaña cumple su tarea, sin repetir; compactar; en
 * secciones para pasar de una a otra»), cinco secciones en `?sub=` con la barra
 * compartida `BarraDeSecciones` (como Turnos y Me deben):
 *
 *   En vivo        el mapa con la lista, lo primero de la pantalla.
 *   Rutas          las rutas planificadas y sus paradas (17-10, P17: antes
 *                  plegadas debajo del mapa de En vivo).
 *   Equipo         tus repartidores y, con el selector de al lado del buscador,
 *                  quienes postulan (`?sub=postulantes`, la cifra roja = por
 *                  revisar).
 *   Asignaciones   qué pedido va con qué repartidor; plegados, los permisos.
 *                  La pastilla «Reparten: …» dice si la red Buleje también
 *                  ve tus pedidos y abre su ventana (17-10, P30).
 *   Retiros        lo que les debes a los repartidores (clave `pagos`; cifra =
 *                  por pagar).
 *   Ranking        quién entrega más y mejor en el período.
 *
 * Cabecera en UNA fila: secciones · ⓘ · Indicadores de la sección · Más. Cada
 * sección pone su botón de Indicadores en el hueco de la cabecera
 * (`HuecoIndicadores`); antes eran la franja «Hoy en el reparto» encima de
 * todo y cuatro tarjetas grandes en cada sección. La Red de repartidores Buleje
 * (un ajuste que se toca una vez) pasó del tope de Equipo al menú Más.
 *
 * Se monta de dos maneras con el MISMO cuerpo: dentro de Pedidos y reparto
 * (`anidado`: la sección vive en `?sub=`) y suelto por `?tab=delivery-partners`
 * (hoy TabRouter lo manda a Pedidos y reparto; la sección vive en `?vista=`).
 * Los nombres viejos (`live`, `retiros`, `solicitudes`…) llevan a la sección
 * que hoy los cubre.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { Globe, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import Plegable from "@/components/admin/shared/Plegable";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { HuecoIndicadores } from "@/components/admin/delivery/reparto-indicadores";
import { AYUDA_REPARTO, BARRA_REPARTO, type SeccionDeBarraReparto } from "@/components/admin/delivery/secciones-reparto";
import { usePendientesReparto } from "@/components/admin/delivery/use-pendientes-reparto";
import { useEstadoRedReparto } from "@/components/admin/delivery/EstadoRedReparto";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import RepartoEnVivo from "@/components/admin/delivery/RepartoEnVivo";
import { RepartidoresTab } from "@/components/admin/delivery-partners/tabs/RepartidoresTab";
import { AsignacionesTab } from "@/components/admin/delivery-partners/tabs/AsignacionesTab";
import { PermisosTab } from "@/components/admin/delivery-partners/tabs/PermisosTab";
import { RankingTab } from "@/components/admin/delivery-partners/tabs/RankingTab";
import { SolicitudesTab } from "@/components/admin/delivery-partners/tabs/SolicitudesTab";
import { RetirosTab } from "@/components/admin/repartidores/RetirosTab";
import { useSubvistaModulo, useVistaModulo, type AliasDeVista } from "@/hooks/use-vista-modulo";

const NetworkToggleCard = dynamic(() => import("@/components/admin/delivery/NetworkToggleCard"), { ssr: false });
// Rutas y paradas (antes el módulo «delivery-live»; usa Leaflet → sin SSR).
const RutasYParadas = dynamic(() => import("@/components/admin/DeliveryTab"), {
  ssr: false,
  loading: () => <LoadingSpinner className="mx-auto my-8" />,
});

const MODULE_ID = "delivery-partners";
const ID_PANEL = "reparto-secciones-panel";

/**
 * Lo que la URL puede pedir. `postulantes` no es una sección de la barra: es
 * Equipo con el selector en «Postulantes» (la vieja «Solicitudes») y así tiene
 * link propio.
 */
const SECCIONES_REPARTO = ["en-vivo", "rutas", "repartidores", "postulantes", "asignaciones", "pagos", "ranking"] as const;
type Seccion = (typeof SECCIONES_REPARTO)[number];

/** Los ids de las 8 pestañas de antes → la sección que hoy los cubre. */
const NOMBRES_VIEJOS: AliasDeVista<Seccion> = {
  live: "en-vivo",
  "pedidos-vivo": "en-vivo",
  "delivery-live": "rutas",
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
  const { vista, irA } = useVistaModulo<Seccion>(MODULE_ID, SECCIONES_REPARTO, "en-vivo", forzada, { alias: NOMBRES_VIEJOS });
  return <Reparto seccion={vista} irA={irA} conTitulo />;
}

function RepartoAnidado() {
  const { vista, irA } = useSubvistaModulo<Seccion>(MODULE_ID, SECCIONES_REPARTO, "en-vivo", undefined, { alias: NOMBRES_VIEJOS });
  return <Reparto seccion={vista} irA={irA} />;
}

function Reparto({ seccion, irA, conTitulo = false }: { seccion: Seccion; irA: (v: Seccion) => void; conTitulo?: boolean }) {
  const activa: SeccionDeBarraReparto = seccion === "postulantes" ? "repartidores" : seccion;
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [verRed, setVerRed] = useState(false);
  const red = useEstadoRedReparto(activa === "asignaciones" || verRed);
  const pendientes = usePendientesReparto();
  const { recargar: recargarPendientes } = pendientes;

  /* Volver a entrar a Equipo o a Pagos (aprobar, pagar) cambia las cifras rojas de la barra. */
  useEffect(() => {
    recargarPendientes();
  }, [activa, recargarPendientes]);

  const actualizar = useCallback(() => {
    setVuelta((v) => v + 1);
    recargarPendientes();
  }, [recargarPendientes]);

  const secciones = BARRA_REPARTO.map((s) => ({
    ...s,
    cuenta: s.clave === "repartidores" ? pendientes.postulantes : s.clave === "pagos" ? pendientes.retiros : undefined,
  }));
  const ayuda = AYUDA_REPARTO[seccion];
  const acciones: MenuAccion[] = [
    { id: "actualizar", label: "Actualizar", hint: "Vuelve a pedir lo de esta sección", icon: RefreshCw, onSelect: actualizar },
    {
      id: "red",
      label: "Red de repartidores Buleje",
      hint: "Si los repartidores de Buleje pueden tomar tus pedidos",
      icon: Globe,
      onSelect: () => setVerRed(true),
    },
  ];

  const selectorEquipo = (
    <SegmentedControl<"repartidores" | "postulantes">
      value={seccion === "postulantes" ? "postulantes" : "repartidores"}
      onChange={irA}
      label="Qué repartidores ver"
      size="lg"
      options={[
        { value: "repartidores", label: "Tu equipo" },
        { value: "postulantes", label: "Postulantes", badge: pendientes.postulantes || undefined },
      ]}
    />
  );

  return (
    <HuecoIndicadores.Provider value={hueco}>
      <div className="space-y-4">
        {/* Una fila: secciones · ⓘ · Indicadores de la sección · Más (también a 400 px: la barra se desliza). */}
        <div className="flex items-center gap-2">
          {conTitulo && <SectionTitle className="shrink-0 whitespace-nowrap text-[var(--text-primary)]">Reparto</SectionTitle>}
          <div className="min-w-0">
            <BarraDeSecciones secciones={secciones} activa={activa} onCambiar={irA} etiqueta="Secciones de Reparto" idPanel={ID_PANEL} />
          </div>
          <span className="shrink-0">
            <InfoTip title={ayuda.titulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} />
          </span>
          <div className="ml-auto flex min-w-0 items-center gap-2 max-sm:shrink-0">
            <div ref={setHueco} className="flex min-w-0" />
            <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Actualizar y Red de repartidores Buleje" />
          </div>
        </div>

        <div
          key={`${activa}-${vuelta}`}
          role="tabpanel"
          id={ID_PANEL}
          aria-labelledby={idPestanaDeSeccion(ID_PANEL, activa)}
          className="space-y-4"
        >
          {activa === "en-vivo" && <RepartoEnVivo />}
          {activa === "rutas" && <RutasYParadas />}
          {activa === "repartidores" &&
            (seccion === "postulantes" ? <SolicitudesTab selector={selectorEquipo} /> : <RepartidoresTab selector={selectorEquipo} />)}
          {activa === "asignaciones" && (
            <>
              <AsignacionesTab red={red.enabled} onVerRed={() => setVerRed(true)} onIrEquipo={() => irA("repartidores")} />
              <Plegable clave="pedidos:reparto:permisos" titulo="Permisos de tienda">
                <PermisosTab />
              </Plegable>
            </>
          )}
          {activa === "pagos" && <RetirosTab />}
          {activa === "ranking" && <RankingTab />}
        </div>
      </div>

      <AdminModal open={verRed} onClose={() => setVerRed(false)} title="Red de repartidores Buleje" icon={Globe} variant="wide">
        <div className={MODAL_BODY}>{verRed && <NetworkToggleCard enVentana onCambio={red.setEnabled} />}</div>
      </AdminModal>
    </HuecoIndicadores.Provider>
  );
}
