"use client";

/**
 * Comprobantes › Cotizaciones.
 *
 * Sin tercer nivel de pestañas (antes «Dashboard · Lista · + Nueva», con
 * manijas de arrastre): la lista es lo central y se ve al entrar, partida en
 * dos secciones por estado —«En curso» (lo que pide seguimiento) y «Cerradas»
 * (pedido, rechazo o vencimiento)—; las cifras van a Indicadores plegables en
 * la cabecera y «Nueva cotización» es el botón principal, que abre una ventana.
 *
 * Usa `?sub=` (no `?vista=`): vive DENTRO del hub de Comprobantes, que ya es
 * dueño de `?vista=`. Los `?sub=` de antes siguen sirviendo (alias): `lista` y
 * `dashboard` caen en «En curso» (este último con los Indicadores abiertos) y
 * `nueva` abre el formulario.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { Bookmark, MoreHorizontal, Plus, RefreshCw, UserPlus } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { printCotizacion } from "@/lib/documentos/cotizacion-print";
import ClienteFormModal from "./clientes/ClienteFormModal";
import { AvisoVencidas } from "./cotizaciones/AvisoVencidas";
import { BandejaSeguimiento } from "./cotizaciones/BandejaSeguimiento";
import { DetalleCotizacion } from "./cotizaciones/DetalleCotizacion";
import { FiltrosCotizaciones, type VistaLista } from "./cotizaciones/FiltrosCotizaciones";
import { ListaCotizaciones } from "./cotizaciones/ListaCotizaciones";
import { NuevaCotizacionModal } from "./cotizaciones/NuevaCotizacionModal";
import { PlantillasModales } from "./cotizaciones/PlantillasModales";
import {
  draftDeItems,
  fechaEnDias,
  filtrarCotizaciones,
  ID_PANEL_COTIZACIONES,
  SECCION,
  SECCIONES_COTIZACIONES,
  seccionDe,
  type Cotizacion,
  type CotizacionStatus,
  type SeccionCotizaciones,
} from "./cotizaciones/tipos";
import { useCotizaciones } from "./cotizaciones/use-cotizaciones";
import { useDetalleCotizacion } from "./cotizaciones/use-detalle-cotizacion";
import { useIndicadoresCotizaciones } from "./cotizaciones/use-indicadores-cotizaciones";
import { useNuevaCotizacion } from "./cotizaciones/use-nueva-cotizacion";
import { usePlantillas, type PlantillaElegida } from "./cotizaciones/use-plantillas";
import { useSeguimiento } from "./cotizaciones/use-seguimiento";

const MODULE_ID = "cotizaciones";

/**
 * Lo que un enlace puede pedir en `?sub=` (el buscador del panel lo ofrece y
 * `__tests__/admin-subvistas-sincronizadas` lo compara con
 * `lib/admin/subvistas-modulos.ts`): las dos secciones, el formulario y los
 * Indicadores. Sólo las secciones son vistas de verdad; las otras dos abren
 * algo encima de «En curso».
 */
const COTIZACIONES_VISTAS = ["en-curso", "cerradas", "nueva", "dashboard"] as const;
type Pedido = (typeof COTIZACIONES_VISTAS)[number];

/** Los nombres viejos (y las dos entradas que abren algo) caen en «En curso». */
const ALIAS: Readonly<Record<string, SeccionCotizaciones>> = { lista: "en-curso", dashboard: "en-curso", nueva: "en-curso" };

const AYUDA = {
  what: "Los presupuestos que mandas antes de vender, con su vigencia y su estado. «En curso» son los que todavía piden algo (mandarlos, esperar la respuesta, convertirlos); «Cerradas», los que ya terminaron.",
  affects: "Una cotización aceptada se convierte en pedido con un toque; vencida, ya no se puede convertir.",
  example: "Le cotizas 20 planchas de triplay al colegio, válida 15 días: la aceptan y la conviertes en pedido.",
};

const leerVista = (): VistaLista => {
  try { return localStorage.getItem("cot-view-mode") === "cards" ? "cards" : "lista"; } catch { return "lista"; }
};

