"use client";

/**
 * CtpPlantaCroquisMapa — la capa «Croquis» de la vista Planta (ADR-465): el
 * plano del aserradero en METROS, con sus zonas, lo que hay parado en cada una
 * (la pila entera o la troza separada), las máquinas D1–D7 y el flujo del plano.
 *
 * Mismo gesto que el satélite: tomar algo de la lista y tocar (o soltar en) la
 * zona. En el croquis además se guarda el PUNTO donde cayó, y arrastrar una
 * marca a otra zona la mueve de zona. La ubicación es informativa: no toca stock.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Map as MapIcon, Settings2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { formatNumber } from "@/lib/format";
import { FILTROS_VACIOS, opcionesDeFiltro, rutasDelPlano, type ContenidoZona, type FiltrosCroquis, type Punto } from "@/lib/forestal/planta-croquis";
import { CROQUIS_CSS } from "@/lib/forestal/planta-croquis-html";
import { MARCA_CSS } from "@/lib/forestal/planta-iconos";
import { claveTroza, type AsignacionPlanta, type Item, type MaquinaPlanta, type PlantaCroquis, type PlantaZona } from "@/lib/forestal/planta-zona-types";
import { DND_ITEM } from "./CtpPlantaPanel";
import { AsignarZonaModal } from "./ctp-planta-zona-modales";
import CtpPlantaCroquisBarra from "./CtpPlantaCroquisBarra";
import CtpPlantaCroquisConfigModal from "./CtpPlantaCroquisConfigModal";
import CtpPlantaCroquisControles, { CONTROLES_CSS } from "./CtpPlantaCroquisControles";
import CtpPlantaCroquisHoja from "./CtpPlantaCroquisHoja";
import { useCroquisPantallaCompleta } from "./hooks/use-croquis-pantalla-completa";
import CtpPlantaCroquisLeyendaRutas from "./CtpPlantaCroquisLeyendaRutas";
import CtpPlantaCroquisLeyendaCategorias, { CroquisPatrones } from "./CtpPlantaCroquisLeyendaCategorias";
import { useCroquisIdentificar } from "./hooks/use-croquis-identificar";
import { useCroquisLeaflet, type MarcaCroquis, type SeleccionCroquis } from "./hooks/use-croquis-leaflet";
import { useCroquisDibujo } from "./hooks/use-croquis-dibujo";

export interface CtpPlantaCroquisMapaProps {
  croquis: PlantaCroquis | null;
  /** Solo las zonas del croquis. */
  zonas: PlantaZona[];
  items: Item[];
  contenido: Record<string, ContenidoZona>;
  enMano: Item | null;
  /** Lo que estaba en la mano cayó en una zona (con el punto, si se sabe). */
  onSoltarEnZona: (zonaId: string, p?: Punto) => void;
  onAviso: (msg: string) => void;
  seleccion: SeleccionCroquis | null;
  onSeleccion: (s: SeleccionCroquis | null) => void;
  zonaResaltada: string | null;
  irA: { zonaId: string; n: number } | null;
  recien: string | null;
  onAsignar: (asigs: AsignacionPlanta[]) => void;
  onMoverMaquina: (m: MaquinaPlanta) => void;
  onGuardarCroquis: (c: PlantaCroquis, imagen?: { imagenRef: string | null }) => Promise<boolean>;
  onChanged: () => void;
  /** La ficha de lo tocado: en pantalla completa se muestra como hoja inferior. */
  ficha?: ReactNode;
  onPantallaCompleta?: (abierta: boolean) => void;
}

