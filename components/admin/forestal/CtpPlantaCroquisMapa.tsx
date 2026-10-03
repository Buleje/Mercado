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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, Settings2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatNumber } from "@/lib/format";
import { FILTROS_VACIOS, opcionesDeFiltro, rutasDelPlano, type ContenidoZona, type FiltrosCroquis, type Punto } from "@/lib/forestal/planta-croquis";
import { CROQUIS_CSS } from "@/lib/forestal/planta-croquis-html";
import { MARCA_CSS } from "@/lib/forestal/planta-iconos";
import { ZONA_TIPOS, claveTroza, type AsignacionPlanta, type Item, type MaquinaPlanta, type PlantaCroquis, type PlantaZona } from "@/lib/forestal/planta-zona-types";
import { DND_ITEM } from "./CtpPlantaPanel";
import { AsignarZonaModal } from "./ctp-planta-zona-modales";
import CtpPlantaCroquisBarra from "./CtpPlantaCroquisBarra";
import CtpPlantaCroquisConfigModal from "./CtpPlantaCroquisConfigModal";
import CtpPlantaCroquisLeyendaRutas from "./CtpPlantaCroquisLeyendaRutas";
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
}

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
  const [flujo, setFlujo] = useLocalStorage<boolean>("ctp-croquis-flujo", false);
  const [etiquetas, setEtiquetas] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  /** Zona bajo el puntero mientras se arrastra algo desde la lista. */
  const [sobre, setSobre] = useState<string | null>(null);
  const opciones = useMemo(() => opcionesDeFiltro(items), [items]);
  const rutas = rutasDelPlano(croquis);
  const dibujo = useCroquisDibujo({ LRef, mapRef, croquis, zonas, onChanged });

  const leaflet = useCroquisLeaflet(containerRef, { LRef, mapRef }, {
    croquis, zonas, contenido, filtros, mostrarFlujo: flujo, mostrarEtiquetas: etiquetas, seleccion,
    resaltada: sobre ?? zonaResaltada, recien, dibujando: dibujo.modo === "dibujar",
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
    onMoverMaquina,
  });

  const { irAZona, invalidar, encuadrar } = leaflet;
  useEffect(() => { if (irA?.zonaId) irAZona(irA.zonaId); }, [irA, irAZona]);

  // Pantalla completa: Leaflet tiene que volver a medir su caja; Escape sale.
  useEffect(() => {
    const t = setTimeout(() => { invalidar(); encuadrar(); }, 220);
    if (!fullscreen) return () => clearTimeout(t);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !dibujo.pendiente) setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [fullscreen, invalidar, encuadrar, dibujo.pendiente]);

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

  const tiposPresentes = ZONA_TIPOS.filter((t) => zonas.some((z) => z.tipo === t.tipo));
  const cursor = dibujo.modo === "dibujar" ? "crosshair" : enMano ? "copy" : "";

  return (
    <div className={fullscreen ? "fixed inset-0 z-dropdown flex flex-col gap-3 bg-[var(--surface-canvas)] p-3 sm:p-4" : "space-y-2"}>
      <CtpPlantaCroquisBarra
        modo={dibujo.modo} resumenDibujo={dibujo.resumen} areaTexto={`${formatNumber(Math.round(dibujo.area))} m²`} nVerts={dibujo.nVerts} editSel={dibujo.editSel} guardando={dibujo.guardando}
        onDibujar={() => { onSeleccion(null); dibujo.iniciar(); }} onDeshacer={dibujo.deshacer} onTerminar={dibujo.terminar} onCancelar={dibujo.cancelar}
        onEditar={() => { onSeleccion(null); dibujo.iniciarEdicion(); }} onGuardarEdicion={() => void dibujo.guardarEdicion()}
        zonas={zonas} onIrA={irAZona}
        flujoDisponible={!!rutas} mostrarFlujo={flujo} onFlujo={() => setFlujo((v) => !v)}
        mostrarEtiquetas={etiquetas} onEtiquetas={() => setEtiquetas((v) => !v)}
        onConfigurar={props.onConfigurar} fullscreen={fullscreen} onFullscreen={() => setFullscreen((v) => !v)}
        filtros={filtros} onFiltros={setFiltros} opciones={opciones}
      />
      <div className={fullscreen ? "relative min-h-0 flex-1" : "relative"}>
        <div
          ref={containerRef}
          onDragOver={onDragOver}
          onDragLeave={() => setSobre(null)}
          onDrop={onDrop}
          // La caja toma la forma del terreno (+ la franja de «fuera»): con un
          // alto fijo sobraba una banda gris debajo del plano.
          style={fullscreen ? { height: "100%", cursor } : { aspectRatio: `${croquis.anchoM + (croquis.maquinas.some((m) => m.fuera) ? 6 : 0) + 2} / ${croquis.altoM + 2}`, maxHeight: "78vh", minHeight: 320, cursor }}
          // className FIJO: Leaflet escribe sus clases en este div y un className
          // de React que cambia se las lleva puestas. Los estados van por data-*.
          data-dibujando={dibujo.modo === "dibujar" ? "1" : undefined}
          className="isolate w-full overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]"
        />
        {enMano && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-4 ring-inset ring-[var(--accent)]">
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
        {leaflet.ready && tiposPresentes.length > 0 && (
          <details className="pointer-events-auto absolute right-3 top-3 z-10 hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-md)] sm:block [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Leyenda</summary>
            <div className="mt-1 space-y-0.5">
              {tiposPresentes.map((t) => <span key={t.tipo} className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.ring }} />{t.label}</span>)}
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-4 shrink-0 rounded-sm border-2 border-[var(--data-warning-500)] bg-[var(--text-primary)]" />Máquina (gris = fuera)</span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-4 shrink-0 rounded-full border-2 border-[var(--text-tertiary)] bg-[var(--surface-raised)]" />Troza separada</span>
            </div>
          </details>
        )}
      </div>
      {flujo && rutas && <CtpPlantaCroquisLeyendaRutas rutas={rutas} version={croquis.version} />}
      {dibujo.errorEdicion && <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-xs font-bold text-[var(--data-error-700)]">{dibujo.errorEdicion}</p>}

      <style jsx global>{CROQUIS_CSS}</style>
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
