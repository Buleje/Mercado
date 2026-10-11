"use client";

/**
 * Cámaras — lo que la cámara del patio manda, lo que la IA leyó, y la
 * dirección para que mande (ADR-411, ADR-456).
 *
 * La cámara es 4G con panel solar: nadie puede «entrar» a verla (CGNAT), y un
 * stream continuo no se sostiene ni en datos ni en batería. Así que esta
 * pantalla no es un monitor de video: es **el historial de lo que pasó**, que es
 * lo que sirve a la mañana siguiente — quién entró, a qué hora, y la foto.
 *
 * Cuatro vistas (`?vista=`), por la pregunta que responden:
 *  · **Fotos** — cada foto con lo que leyó la IA: chalecos, placa con su guía,
 *    actividad y la pila. La placa y el chaleco son propuestas que se confirman.
 *  · **Hoy en el patio** — el día entero en una pantalla, de cualquier fecha.
 *  · **Personas** — las fotos del detector local del mosaico (van al Drive).
 *  · **Cámaras** — alta, dirección para copiar, avisos, pila y chalecos: lo que
 *    se configura una vez.
 *
 * Arriba, en todas, sólo lo que hace que la cámara funcione o no: el túnel
 * cerrado, la IA sin clave, la cámara que dejó de mandar — en UNA línea, el
 * más grave primero y «+N» para el resto.
 *
 * La banda es la del panel (Brandon 10-10): título · pestañas · acción
 * principal («Agregar cámara» en «Cámaras») · «Más» (Actualizar, otra
 * pantalla). La identidad la dibuja esta barra: `CamarasModule` ya no pone
 * su AdminModuleHeader.
 *
 * Los datos y las escrituras viven en `camaras/use-camaras.ts`; la dirección
 * pública en `use-direccion-publica.ts`; la conexión directa en
 * `use-conexion-directa.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Camera, Image as ImageIcon, MoreHorizontal, Plus, RefreshCw, Tv, Users } from "@buleje/design-system/icons";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import ActionMenu from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { estaCallada } from "@/lib/camaras/camaras";
import AgregarCamaraModal from "./camaras/AgregarCamaraModal";
import ConectarCamaraModal from "./camaras/ConectarCamaraModal";
import ChalecosModal from "./camaras/ChalecosModal";
import HistorialFotos from "./camaras/HistorialFotos";
import HoyEnElPatio from "./camaras/HoyEnElPatio";
import OtraPantallaModal, { type PestanaOtraPantalla } from "./camaras/OtraPantallaModal";
import VistaCamaras from "./camaras/VistaCamaras";
import VistaPersonas from "./camaras/VistaPersonas";
import AvisosEnUnaLinea from "./camaras/AvisosEnUnaLinea";
import { MensajeAccion } from "./camaras/AvisosCamaras";
import { useCamaras } from "./camaras/use-camaras";
import { EVENTO_FOTO_NUEVA } from "./camaras/use-analizar-cuadro";
import { useConexionDirecta } from "./camaras/use-conexion-directa";
import { useDireccionPublica } from "./camaras/use-direccion-publica";
import { useVistosSinAsignar } from "./camaras/use-vistos-sin-asignar";
import EstadoCamaras from "./camaras/EstadoCamaras";
import { VisorNubeProvider } from "./camaras/VisorNubeContexto";
import { faltaClaveIa, porQueNoSeCopia } from "./camaras/camaras-ui";

const MODULE_ID = "camaras";
const VISTAS = ["fotos", "patio", "personas", "camaras"] as const;
type Vista = (typeof VISTAS)[number];

/** «Ver en otra pantalla» abierto (Modo TV), y en qué pestaña. */
type OtraPantalla = { pestana: PestanaOtraPantalla; codigo?: string } | null;

/* La cuenta de Hik-Connect for Teams y su visor, compartidos por todas las vistas (ADR-471).
   «Ver en otra pantalla» vive arriba del proveedor: el visor de la nube lo abre con
   «Verlo en el televisor» (su video es un canvas y no se puede transmitir). */
export default function CamarasView() {
  const [otra, setOtra] = useState<OtraPantalla>(null);
  return (
    <VisorNubeProvider onVerEnTv={() => setOtra({ pestana: "tv" })}>
      <PantallaCamaras otra={otra} setOtra={setOtra} />
    </VisorNubeProvider>
  );
}