/** styled-jsx exige un identificador (no una expresión) dentro del <style>. */
const CSS_LIENZO = CROQUIS_CSS + CONTROLES_CSS;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Sugerencia de código por tipo (PT-01, AS-01…) para la próxima zona del croquis. */
function sugerirCodigo(zonas: PlantaZona[], tipo: PlantaZona["tipo"]): string {
  const pre = { entrada: "EN", patio_trozas: "PT", aserrado: "AS", secado: "SC", patio_producto: "PP", reserva: "RS", despacho: "DS", oficina: "OF", otro: "Z" }[tipo];
  const nums = zonas.map((z) => new RegExp(`^${pre}-?(\\d+)`, "i").exec(z.codigo)).filter((m): m is RegExpExecArray => !!m).map((m) => parseInt(m[1], 10));
  return `${pre}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
}

export default function CtpPlantaCroquisMapa(props: CtpPlantaCroquisMapaProps) {
  const [config, setConfig] = useState(false);
  return (
    <>
      {props.croquis ? (
        <Lienzo {...props} croquis={props.croquis} onConfigurar={() => setConfig(true)} />
      ) : (
        <div className="grid min-h-[22rem] place-items-center rounded-2xl border border-dashed border-[var(--rule-strong)] bg-[var(--surface-sunken)] p-6 text-center">
          <div className="max-w-xs">
            <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"><MapIcon className="h-6 w-6" /></span>
            <p className="flex items-center justify-center gap-1 text-sm font-bold text-[var(--text-primary)]">
              Tu aserradero todavía no tiene croquis
              <InfoTip title="Croquis" what="El plano de tu planta en metros, con su imagen de fondo: sobre él ubicas cada pila, cada troza y cada máquina." example="Terreno de 54 × 48 m con la lámina del plano." />
            </p>
            <button type="button" onClick={() => setConfig(true)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90"><Settings2 className="h-4 w-4" />Configurar croquis</button>
          </div>
        </div>
      )}
      {config && <CtpPlantaCroquisConfigModal croquis={props.croquis} onClose={() => setConfig(false)} onGuardar={props.onGuardarCroquis} onZonasCreadas={props.onChanged} />}
      {/* Los rayados de la simbología (ramada, cemento): el mapa, las muestras y la revisión del PDF los usan. */}
      <CroquisPatrones />
      {/* Leaflet inserta el HTML de las marcas fuera del árbol de React: el CSS va global. */}
      <style jsx global>{MARCA_CSS}</style>
    </>
  );
}

function Lienzo(props: CtpPlantaCroquisMapaProps & { croquis: PlantaCroquis; onConfigurar: () => void }) {
  const { croquis, zonas, items, contenido, enMano, onSoltarEnZona, onAviso, seleccion, onSeleccion, zonaResaltada, irA, recien, onAsignar, onMoverMaquina, onChanged } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- instancias Leaflet (import dinámico)
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [filtros, setFiltros] = useState<FiltrosCroquis>(FILTROS_VACIOS);
  /** Entrada de la leyenda que se está mirando (`cat:maquinaria`, `tipo:otro`): el resto se atenúa. */
  const [filtroLeyenda, setFiltroLeyenda] = useState<string | null>(null);
  const ident = useCroquisIdentificar(zonas, onChanged, onAviso);
  const [flujo, setFlujo] = useLocalStorage<boolean>("ctp-croquis-flujo", false);
  const [etiquetas, setEtiquetas] = useState(true);
  const { abierta: fullscreen, cerrar: cerrarFull, alternar: alternarFull } = useCroquisPantallaCompleta();
  const [hojaBaja, setHojaBaja] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);
  // Celular: el plano toma todo el ancho y un dedo no se pelea con el scroll de la página.
  const movil = useMediaQuery("(max-width: 767px)");
  const tactil = useMediaQuery("(max-width: 767px) and (pointer: coarse)");
  /** Zona bajo el puntero mientras se arrastra algo desde la lista. */
  const [sobre, setSobre] = useState<string | null>(null);
  const opciones = useMemo(() => opcionesDeFiltro(items), [items]);
  const rutas = rutasDelPlano(croquis);
  const dibujo = useCroquisDibujo({ LRef, mapRef, croquis, zonas, onChanged });

  const leaflet = useCroquisLeaflet(containerRef, { LRef, mapRef }, {
    croquis, zonas, contenido, filtros, filtroLeyenda, mostrarFlujo: flujo, mostrarEtiquetas: etiquetas, seleccion,
    resaltada: sobre ?? zonaResaltada, recien, dibujando: dibujo.modo === "dibujar",
    arrastrarUnDedo: !tactil || fullscreen, ajustado: movil,
    onTocarFondo: dibujo.agregarPunto,
    onTocarZona: (zid, p) => {
      if (dibujo.modo === "editar") { dibujo.editarZona(zid); return; }
      if (enMano) { onSoltarEnZona(zid, [r1(p[0]), r1(p[1])]); return; }
      onSeleccion({ tipo: "zona", id: zid });
    },
    onTocarMarca: (m: MarcaCroquis) => {
      if (dibujo.modo !== "ver") return;
      // Con algo en la mano, tocar una pila que ya está ubicada lo pone en esa zona.
      if (enMano) { onSoltarEnZona(m.zonaId); return; }
      onSeleccion({ tipo: m.tipo, id: m.id });
    },
    onTocarMaquina: (codigo) => onSeleccion({ tipo: "maquina", id: codigo }),
    onMoverMarca: (m, zid, p) => {
      onAsignar([{ clave: m.tipo === "pila" ? m.id : claveTroza(m.id), zonaId: zid, lat: r1(p[0]), lng: r1(p[1]) }]);
      if (zid !== m.zonaId) { const z = zonas.find((x) => x.id === zid); onAviso(`Movido a ${z ? `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}` : "otra zona"}`); }
    },
    onMarcaAfuera: () => onAviso("Ese punto no está dentro de ninguna zona del croquis: la marca vuelve a su lugar."),
    onDestinoSinMadera: (zid) => { const z = zonas.find((x) => x.id === zid); onAviso(`${z ? z.codigo : "Esa zona"} no guarda madera (según la leyenda del plano): la marca vuelve a su lugar.`); },
    onMoverMaquina,
  });

  const { irAZona, invalidar, encuadrar } = leaflet;
  useEffect(() => { if (irA?.zonaId) irAZona(irA.zonaId); }, [irA, irAZona]);

  // Pantalla completa: Leaflet vuelve a medir su caja; Escape (o «atrás») sale,
  // el foco queda adentro y la página de atrás no se mueve (useModalAccesible).
  useModalAccesible(cajaRef, { activo: fullscreen, onCerrar: cerrarFull });
  const { onPantallaCompleta } = props;
  useEffect(() => { onPantallaCompleta?.(fullscreen); }, [fullscreen, onPantallaCompleta]);
  useEffect(() => { const t = setTimeout(() => { invalidar(); encuadrar(); }, 220); return () => clearTimeout(t); }, [fullscreen, invalidar, encuadrar]);
  // La hoja vuelve a abrirse con cada cosa nueva que se toca, y baja sola al ubicar (hay que ver el plano).
  useEffect(() => { setHojaBaja(false); }, [seleccion]);
  useEffect(() => { if (enMano) setHojaBaja(true); }, [enMano]);
  // Con algo en la mano hay que tocar una zona: si el plano quedó fuera de la pantalla, se lo trae.
  useEffect(() => { if (enMano && !fullscreen) containerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [enMano, fullscreen]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(DND_ITEM)) return;
    e.preventDefault(); // sin esto el navegador rechaza el drop
    e.dataTransfer.dropEffect = "move";
    setSobre(leaflet.zonaEnPunto(e.clientX, e.clientY)?.zonaId ?? null);
  }, [leaflet]);
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(DND_ITEM)) return;
    e.preventDefault();
    setSobre(null);
    const hit = leaflet.zonaEnPunto(e.clientX, e.clientY);
    if (hit) onSoltarEnZona(hit.zonaId, [r1(hit.p[0]), r1(hit.p[1])]);
    else onAviso("Suéltalo DENTRO de una zona del croquis; ahí afuera no hay nada dibujado.");
  }, [leaflet, onSoltarEnZona, onAviso]);

  const cursor = dibujo.modo === "dibujar" ? "crosshair" : enMano ? "copy" : "";

  return (
    <div
      ref={cajaRef}
      role={fullscreen ? "dialog" : undefined} aria-modal={fullscreen ? true : undefined} aria-label={fullscreen ? "Croquis de la planta en pantalla completa" : undefined}
      className={fullscreen ? "fixed inset-0 z-dropdown flex flex-col gap-2 bg-[var(--surface-canvas)] px-2 pb-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4" : "space-y-2"}
    >
      <CtpPlantaCroquisBarra
        modo={dibujo.modo} resumenDibujo={dibujo.resumen} areaTexto={`${formatNumber(Math.round(dibujo.area))} m²`} nVerts={dibujo.nVerts} editSel={dibujo.editSel} guardando={dibujo.guardando}
        onDibujar={() => { onSeleccion(null); dibujo.iniciar(); }} onDeshacer={dibujo.deshacer} onTerminar={dibujo.terminar} onCancelar={dibujo.cancelar}
        onEditar={() => { onSeleccion(null); dibujo.iniciarEdicion(); }} onGuardarEdicion={() => void dibujo.guardarEdicion()}
        zonas={zonas} onIrA={irAZona}
        flujoDisponible={!!rutas} mostrarFlujo={flujo} onFlujo={() => setFlujo((v) => !v)}
        mostrarEtiquetas={etiquetas} onEtiquetas={() => setEtiquetas((v) => !v)}
        onConfigurar={props.onConfigurar} fullscreen={fullscreen} onFullscreen={alternarFull} compacta={fullscreen && movil}
        filtros={filtros} onFiltros={setFiltros} opciones={opciones}
      />
      <div className={fullscreen ? "relative min-h-0 flex-1" : "relative -mx-4 sm:mx-0"}>
        <div
          ref={containerRef}
          onDragOver={onDragOver}
          onDragLeave={() => setSobre(null)}
          onDrop={onDrop}
          // La caja toma la forma del terreno (+ la franja de «fuera»): con un
          // alto fijo sobraba una banda gris debajo del plano.
          style={fullscreen ? { height: "100%", cursor } : movil ? { aspectRatio: `${croquis.anchoM + (croquis.maquinas.some((m) => m.fuera) ? 6 : 0)} / ${croquis.altoM}`, maxHeight: "70svh", cursor } : { aspectRatio: `${croquis.anchoM + (croquis.maquinas.some((m) => m.fuera) ? 6 : 0) + 2} / ${croquis.altoM + 2}`, maxHeight: "78vh", minHeight: 320, cursor }}
          // className FIJO: Leaflet escribe sus clases en este div y un className
          // de React que cambia se las lleva puestas. Los estados van por data-*.
          data-dibujando={dibujo.modo === "dibujar" ? "1" : undefined}
          data-movil={movil ? "1" : undefined}
          className={`isolate w-full overflow-hidden border-y border-[var(--rule-base)] bg-[var(--surface-sunken)] sm:rounded-2xl sm:border`}
        />
        {enMano && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 sm:rounded-2xl ring-4 ring-inset ring-[var(--accent)]">
            <span className="absolute left-1/2 top-3 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white shadow-[var(--shadow-md)]">
              Toca la zona donde está {enMano.label}
            </span>
          </div>
        )}
        {leaflet.ready && zonas.length === 0 && dibujo.modo === "ver" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center px-4">
            <p className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] shadow-[var(--shadow-md)]">
              Dibuja las zonas sobre el plano
              <InfoTip title="Zonas del croquis" what="Toca «Dibujar zona», marca el contorno del patio de trozas, la sierra o el despacho, y asígnale su tipo." affects="El área sale del dibujo en metros." />
            </p>
          </div>
        )}
      </div>
      {leaflet.ready && movil && (
        <CtpPlantaCroquisControles
          onAcercar={leaflet.acercar} onAlejar={leaflet.alejar} onEncajar={encuadrar}
          fullscreen={fullscreen} onFullscreen={alternarFull} pista={tactil && !fullscreen}
        />
      )}
      {fullscreen && props.ficha && <CtpPlantaCroquisHoja minimizada={hojaBaja} onMinimizar={setHojaBaja}>{props.ficha}</CtpPlantaCroquisHoja>}
      {leaflet.ready && !(fullscreen && movil) && (
        <CtpPlantaCroquisLeyendaCategorias
          zonas={zonas} filtro={filtroLeyenda} onFiltro={setFiltroLeyenda} onIrA={irAZona}
          pendientes={ident.pendientes} identificando={ident.identificando} onIdentificar={() => void ident.identificar()}
        />
      )}
      {flujo && rutas && <CtpPlantaCroquisLeyendaRutas rutas={rutas} version={croquis.version} />}
      {dibujo.errorEdicion && <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-xs font-bold text-[var(--data-error-700)]">{dibujo.errorEdicion}</p>}

      <style jsx global>{CSS_LIENZO}</style>
      {dibujo.pendiente && (
        <AsignarZonaModal
          plano="croquis"
          poligono={dibujo.pendiente}
          suggest={(t) => sugerirCodigo(zonas, t)}
          onClose={() => dibujo.cerrarPendiente(false)}
          onSaved={() => dibujo.cerrarPendiente(true)}
        />
      )}
    </div>
  );
}
