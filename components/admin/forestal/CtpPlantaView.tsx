"use client";

/**
 * CtpPlantaView — pestaña "Planta" del Libro CTP: el mapa del aserradero (ADR-142).
 *
 * Junta el gemelo espacial con lo que dice el Libro AHORA: cuánta materia prima
 * hay en patio, cuánto se consumió y cuánto producto terminado espera despacho.
 * Así el operador ve DÓNDE están las cosas (mapa) y CUÁNTO hay moviéndose
 * (Libro) en una sola vista.
 *
 * Dos capas (ADR-465, 2026-10-03): el CROQUIS del aserradero en metros —por
 * defecto si el negocio tiene uno; ahí se ubica la pila entera o la troza
 * separada— y el SATÉLITE de siempre. La elección se recuerda por navegador.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { AlertCircle, RefreshCw, Printer, X, Truck, Map as MapIcon, Satellite } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { contenidoPorZona, type Punto } from "@/lib/forestal/planta-croquis";
import type { Item, ItemKind, MaquinaPlanta, PlanoPlanta, PlantaZona, ZonaInv } from "@/lib/forestal/planta-zona-types";
import { printPlantaPlano } from "@/lib/forestal/planta-plano-print";
import CtpPlantaMapa from "./CtpPlantaMapa";
import CtpPlantaCroquisMapa from "./CtpPlantaCroquisMapa";
import CtpPlantaCroquisFicha from "./CtpPlantaCroquisFicha";
import CtpPlantaPanel from "./CtpPlantaPanel";
import CtpPlantaEspecies from "./CtpPlantaEspecies";
import CtpPlantaZonas from "./CtpPlantaZonas";
import CtpPlantaIndicadores from "./CtpPlantaIndicadores";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpPlantaReservaModal from "./CtpPlantaReservaModal";
import CtpDocumentoVisor from "./CtpDocumentoVisor";
import { ZonaFichaModal } from "./ctp-planta-zona-modales";
import { usePlantaDatos } from "./hooks/use-planta-datos";
import { usePlantaUbicados } from "./hooks/use-planta-ubicados";
import { useCroquisImprimir } from "./hooks/use-croquis-imprimir";
import type { SeleccionCroquis } from "./hooks/use-croquis-leaflet";

export type { Item, ItemKind, ZonaInv };

const BTN = "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60";

export default function CtpPlantaView({ period }: { period: CtpPeriod }) {
  const [pref, setPref] = useLocalStorage<PlanoPlanta | null>("ctp-planta-plano", null);
  /** Sin preferencia, se arranca en el croquis hasta saber que el negocio no tiene uno. */
  const [sinCroquis, setSinCroquis] = useState(false);
  const plano: PlanoPlanta = pref ?? (sinCroquis ? "satelite" : "croquis");
  const datos = usePlantaDatos(period, plano);
  const { zonas, items, ubicaciones, croquis, saldos, loading, error, setError, load, asignar } = datos;
  useEffect(() => { if (!pref && datos.croquisSabido && !croquis) setSinCroquis(true); }, [pref, datos.croquisSabido, croquis]);

  const zonasCroquis = useMemo(() => zonas.filter((z) => z.plano === "croquis"), [zonas]);
  const zonasSat = useMemo(() => zonas.filter((z) => z.plano !== "croquis"), [zonas]);
  const sat = usePlantaUbicados(items, zonasSat, ubicaciones);
  const cro = usePlantaUbicados(items, zonasCroquis, ubicaciones);
  const u = plano === "croquis" ? cro : sat;
  const zonasActivas = plano === "croquis" ? zonasCroquis : zonasSat;
  const contenido = useMemo(() => contenidoPorZona(items, ubicaciones, new Set(zonasCroquis.map((z) => z.id))), [items, ubicaciones, zonasCroquis]);
  const hoja = useCroquisImprimir({ croquis, zonas: zonasCroquis, contenido });

  /** El ítem tomado (de la lista o de una ficha), esperando que se toque una zona. */
  const [enMano, setEnMano] = useState<Item | null>(null);
  /** Zona destacada mientras el puntero pasa por su ítem en la lista. */
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [irA, setIrA] = useState<{ zonaId: string; n: number } | null>(null);
  /** Aviso de operación (soltar afuera, ubicado OK) — efímero, no es un error. */
  const [aviso, setAviso] = useState<string | null>(null);
  /** El último ubicado: su chapita entra al mapa con la animación de caída. */
  const [recien, setRecien] = useState<string | null>(null);
  /** Lo tocado en el croquis: su ficha reemplaza a la lista mientras está abierta. */
  const [seleccion, setSeleccion] = useState<SeleccionCroquis | null>(null);
  /** Croquis a pantalla completa: la ficha pasa a su hoja inferior. */
  const [croquisFull, setCroquisFull] = useState(false);
  const [zonaEditando, setZonaEditando] = useState<PlantaZona | null>(null);
  const [bloque, setBloque] = useState<{ corridas: string[]; titulo: string } | null>(null);
  const [despachando, setDespachando] = useState<{ uids: string[]; destino: string } | null>(null);
  const irAZona = useCallback((zid: string) => setIrA((p) => ({ zonaId: zid, n: (p?.n ?? 0) + 1 })), []);

  /**
   * Lo que estaba en la mano cayó en una zona. Confirma con el nombre de la
   * zona: en un mapa con seis polígonos parecidos, «listo» no alcanza para saber
   * si fue donde el operador quería. En el croquis viaja también el punto.
   */
  const soltarEnZona = useCallback((zonaId: string, p?: Punto) => {
    const it = enMano;
    if (!it) return;
    setEnMano(null);
    const z = zonas.find((x) => x.id === zonaId);
    setAviso(`${it.label} → ${z ? `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}` : "la zona"}`);
    setRecien(it.id);
    void asignar([{ clave: it.id, zonaId, ...(p ? { lat: p[0], lng: p[1] } : {}) }]);
  }, [enMano, zonas, asignar]);

  // Escape suelta lo que se tenga en la mano; si no hay nada, cierra la ficha
  // (salvo que haya un diálogo abierto: ese Escape es suyo).
  useEffect(() => {
    if (!enMano && !seleccion) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (enMano) setEnMano(null);
      else if (!document.querySelector("[role='dialog']")) setSeleccion(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enMano, seleccion]);

  // El aviso se va solo: es un acuse, no algo que haya que cerrar a mano.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /** Toda la aserrada disponible: es lo que puede subir a un camión hoy. */
  const corridasAserradas = useMemo(() => items.filter((it) => it.kind === "producto").map((it) => it.id), [items]);

  /**
   * Emitir la guía de una cancha de reserva: el modal se abre con las corridas
   * apiladas ahí ya tildadas y el nombre de la cancha como destinatario. Lo que
   * el operador decidió al apartar la madera no se vuelve a decidir.
   */
  const abrirDespacho = useCallback((zonaId: string) => {
    const z = zonas.find((x) => x.id === zonaId);
    const corridas = (u.itemsPorZona[zonaId] ?? []).filter((it) => it.kind === "producto").map((it) => it.id);
    if (!z || corridas.length === 0) { setAviso("Esa cancha no tiene madera aserrada para despachar."); return; }
    setBloque({ corridas, titulo: `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}` });
  }, [zonas, u.itemsPorZona]);

  const moverMaquina = useCallback((m: MaquinaPlanta) => {
    if (!croquis) return;
    void datos.guardarCroquis({ ...croquis, maquinas: croquis.maquinas.map((x) => (x.codigo === m.codigo ? m : x)), actualizadoEn: new Date().toISOString() });
  }, [croquis, datos]);

  const verCroquis = plano === "croquis";
  const fichaCroquis = verCroquis && seleccion ? (
    <CtpPlantaCroquisFicha
      seleccion={seleccion} zonaById={cro.zonaById} items={items} contenido={contenido} ubicaciones={ubicaciones} croquis={croquis}
      onCerrar={() => setSeleccion(null)} onAbrir={setSeleccion} onEnMano={setEnMano}
      onAsignar={(a) => void asignar(a)} onEditarZona={setZonaEditando} onDespachar={abrirDespacho} onMoverMaquina={moverMaquina}
    />
  ) : null;
  const decidiendo = !pref && !datos.croquisSabido && loading;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-tertiary)]" title="El croquis o el satélite muestran dónde está la madera; el Libro, cuánta se mueve.">
          <strong className="text-[var(--text-secondary)]">Mapa de tu aserradero.</strong> El mapa dice <em>dónde</em> está la madera; el Libro, <em>cuánta</em>.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <SegmentedControl<PlanoPlanta>
            size="sm" label="Capa del mapa" value={plano} onChange={(v) => { setPref(v); setSeleccion(null); }}
            options={[{ value: "croquis", label: "Croquis", icon: <MapIcon className="h-4 w-4" /> }, { value: "satelite", label: "Satélite", icon: <Satellite className="h-4 w-4" /> }]}
          />
          {/* El acto que se hace todos los días va PRIMERO y siempre visible.
              Antes sólo aparecía dentro de una cancha de reserva: si nunca
              habías dibujado una, no existía en ninguna parte de la pantalla. */}
          {corridasAserradas.length > 0 && (
            <button
              type="button"
              onClick={() => setBloque({ corridas: corridasAserradas, titulo: "Despachar aserrada de la planta" })}
              title="Elige qué paquetes suben al camión y registra su guía sin salir de acá"
              aria-label="Nuevo despacho"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--accent-600)]"
            ><Truck className="h-4 w-4" /><span className="hidden sm:inline">Nuevo despacho</span></button>
          )}
          <button
            type="button"
            // Con el croquis a la vista se imprime el CROQUIS (hoja A4 apaisada con
            // vista previa); con el satélite, el plano satelital de siempre.
            onClick={() => {
              if (verCroquis) { void hoja.abrir().then((motivo) => { if (motivo) setAviso(motivo); }); return; }
              try { printPlantaPlano({ zonas: zonasSat, invByZona: sat.invObj, areaTotalM2: sat.areaTotal, periodLabel: period.label }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            }}
            disabled={hoja.armando}
            title={verCroquis ? "Imprimir el croquis (zonas con lo que tienen, pilas, máquinas y rutas) en una hoja A4 apaisada" : "Imprimir el plano de la planta (satélite + zonas + inventario) para la visita de la ARFFS"}
            aria-label={verCroquis ? "Imprimir croquis" : "Imprimir plano"}
            className={BTN}
          ><Printer className="h-4 w-4" /><span className="hidden lg:inline">{verCroquis ? "Imprimir croquis" : "Imprimir plano"}</span></button>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Recargar" className={BTN}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span className="hidden lg:inline">Recargar</span></button>
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      <CtpPlantaIndicadores zonas={zonasActivas.length} areaTotal={u.areaTotal} saldos={saldos} period={period} />

      {/* Mapa + barra lateral: la lista de lo que hay para ubicar (o la ficha de
          lo tocado en el croquis) vive AL LADO del mapa, no debajo. Debajo de
          `xl` pasa abajo: el mapa necesita ancho para ser útil. */}
      <div className="grid gap-3 xl:grid-cols-[1fr_22rem]">
        {decidiendo ? (
          <div className="grid h-[480px] place-items-center rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]"><LoadingState message="Cargando el mapa de tu aserradero…" /></div>
        ) : verCroquis ? (
          <CtpPlantaCroquisMapa
            croquis={croquis} zonas={zonasCroquis} items={items} contenido={contenido}
            enMano={enMano} onSoltarEnZona={soltarEnZona} onAviso={setAviso}
            seleccion={seleccion} onSeleccion={setSeleccion} zonaResaltada={resaltada} irA={irA} recien={recien}
            onAsignar={(a) => void asignar(a)} onMoverMaquina={moverMaquina} onGuardarCroquis={datos.guardarCroquis} onChanged={load}
            ficha={fichaCroquis} onPantallaCompleta={setCroquisFull}
          />
        ) : (
          <CtpPlantaMapa
            zonas={zonasSat}
            inventario={sat.invObj}
            onChanged={load}
            enMano={enMano}
            onSoltarEnZona={soltarEnZona}
            onSoltarAfuera={() => setAviso("Suéltalo DENTRO de una zona dibujada; ahí afuera no hay nada mapeado.")}
            zonaResaltada={resaltada}
            irA={irA}
            ubicados={sat.ubicadosPorZona}
            recienUbicado={recien}
            posiciones={sat.posiciones}
            onMover={(id, pos) => { const zid = sat.asignaciones[id]; if (zid) void asignar([{ clave: id, zonaId: zid, lat: pos.lat, lng: pos.lng }]); }}
            onQuitar={(id) => void asignar([{ clave: id, zonaId: null }])}
            fichaDeItem={sat.fichaDeItem}
            fichaDeZona={sat.fichaDeZona}
            onDespachar={abrirDespacho}
          />
        )}
        {verCroquis && seleccion ? (
          croquisFull ? null : fichaCroquis
        ) : (
          <CtpPlantaPanel
            items={items}
            zonas={zonasActivas}
            asignaciones={u.asignaciones}
            enMano={enMano}
            onEnMano={setEnMano}
            onResaltar={setResaltada}
            onUbicar={(id, zid) => void asignar([{ clave: id, zonaId: zid }])}
            onUbicarLote={(k, zid) => void asignar(items.filter((it) => it.kind === k).map((it) => ({ clave: it.id, zonaId: zid })), `lote:${k}`)}
            onIrAZona={irAZona}
            ocupado={datos.ocupado}
            onDespachar={(corridas) => setBloque({ corridas, titulo: "Despachar lo elegido" })}
          />
        )}
      </div>

      {/* Primero se elige QUÉ sale del bloque; después se llena la guía. */}
      {bloque && (
        <CtpPlantaReservaModal
          titulo={bloque.titulo}
          corridas={bloque.corridas}
          onClose={() => setBloque(null)}
          onDespachar={(uids) => {
            const destino = bloque.titulo.split(" · ").slice(1).join(" · ") || bloque.titulo;
            setBloque(null);
            setDespachando({ uids, destino });
          }}
        />
      )}

      {despachando && (
        <CtpDespachoGuiaModal
          presetUids={despachando.uids}
          presetDestino={despachando.destino}
          onClose={() => setDespachando(null)}
          onSaved={(r) => {
            setDespachando(null);
            setAviso(`Guía registrada · ${r.lineas} ${r.lineas === 1 ? "línea" : "líneas"} del libro`);
            // Lo despachado deja de estar disponible: el mapa tiene que reflejarlo.
            void load();
          }}
        />
      )}

      {hoja.doc && <CtpDocumentoVisor documentos={[hoja.doc]} activo={0} onActivo={() => undefined} onClose={hoja.cerrar} />}
      {zonaEditando && (
        <ZonaFichaModal
          zona={zonaEditando}
          onClose={() => setZonaEditando(null)}
          onSaved={() => { setZonaEditando(null); void load(); }}
          onDeleted={() => { setZonaEditando(null); setSeleccion(null); void load(); }}
        />
      )}

      {aviso && (
        <p className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="shrink-0"><X className="h-4 w-4" /></button>
        </p>
      )}

      {/* Las dos lecturas del terreno, lado a lado: qué madera hay (por especie)
          y dónde entra (por zona). Apiladas ocupaban 1.100 px de scroll. */}
      <div className="grid gap-3 xl:grid-cols-2">
        <CtpPlantaEspecies items={items} ubicados={u.ubicadosCount} />
        <CtpPlantaZonas
          zonas={zonasActivas}
          itemsPorZona={u.itemsPorZona}
          onIrAZona={(zid) => { irAZona(zid); if (verCroquis) setSeleccion({ tipo: "zona", id: zid }); }}
          onDespachar={abrirDespacho}
        />
      </div>
    </div>
  );
}