export default function CotizacionesModule() {
  /* Lo que pidió la URL al entrar, ANTES de que el hook lo normalice a una sección. */
  const [pedidoAlEntrar] = useState<Pedido | null>(() => {
    if (typeof window === "undefined") return null;
    const sub = new URLSearchParams(window.location.search).get("sub");
    return (COTIZACIONES_VISTAS as readonly string[]).includes(sub ?? "") ? (sub as Pedido) : null;
  });
  const { vista: seccion, irA } = useSubvistaModulo(MODULE_ID, SECCIONES_COTIZACIONES, "en-curso", undefined, { alias: ALIAS });

  const datos = useCotizaciones();
  const { cotizaciones, recargar } = datos;
  const detalle = useDetalleCotizacion(recargar);
  const plantillas = usePlantillas();
  const seguimiento = useSeguimiento();
  const [estado, setEstado] = useState<CotizacionStatus | "">("");
  const [texto, setTexto] = useState("");
  const [vista, setVista] = useState<VistaLista>("lista");
  const [clienteRapido, setClienteRapido] = useState(false);
  useEffect(() => setVista(leerVista()), []);
  const cambiarVista = (v: VistaLista) => {
    setVista(v);
    try { localStorage.setItem("cot-view-mode", v); } catch { /* modo privado */ }
  };

  const cambiarSeccion = useCallback((s: SeccionCotizaciones) => { setEstado(""); irA(s); }, [irA]);
  const form = useNuevaCotizacion(() => { void recargar(); cambiarSeccion("en-curso"); });
  const kpis = useIndicadoresCotizaciones(cotizaciones, datos.cargada, pedidoAlEntrar === "dashboard");

  // `?sub=nueva` (el «+ Nueva» de antes, el buscador del panel): abre el formulario una vez.
  const abrioPedido = useRef(false);
  const { abrir: abrirForm } = form;
  useEffect(() => {
    if (abrioPedido.current || pedidoAlEntrar !== "nueva") return;
    abrioPedido.current = true;
    abrirForm();
  }, [pedidoAlEntrar, abrirForm]);
  /* …y si llega con el módulo ya montado (el buscador navega con `popstate`):
     se abre y la URL queda en la sección, para que recargar no lo reabra. */
  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("sub") !== "nueva") return;
      url.searchParams.set("sub", "en-curso");
      window.history.replaceState(window.history.state, "", url.toString());
      abrirForm();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [abrirForm]);

  const cuentas = useMemo(() => {
    const c: Partial<Record<CotizacionStatus, number>> = {};
    for (const x of cotizaciones) c[x.status] = (c[x.status] ?? 0) + 1;
    return c;
  }, [cotizaciones]);
  /* Un chip de la otra sección (volver atrás en el historial) no filtra a la nada. */
  const estadoVigente = estado && SECCION[seccion].estados.includes(estado) ? estado : "";
  const filas = useMemo(() => filtrarCotizaciones(cotizaciones, { seccion, estado: estadoVigente, texto }), [cotizaciones, seccion, estadoVigente, texto]);
  const porSeccion = (s: SeccionCotizaciones) => cotizaciones.filter((c) => seccionDe(c.status) === s).length;

  const duplicar = (c: Cotizacion) => {
    detalle.cerrar();
    form.abrir({ items: draftDeItems(c.items), clienteNombre: "", clienteRuc: "", validoHasta: fechaEnDias(15), notas: "", paso: 2 });
  };
  const renovar = (c: Cotizacion) => {
    detalle.cerrar();
    // Renovar = cotización nueva (número y fecha nuevos) para el MISMO cliente de la lista.
    const cliente = c.customerId ? { phone: c.customerId, nombre: c.clienteNombre, ...(c.clienteRuc ? { documento: c.clienteRuc } : {}) } : null;
    form.abrir({ items: draftDeItems(c.items), clienteNombre: c.clienteNombre, clienteRuc: c.clienteRuc ?? "", cliente, validoHasta: fechaEnDias(15), notas: c.notas ?? "", paso: 3 });
  };
  /** Sólo ítems y condiciones: el cliente, la fecha y el número quedan como estaban en el formulario. */
  const usarPlantilla = (p: PlantillaElegida) => {
    plantillas.setVentana(null);
    form.abrir({ items: draftDeItems(p.items), ...(p.notas ? { notas: p.notas } : {}), paso: 2 });
  };

  const acciones: MenuAccion[] = [
    { id: "plantillas", label: "Plantillas guardadas", hint: "Las de tu empresa y las de este navegador", icon: Bookmark, meta: String(plantillas.total), onSelect: () => plantillas.setVentana("gestionar") },
    { id: "cliente", label: "Nuevo cliente", hint: "Darlo de alta sin salir de Cotizaciones", icon: UserPlus, onSelect: () => setClienteRapido(true) },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void recargar() },
  ];
  const secciones = SECCIONES_COTIZACIONES.map((clave) => ({ clave, rotulo: SECCION[clave].rotulo, cuenta: datos.cargada ? porSeccion(clave) : undefined }));
  const filtrando = Boolean(texto.trim() || estadoVigente);
  const nada = cotizaciones.length === 0;

  return (
    <div className="space-y-4">
      {/* Una fila: título · secciones · Indicadores · Nueva · Más. En el celular las secciones bajan a su fila. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Cotizaciones</SectionTitle>
          <InfoTip title="Cotizaciones" what={AYUDA.what} affects={AYUDA.affects} example={AYUDA.example} />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">
          <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={cambiarSeccion} etiqueta="Secciones de Cotizaciones" idPanel={ID_PANEL_COTIZACIONES} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={() => form.abrir()} aria-haspopup="dialog" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Nueva cotización</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Plantillas, nuevo cliente y actualizar" />
        </div>
      </div>

      {kpis.panel}

      <div role="tabpanel" id={ID_PANEL_COTIZACIONES} aria-labelledby={idPestanaDeSeccion(ID_PANEL_COTIZACIONES, seccion)} className="space-y-3">
        {seccion === "en-curso" && (
          <>
            <AvisoVencidas vencidas={datos.vencidas} procesando={datos.procesandoVencidas} onRenovar={() => void datos.renovarVencidas()} onMarcar={() => void datos.marcarVencidas()} />
            <BandejaSeguimiento cotizaciones={cotizaciones} seguimiento={seguimiento} onAbrir={(c) => void detalle.abrir(c)} />
          </>
        )}
        {!nada && (
          <FiltrosCotizaciones seccion={seccion} texto={texto} onTexto={setTexto} estado={estadoVigente} onEstado={setEstado} cuentas={cuentas} vista={vista} onVista={cambiarVista} />
        )}
        <ListaCotizaciones
          key={`${seccion}|${estadoVigente}|${texto}`}
          filas={filas}
          vista={vista}
          loading={datos.loading}
          error={datos.error}
          onReintentar={() => void recargar()}
          onAbrir={(c) => void detalle.abrir(c)}
          vacio={nada ? "Todavía no tienes cotizaciones." : filtrando ? "Ninguna cotización coincide con el filtro." : SECCION[seccion].vacio}
          accionVacio={
            filtrando
              ? { rotulo: "Quitar filtros", onClick: () => { setTexto(""); setEstado(""); } }
              : seccion === "en-curso"
                ? { rotulo: "Nueva cotización", onClick: () => form.abrir() }
                : undefined
          }
        />
      </div>

      <DetalleCotizacion
        detalle={detalle}
        onDuplicar={duplicar}
        onRenovar={renovar}
        onImprimir={(c) => printCotizacion(c, detalle.empresa)}
        onGuardarPlantilla={plantillas.guardarDesde}
        seguimiento={seguimiento}
      />
      <NuevaCotizacionModal
        form={form}
        empresa={detalle.empresa}
        cuantasPlantillas={plantillas.total}
        onElegirPlantilla={() => plantillas.setVentana("elegir")}
        onGestionarPlantillas={() => plantillas.setVentana("gestionar")}
      />
      <PlantillasModales plantillas={plantillas} onUsar={usarPlantilla} />
      <ClienteFormModal isOpen={clienteRapido} onClose={() => setClienteRapido(false)} onSaved={() => setClienteRapido(false)} initialFormat="simple" />
    </div>
  );
}
