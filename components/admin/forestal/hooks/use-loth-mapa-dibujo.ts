"use client";

/**
 * useLothMapaDibujo — todo lo que se DIBUJA sobre el mapa del Libro TH.
 *
 * Tres herramientas que comparten el clic del mapa y por eso tienen que
 * saberse entre ellas:
 *   · el polígono (área de aprovechamiento o contorno del predio: el MISMO
 *     borrador, vértices arrastrables y barra — sólo cambia dónde se guarda),
 *   · la vía (carretera, trocha o río), punto por punto,
 *   · la referencia del territorio, un clic y listo.
 *
 * Y la importación de coordenadas (`coordsOpen`), que carga el borrador del
 * área o el contorno del predio sin dibujar a mano.
 *
 * Por permiso (ADR-462, 02-10-2026): cada alcance tiene su borrador —cambiar
 * de permiso a mitad de un dibujo lo guarda y volver lo devuelve; antes el
 * borrador de un permiso se guardaba en el otro—. Con «Todos», cualquier
 * herramienta pregunta primero «¿En qué permiso?» (`pidiendoPermiso`):
 * elegirlo cambia la banda y la herramienta arranca cuando el área de ese
 * permiso ya se leyó. No se guarda nada «sin permiso» en silencio.
 */

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { polygonAreaHa, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { hullBuffer } from "@/lib/forestal/loth-utm";
import type { LothCartografia } from "@/lib/forestal/loth-cartografia";
import { alcanceDelPermiso, claveAlcance, type AlcanceMapa } from "../loth-mapa-alcance";

export type DestinoDibujo = "area" | "predio";

/** Lo que con «Todos» pide elegir el permiso antes de empezar (ADR-462 §3). */
export type AccionConPermiso = "area" | "predio" | "via" | "referencia" | "pegar-area" | "pegar-predio";

interface Deps {
  parcela: LothParcela;
  /** El área que se ve es la del negocio (el permiso todavía no tiene la suya). */
  heredada?: boolean;
  carto: LothCartografia;
  setCarto: Dispatch<SetStateAction<LothCartografia>>;
  persistParcela: (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => Promise<void>;
  guardarCartografia: (siguiente?: LothCartografia) => Promise<unknown>;
  /** Árboles del censo ya proyectados: la envolvente arranca de ellos. */
  censo: { lat: number; lng: number }[];
  /** De qué permiso es lo que se dibuja; cada alcance guarda su borrador. */
  alcance?: AlcanceMapa;
  /** El alcance que se mira ya se leyó: recién ahí arranca lo que esperaba «¿En qué permiso?». */
  geoListo?: boolean;
  /** Cambia el permiso de la banda. Sin él (fuera del libro) no se pregunta nada. */
  elegirPlan?: ((id: string | null) => void) | null;
  setError?: (m: string | null) => void;
}

/** El borrador de UN alcance: cambiar de permiso lo guarda y volver lo devuelve. */
interface Borrador {
  drawTarget: DestinoDibujo;
  drawMode: boolean;
  draft: LatLng[];
  /** Traza en curso del modo "dibujar vía" (null = inactivo). */
  viaDraft: LatLng[] | null;
  markMode: boolean;
}

const SIN_BORRADOR: Borrador = { drawTarget: "area", drawMode: false, draft: [], viaDraft: null, markMode: false };
const DEL_NEGOCIO: AlcanceMapa = { tipo: "negocio" };

export function useLothMapaDibujo({
  parcela,
  heredada = false,
  carto,
  setCarto,
  persistParcela,
  guardarCartografia,
  censo,
  alcance = DEL_NEGOCIO,
  geoListo = true,
  elegirPlan = null,
  setError,
}: Deps) {
  const { confirm } = useConfirm();
  const clave = claveAlcance(alcance);
  const [porClave, setPorClave] = useState<Record<string, Borrador>>({});
  const { drawTarget, drawMode, draft, viaDraft, markMode } = porClave[clave] ?? SIN_BORRADOR;
  /** Cambia el borrador del alcance que se mira (las respuestas tardías no cruzan de permiso). */
  const cambiar = useCallback((f: (b: Borrador) => Borrador) => setPorClave((m) => ({ ...m, [clave]: f(m[clave] ?? SIN_BORRADOR) })), [clave]);
  const setDraft = useCallback((v: SetStateAction<LatLng[]>) => cambiar((b) => ({ ...b, draft: typeof v === "function" ? v(b.draft) : v })), [cambiar]);
  const setViaDraft = useCallback(
    (v: SetStateAction<LatLng[] | null>) => cambiar((b) => ({ ...b, viaDraft: typeof v === "function" ? v(b.viaDraft) : v })),
    [cambiar],
  );
  /** A dónde van los vértices que se peguen: al área declarada o al predio. */
  const [coordsOpen, abrirCoords] = useState<null | DestinoDibujo>(null);

  /* «Todos»: lo que se dibuja pide antes su permiso, que pasa a ser el de la banda. */
  const pideElegir = alcance.tipo === "todos" && !!elegirPlan;
  const [pidiendoPermiso, setPidiendo] = useState<AccionConPermiso | null>(null);
  const [pendiente, setPendiente] = useState<{ accion: AccionConPermiso; destino: string } | null>(null);

  const startDrawAhora = useCallback(
    () => cambiar((b) => ({ ...b, drawTarget: "area", draft: parcela.vertices.slice(), drawMode: true })),
    [cambiar, parcela.vertices],
  );
  const startDrawPredioAhora = useCallback(
    () => cambiar((b) => ({ ...b, drawTarget: "predio", draft: carto.predio.vertices.slice(), drawMode: true })),
    [cambiar, carto.predio.vertices],
  );
  const importarAreaAhora = useCallback(() => {
    if (!drawMode) startDrawAhora();
    abrirCoords("area");
  }, [drawMode, startDrawAhora]);

  const ejecutar = useCallback(
    (accion: AccionConPermiso) => {
      if (accion === "area") startDrawAhora();
      else if (accion === "predio") startDrawPredioAhora();
      else if (accion === "via") cambiar((b) => ({ ...b, viaDraft: [] }));
      else if (accion === "referencia") cambiar((b) => ({ ...b, markMode: true }));
      else if (accion === "pegar-area") importarAreaAhora();
      else abrirCoords("predio");
    },
    [startDrawAhora, startDrawPredioAhora, importarAreaAhora, cambiar],
  );

  /** La acción esperaba el permiso: arranca cuando su área y su cartografía ya se leyeron. */
  useEffect(() => {
    if (!pendiente || pendiente.destino !== clave || !geoListo) return;
    setPendiente(null);
    ejecutar(pendiente.accion);
  }, [pendiente, clave, geoListo, ejecutar]);

  /* Si la banda dejó «Todos» por otro lado, la pregunta ya no aplica. */
  useEffect(() => {
    if (!pideElegir) setPidiendo(null);
  }, [pideElegir]);

  /** Con «Todos», pregunta; si no, lo hace. */
  const conPermiso = useCallback(
    (accion: AccionConPermiso) => {
      if (pideElegir) setPidiendo(accion);
      else ejecutar(accion);
    },
    [pideElegir, ejecutar],
  );

  const elegirPermisoPara = useCallback(
    (id: string) => {
      if (!pidiendoPermiso || !elegirPlan) return;
      setPendiente({ accion: pidiendoPermiso, destino: claveAlcance(alcanceDelPermiso(true, id)) });
      setPidiendo(null);
      elegirPlan(id);
    },
    [pidiendoPermiso, elegirPlan],
  );
  const cancelarPermiso = useCallback(() => setPidiendo(null), []);

  const startDraw = useCallback(() => conPermiso("area"), [conPermiso]);
  /** Levantar el contorno del predio a mano (o corregir el que ya está). */
  const startDrawPredio = useCallback(() => conPermiso("predio"), [conPermiso]);

  const setMarkMode = useCallback(
    (v: SetStateAction<boolean>) => {
      const sig = typeof v === "function" ? v(markMode) : v;
      if (sig && pideElegir) setPidiendo("referencia");
      else cambiar((b) => ({ ...b, markMode: sig }));
    },
    [markMode, pideElegir, cambiar],
  );

  const setCoordsOpen = useCallback(
    (d: null | DestinoDibujo) => {
      if (d && pideElegir) setPidiendo(d === "predio" ? "pegar-predio" : "pegar-area");
      else abrirCoords(d);
    },
    [pideElegir],
  );

  const cancelDraw = useCallback(() => cambiar((b) => ({ ...b, drawMode: false, draft: [] })), [cambiar]);

  const saveDraw = async () => {
    if (draft.length < 3) return;
    if (drawTarget === "predio") {
      // El predio vive en la cartografía: se guarda ahí y se persiste en el
      // mismo PUT que las referencias y las vías.
      const siguiente = { ...carto, predio: { ...carto.predio, vertices: draft } };
      setCarto(siguiente);
      await guardarCartografia(siguiente);
    } else {
      await persistParcela({ vertices: draft, nota: parcela.nota, deforestacionCero: parcela.deforestacionCero });
    }
    cambiar((b) => ({ ...b, drawMode: false, draft: [] }));
  };

  const clearParcela = useCallback(async () => {
    if (pideElegir) {
      setError?.("Con «Todos» no se borra ningún área: elige su permiso en la banda.");
      return;
    }
    if (heredada) {
      setError?.("Esta área es la del negocio: para quitarla, elige «Líneas sin permiso» en la banda.");
      return;
    }
    // El polígono sostiene el área declarada, el cross-check del POA y el DDS
    // de EUDR: borrarlo no es un "ok" al pasar, va con el diálogo del DS.
    const ok = await confirm({
      title: "¿Borrar el polígono del área de aprovechamiento?",
      description:
        "Se pierden los vértices dibujados y con ellos el área calculada, el cross-check contra el POA y la geometría del expediente EUDR. Vas a tener que volver a dibujarlo o importarlo.",
      intent: "danger",
      confirmLabel: "Sí, borrar el polígono",
    });
    if (!ok) return;
    await persistParcela({ vertices: [], nota: "", deforestacionCero: false });
  }, [persistParcela, confirm, pideElegir, heredada, setError]);

  const toggleDeforestacion = useCallback(
    (v: boolean) => persistParcela({ vertices: parcela.vertices, nota: parcela.nota, deforestacionCero: v }),
    [persistParcela, parcela.vertices, parcela.nota],
  );

  /** Envolvente del censo + franja de 60 m: polígono de arranque, editable a mano. */
  const envolverCenso = () => {
    if (censo.length === 0) return;
    const ring = hullBuffer(censo.map((t): LatLng => [t.lat, t.lng]), 60);
    if (ring.length >= 3) setDraft(ring);
  };

  const addVertex = useCallback((v: LatLng) => setDraft((d) => [...d, v]), [setDraft]);
  const moveVertex = useCallback((i: number, v: LatLng) => setDraft((d) => d.map((old, idx) => (idx === i ? v : old))), [setDraft]);
  const deleteVertex = useCallback((i: number) => setDraft((d) => d.filter((_, idx) => idx !== i)), [setDraft]);
  const insertVertex = useCallback((i: number, v: LatLng) => setDraft((d) => [...d.slice(0, i), v, ...d.slice(i)]), [setDraft]);
  const undoVertex = useCallback(() => setDraft((d) => d.slice(0, -1)), [setDraft]);

  /** Marca una referencia donde el usuario tocó (se renombra en el bloque de referencias). */
  const marcarReferencia = useCallback(
    (v: LatLng) => {
      setCarto((c) => ({
        ...c,
        referencias: [
          ...c.referencias,
          {
            id: `ref-${c.referencias.length + 1}-${c.referencias.length}`,
            nombre: `Referencia ${c.referencias.length + 1}`,
            tipo: "centro_poblado" as const,
            lat: v[0],
            lng: v[1],
            nota: "",
          },
        ],
      }));
      cambiar((b) => ({ ...b, markMode: false }));
    },
    [setCarto, cambiar],
  );

  const addViaPoint = useCallback((v: LatLng) => setViaDraft((d) => [...(d ?? []), v]), [setViaDraft]);

  /** Cierra el trazado y suma la vía a la cartografía (se nombra en el bloque de vías). */
  const terminarVia = () => {
    const pts = viaDraft ?? [];
    if (pts.length >= 2) {
      setCarto((c) => ({
        ...c,
        vias: [
          ...c.vias,
          { id: `via-${c.vias.length + 1}-${c.vias.length}`, nombre: `Vía ${c.vias.length + 1}`, tipo: "acceso" as const, puntos: pts },
        ],
      }));
    }
    setViaDraft(null);
  };

  const iniciarVia = () => conPermiso("via");
  const deshacerVia = () => setViaDraft((d) => (d ? d.slice(0, -1) : d));
  const cancelarVia = () => setViaDraft(null);

  /** Lo que llega del modal de coordenadas. */
  const aplicarCoordenadas = (vertices: LatLng[]) => {
    if (coordsOpen === "predio") {
      // El predio se guarda derecho: no pasa por el borrador del área, que
      // tiene su propio flujo de dibujo y confirmación.
      setCarto((c) => ({ ...c, predio: { ...c.predio, vertices } }));
      return;
    }
    cambiar((b) => ({ ...b, drawMode: true, draft: vertices }));
  };

  /** Importar al área: entra al dibujo (si no estaba) y abre el pegado. */
  const importarArea = () => conPermiso("pegar-area");

  return {
    drawTarget,
    drawMode,
    draft,
    draftAreaHa: draft.length >= 3 ? polygonAreaHa(draft) : 0,
    startDraw,
    startDrawPredio,
    cancelDraw,
    saveDraw,
    clearParcela,
    toggleDeforestacion,
    envolverCenso,
    addVertex,
    moveVertex,
    deleteVertex,
    insertVertex,
    undoVertex,
    markMode,
    setMarkMode,
    marcarReferencia,
    viaDraft,
    addViaPoint,
    iniciarVia,
    deshacerVia,
    cancelarVia,
    terminarVia,
    coordsOpen,
    setCoordsOpen,
    aplicarCoordenadas,
    importarArea,
    /** Con «Todos»: qué se quiso dibujar mientras se espera el permiso. */
    pidiendoPermiso,
    elegirPermisoPara,
    cancelarPermiso,
  };
}

export type LothMapaDibujo = ReturnType<typeof useLothMapaDibujo>;