function PantallaCamaras({ otra, setOtra }: { otra: OtraPantalla; setOtra: (o: OtraPantalla) => void }) {
  const d = useCamaras();
  const conexion = useConexionDirecta(d);
  const dir = useDireccionPublica();
  const { vista, irA } = useVistaModulo<Vista>(MODULE_ID, VISTAS, "fotos");
  const [recarga, setRecarga] = useState(0);
  const [conectando, setConectando] = useState<string | null>(null);
  const [chalecos, setChalecos] = useState<{ numero: string | null } | null>(null);
  const [agregando, setAgregando] = useState(false);
  /* «En vivo» desde Fotos de una cámara con visor propio: el visor vive en
     «Cámaras». Se cambia de vista y, ya montada, se baja hasta esa cámara. */
  const focoRef = useRef<string | null>(null);
  const verVisor = (id: string) => {
    focoRef.current = id;
    irA("camaras");
  };
  useEffect(() => {
    const id = focoRef.current;
    if (vista !== "camaras" || !id) return;
    focoRef.current = null;
    document.getElementById(`camara-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [vista]);

  /* El QR del televisor trae `?vincularTv=CODIGO`: se abre «Ver en otra pantalla»
     con el código puesto y se saca de la URL (un refresco no lo vuelve a abrir). */
  useEffect(() => {
    const url = new URL(window.location.href);
    const codigo = url.searchParams.get("vincularTv");
    if (!codigo) return;
    url.searchParams.delete("vincularTv");
    window.history.replaceState(window.history.state, "", url.toString());
    setOtra({ pestana: "tv", codigo });
  }, [setOtra]);

  /* «Analizar» del vivo guarda la foto por fuera de `useCamaras`: se recarga en
     silencio para que «Fotos» la muestre (y otra vez cuando llega la lectura). */
  const { cargar } = d;
  useEffect(() => {
    const alGuardar = () => void cargar({ silenciosa: true });
    window.addEventListener(EVENTO_FOTO_NUEVA, alGuardar);
    return () => window.removeEventListener(EVENTO_FOTO_NUEVA, alGuardar);
  }, [cargar]);

  const calladas = useMemo(() => d.camaras.filter((c) => estaCallada(c)), [d.camaras]);
  const sinIa = useMemo(() => faltaClaveIa(d.capturas), [d.capturas]);
  const camaraAConectar = d.camaras.find((c) => c.id === conectando) ?? null;

  const vistosSinAsignar = useVistosSinAsignar(d.capturas, d.chalecos);

  const abrirChalecos = (numero: string | null) => {
    d.setError(null);
    setChalecos({ numero });
  };
  /* Asignar cambia quién es quién también en el resumen del día: se lo vuelve a
     pedir (el servidor lo arma con la lista viva de chalecos). */
  const asignarChaleco = async (numero: string, colaboradorId: string | null) => {
    const r = await d.asignarChaleco(numero, colaboradorId);
    if (r) setRecarga((n) => n + 1);
    return r;
  };
  const actualizar = () => {
    void d.cargar();
    void dir.recargar();
    setRecarga((n) => n + 1);
  };

  /* El conteo va en el rótulo y no en `badge` (la pastilla marcada daba 2,98:1). */
  const tabs: AdminTab[] = [
    { id: "fotos", label: d.capturas.length ? `Fotos (${d.capturas.length})` : "Fotos", icon: ImageIcon },
    { id: "patio", label: "Hoy en el patio", icon: CalendarDays },
    { id: "personas", label: "Personas", icon: Users },
    { id: "camaras", label: "Cámaras", icon: Camera },
  ];
  /* Banda del panel (Brandon 10-10): título · pestañas · acción principal · «Más». */
  const acciones = (
    <>
      {vista === "camaras" && (
        <button
          type="button"
          onClick={() => {
            d.setError(null);
            setAgregando(true);
          }}
          title="Agregar cámara"
          className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl max-sm:w-12 max-sm:px-0" })}
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Agregar cámara</span>
        </button>
      )}
      <ActionMenu
        label="Más acciones de cámaras"
        icon={MoreHorizontal}
        soloIcono
        size="md"
        className="w-12 shrink-0"
        title="Actualizar y ver en otra pantalla"
        actions={[
          { id: "actualizar", label: "Actualizar", hint: "Vuelve a pedir fotos, cámaras y el día", icon: RefreshCw, onSelect: actualizar },
          { id: "otra-pantalla", label: "Ver en otra pantalla", hint: "En tu Smart TV o en tu celular", icon: Tv, onSelect: () => setOtra({ pestana: "tv" }) },
        ]}
      />
    </>
  );

  return (
    <>
      <AdminTabBar
        heading={{
          title: "Cámaras",
          icon: Camera,
          description:
            "Lo que mandó la cámara del patio con su hora y lo que se ve en cada foto (Fotos), el día entero (Hoy en el patio), las fotos del detector de personas (Personas) y el alta y la conexión de cada cámara (Cámaras).",
          actions: acciones,
        }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={(id) => irA(id as Vista)}
        moduleId={MODULE_ID}
      >
        <div className="space-y-3" data-vista="camaras">
          {/* Los avisos en UNA línea, el más grave primero; en «Cámaras» también la dirección en verde. */}
          <AvisosEnUnaLinea estado={dir.estado} calladas={calladas} sinIa={sinIa} conDireccionOk={vista === "camaras"} />
          <MensajeAccion error={chalecos || agregando ? null : d.error} aviso={chalecos ? null : d.aviso} />

          {vista === "fotos" && (
            <EstadoCamaras
              camaras={d.camaras}
              direccionParaCamara={dir.direccionParaCamara}
              motivoSinDireccion={porQueNoSeCopia(dir.estado)}
              guardando={d.guardando}
              onRotar={(id) => void d.rotar(id)}
              onErrorCopia={() =>
                d.setError("El navegador no dejó copiar. Selecciona la dirección a mano.")
              }
              onVerVisor={verVisor}
            />
          )}
          {vista === "fotos" && (
            <HistorialFotos
              camaras={d.camaras}
              capturas={d.capturas}
              cargando={d.cargando}
              guardando={d.guardando}
              onBorrar={(id) => void d.borrarCaptura(id)}
              onConfirmar={d.confirmarCruce}
              onAsignarChaleco={abrirChalecos}
              chalecosVivos={d.chalecos}
              onIrACamaras={() => irA("camaras")}
              onVerVisor={verVisor}
            />
          )}
          {vista === "patio" && (
            <HoyEnElPatio activo recarga={recarga} onAsignarChaleco={abrirChalecos} />
          )}
          {vista === "personas" && <VistaPersonas activo recarga={recarga} camaras={d.camaras} />}
          {vista === "camaras" && (
            <VistaCamaras
              datos={d}
              conexion={conexion}
              estadoDireccion={dir.estado}
              direccionParaCamara={dir.direccionParaCamara}
              onConectar={setConectando}
              onAbrirChalecos={() => abrirChalecos(null)}
              onAgregar={() => setAgregando(true)}
              onAsignarChaleco={abrirChalecos}
            />
          )}
        </div>
      </AdminTabBar>

      {camaraAConectar && (
        <ConectarCamaraModal
          /* Uno por cámara: al montarse lee la conexión que ya tiene, y así una
             recarga de la lista mientras se escribe no pisa lo tipeado. */
          key={camaraAConectar.id}
          camara={camaraAConectar}
          onCerrar={() => setConectando(null)}
          onConectar={(datos) => conexion.conectar(camaraAConectar, datos)}
          onDesconectar={async () => {
            await d.desconectar(camaraAConectar.id);
          }}
          onGuardarPuente={(campos) => d.ajustarPuente(camaraAConectar.id, campos)}
          error={d.error}
        />
      )}
      {otra && (
        <OtraPantallaModal
          camaras={d.camaras}
          pestanaInicial={otra.pestana}
          codigoInicial={otra.codigo}
          onCerrar={() => setOtra(null)}
        />
      )}
      {agregando && (
        <AgregarCamaraModal guardando={d.guardando} error={d.error} onCrear={d.crear} onCerrar={() => setAgregando(false)} />
      )}
      {chalecos && (
        <ChalecosModal
          key={chalecos.numero ?? "nuevo"}
          chalecos={d.chalecos}
          colaboradores={d.colaboradores}
          vistosSinAsignar={vistosSinAsignar}
          numeroInicial={chalecos.numero}
          guardando={d.guardando}
          error={d.error}
          onAsignar={asignarChaleco}
          onCerrar={() => setChalecos(null)}
        />
      )}
    </>
  );
}
