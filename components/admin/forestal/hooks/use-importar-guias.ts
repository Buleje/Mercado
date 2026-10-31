"use client";

/**
 * use-importar-guias — «Importar guías despachadas» del Libro TH (ADR-461).
 *
 * Tres fases en un modal: ELEGIR las guías (las ya recibidas en el aserradero,
 * N° de registro SERFOR pegados o leídos de una foto) → VISTA PREVIA por guía,
 * agrupada por permiso (existente / se creará / elegir) → RESULTADO por guía.
 * El servidor arma todo (permiso, trozas, talas referenciales, avisos) y decide
 * al importar; acá sólo se elige y se confirma. Los totales de la vista previa
 * son una suma de lo que ya calculó el servidor por guía.
 *
 * Importar va DE A UNA guía por pedido, por fecha (como las revisa la vista
 * previa): cada guía es una transacción de 20 s a 100 s por el pooler, y así la
 * pantalla muestra el avance y se puede detener entre una y otra.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { normalizarNumeroRegistro } from "@/lib/forestal/serfor-gtf";
import {
  IMPORTAR_GUIAS_MAX,
  IMPORTAR_SERFOR_POR_PEDIDO,
  type ContextoTanda,
  type FuenteImportarGuia,
  type GuiaVistaPrevia,
  type ItemImportarGuia,
  type RespuestaCandidatas,
  type RespuestaImportar,
  type RespuestaVistaPrevia,
  type ResultadoImportarGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";
import { mezclarTanda, rehacerTanda } from "@/lib/forestal/loth-importar-guia-tanda";
import {
  agruparPorPermiso,
  claveDeGrupo,
  cuantasAlDirectorio,
  decisionInicial,
  decisionesDirectorioIniciales,
  enOrdenDeImportacion,
  esImportable,
  faltaMotivoDeCupo,
  pideMotivo,
  pedidoDirectorio,
  planNuevoCompleto,
  registrosDelTexto,
  respuestaDe,
  type DecisionFicha,
  type DecisionGrupo,
  type DecisionesDirectorio,
  type FaseImportar,
  type GrupoVista,
  type PestanaFuente,
} from "./importar-guias-pantalla";

const BASE = "/api/admin/forestal/loth/importar-guia";

// ── El hook ─────────────────────────────────────────────────────────────────

async function mensajeDe(r: Response, porDefecto: string): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  const frase = j?.error && /\s/.test(j.error) ? j.error : null;
  return j?.message ?? frase ?? porDefecto;
}

async function postJson<T>(url: string, body: unknown, porDefecto: string): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await mensajeDe(r, porDefecto));
  const j = await leerJson<T>(r);
  if (!j) throw new Error(porDefecto);
  return j;
}

/** Una guía que no volvió (red caída, servidor): queda rechazada con el motivo, las demás siguen. */
const falloDeRed = (g: GuiaVistaPrevia, mensaje: string): ResultadoImportarGuia => ({
  clave: g.clave,
  estado: "rechazada",
  mensaje,
  codigo: "sin_respuesta",
  gtfId: null,
  gtfNumber: g.guia?.gtfNumber ?? null,
  planId: null,
  planCreado: false,
  lineas: null,
  volumenM3: null,
});

interface Envio {
  enviando: boolean;
  /** La guía que se está importando ahora (para el avance). */
  actual: string | null;
  total: number;
  resultados: ResultadoImportarGuia[];
}
const ENVIO_VACIO: Envio = { enviando: false, actual: null, total: 0, resultados: [] };

export function useImportarGuias({ onImportadas }: { onImportadas: () => void }) {
  const [fase, setFase] = useState<FaseImportar>("elegir");
  const [pestanaElegida, setPestana] = useState<PestanaFuente | null>(null);
  const [candidatas, setCandidatas] = useState<{
    cargando: boolean;
    error: string | null;
    datos: RespuestaCandidatas | null;
  }>({
    cargando: true,
    error: null,
    datos: null,
  });
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState("");
  const [leidos, setLeidos] = useState<string[]>([]);
  const [vista, setVista] = useState<{
    cargando: boolean;
    error: string | null;
    guias: GuiaVistaPrevia[];
  }>({ cargando: false, error: null, guias: [] });
  /** Grupos que se están recalculando contra el plan elegido (ambiguo). */
  const [recalculando, setRecalculando] = useState<Set<string>>(new Set());
  const [decisiones, setDecisiones] = useState<Record<string, DecisionGrupo>>({});
  /** Qué se agrega o completa en el directorio, por guía (clave de la guía → ficha → decisión). */
  const [alDirectorio, setAlDirectorio] = useState<Record<string, DecisionesDirectorio>>({});
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  /** Lo que el servidor leyó por plan para T6/T9: con esto se rehace la tanda al marcar/desmarcar. */
  const [tanda, setTanda] = useState<ContextoTanda | null>(null);
  /** T9: el motivo escrito por guía (clave → texto) para pasar lo autorizado. */
  const [motivosCupo, setMotivosCupo] = useState<Record<string, string>>({});
  /** ADR-474: por guía, los códigos únicos (`12A (0000002)`) que la persona confirmó como OTRAS trozas. */
  const [renombresOk, setRenombresOk] = useState<Record<string, string[]>>({});
  const [envio, setEnvio] = useState<Envio>(ENVIO_VACIO);
  const pedido = useRef(0);
  /** «Detener»: termina la guía en curso y no manda la siguiente. También al cerrar el modal. */
  const detener = useRef(false);
  useEffect(() => () => void (detener.current = true), []);

  const cargarCandidatas = useCallback(async () => {
    setCandidatas((c) => ({ ...c, cargando: true, error: null }));
    try {
      const r = await fetch(`${BASE}/candidatas`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(await mensajeDe(r, "No se pudieron traer las guías recibidas."));
      const datos = await leerJson<RespuestaCandidatas>(r);
      setCandidatas({
        cargando: false,
        error: null,
        datos: datos ?? { grupos: [], total: 0, yaEnElLibro: 0 },
      });
    } catch (err) {
      logger.warn("[importar-guias] candidatas", { error: String(err) });
      setCandidatas({
        cargando: false,
        error: err instanceof Error ? err.message : String(err),
        datos: null,
      });
    }
  }, []);
  useEffect(() => void cargarCandidatas(), [cargarCandidatas]);

  /* Por defecto, las ya recibidas si hay; si no, el N° de registro. */
  const hayCandidatas = candidatas.cargando || (candidatas.datos?.total ?? 0) > 0;
  const pestana: PestanaFuente = pestanaElegida ?? (hayCandidatas ? "recibidas" : "registro");

  const alternar = useCallback((ids: readonly string[], on: boolean) => {
    setElegidas((prev) => {
      const s = new Set(prev);
      for (const id of ids) {
        if (on) s.add(id);
        else s.delete(id);
      }
      return s;
    });
  }, []);
  const sumarLeido = useCallback(
    (n: string) => setLeidos((ls) => (ls.includes(n) ? ls : [...ls, n])),
    [],
  );
  const quitarLeido = useCallback((n: string) => setLeidos((ls) => ls.filter((x) => x !== n)), []);

  /** Las guías elegidas, sin repetir: una recibida ya trae su ficha y no se vuelve a pedir a SERFOR. */
  const fuentes = useMemo<FuenteImportarGuia[]>(() => {
    const out: FuenteImportarGuia[] = [];
    const yaEstan = new Set<string>();
    for (const grupo of candidatas.datos?.grupos ?? []) {
      for (const g of grupo.guias) {
        if (!elegidas.has(g.woodEntryId)) continue;
        out.push({ tipo: "ctp", woodEntryId: g.woodEntryId });
        if (g.numeroRegistro) yaEstan.add(normalizarNumeroRegistro(g.numeroRegistro));
      }
    }
    for (const n of [...registrosDelTexto(texto).validos, ...leidos]) {
      if (yaEstan.has(n)) continue;
      yaEstan.add(n);
      out.push({ tipo: "serfor", numeroRegistro: n });
    }
    return out;
  }, [candidatas.datos, elegidas, texto, leidos]);

  const pedirVistaPrevia = useCallback(async () => {
    if (fuentes.length === 0 || fuentes.length > IMPORTAR_GUIAS_MAX) return;
    if (fuentes.filter((f) => f.tipo === "serfor").length > IMPORTAR_SERFOR_POR_PEDIDO) return;
    const mio = ++pedido.current;
    setVista({ cargando: true, error: null, guias: [] });
    setFase("vista");
    try {
      const j = await postJson<RespuestaVistaPrevia>(
        `${BASE}/vista-previa`,
        { fuentes },
        "No se pudo armar la vista previa. Prueba de nuevo.",
      );
      if (mio !== pedido.current) return;
      setDecisiones(
        Object.fromEntries(agruparPorPermiso(j.guias).map((g) => [g.clave, decisionInicial(g)])),
      );
      setExcluidas(new Set());
      setTanda(j.tanda ?? null);
      setMotivosCupo({});
      setRenombresOk({});
      setAlDirectorio(Object.fromEntries(j.guias.map((g) => [g.clave, decisionesDirectorioIniciales(g.directorio)])));
      setVista({ cargando: false, error: null, guias: j.guias });
    } catch (err) {
      if (mio !== pedido.current) return;
      logger.warn("[importar-guias] vista previa", { error: String(err) });
      setVista({
        cargando: false,
        error: err instanceof Error ? err.message : String(err),
        guias: [],
      });
    }
  }, [fuentes]);

  /* T6/T9 dependen de qué guías anteriores entran: se rehacen con las MARCADAS
     y el interruptor de cada grupo (la misma `rehacerTanda` que corre el servidor). */
  const guiasDeLaTanda = useMemo(
    () =>
      rehacerTanda(vista.guias, tanda, (g) => ({
        marcada: !excluidas.has(g.clave),
        crearTala: decisiones[claveDeGrupo(g)]?.crearTala ?? g.crearTalaPorDefecto,
      })),
    [vista.guias, tanda, excluidas, decisiones],
  );
  const grupos = useMemo(() => agruparPorPermiso(guiasDeLaTanda), [guiasDeLaTanda]);

  const decidir = useCallback((clave: string, cambio: Partial<DecisionGrupo>) => {
    setDecisiones((d) => {
      const actual = d[clave] ?? { destino: null, crearTala: false, talaTocada: false };
      return { ...d, [clave]: { ...actual, ...cambio } };
    });
  }, []);

  /**
   * Un permiso ambiguo recién elegido: la vista previa del grupo se vuelve a
   * pedir contra ESE plan (`planes`), para ver sus choques reales antes de importar.
   */
  const elegirPlanDelGrupo = useCallback(
    async (grupo: GrupoVista, planId: string, crearTala: boolean | undefined) => {
      decidir(grupo.clave, {
        destino: { tipo: "existente", planId },
        ...(crearTala == null ? {} : { crearTala }),
      });
      const mio = pedido.current;
      setRecalculando((s) => new Set(s).add(grupo.clave));
      try {
        const j = await postJson<RespuestaVistaPrevia>(
          `${BASE}/vista-previa`,
          { fuentes: grupo.guias.map((g) => g.fuente), planes: grupo.guias.map(() => planId) },
          "No se pudo revisar la guía contra ese permiso.",
        );
        if (mio !== pedido.current) return;
        const nuevas = new Map(j.guias.map((g) => [g.clave, g]));
        setVista((v) => ({ ...v, guias: v.guias.map((g) => nuevas.get(g.clave) ?? g) }));
        setTanda((t) => mezclarTanda(t, j.tanda));
      } catch (err) {
        logger.warn("[importar-guias] recalcular grupo", { error: String(err) });
      } finally {
        setRecalculando((s) => {
          const n = new Set(s);
          n.delete(grupo.clave);
          return n;
        });
      }
    },
    [decidir],
  );

  /** Marca/desmarca o corrige (nombre, documento, placa) una ficha del directorio de una guía. */
  const decidirDirectorio = useCallback((guia: string, ficha: string, cambio: Partial<DecisionFicha>) => {
    setAlDirectorio((d) => {
      const actual = d[guia]?.[ficha];
      if (!actual) return d;
      return { ...d, [guia]: { ...d[guia], [ficha]: { ...actual, ...cambio } } };
    });
  }, []);

  const escribirMotivoCupo = useCallback((clave: string, texto: string) => {
    setMotivosCupo((m) => ({ ...m, [clave]: texto }));
  }, []);

  /** ADR-474: confirma (o retira) los renombres que la guía muestra AHORA. */
  const confirmarRenombres = useCallback((clave: string, codigos: readonly string[] | null) => {
    setRenombresOk((r) => {
      const n = { ...r };
      if (codigos && codigos.length) n[clave] = [...codigos];
      else delete n[clave];
      return n;
    });
  }, []);

  const incluir = useCallback((clave: string, on: boolean) => {
    setExcluidas((prev) => {
      const s = new Set(prev);
      if (on) s.delete(clave);
      else s.add(clave);
      return s;
    });
  }, []);

  /** Lo que se manda al confirmar (en orden de importación) y lo que falta decidir. */
  const plan = useMemo(() => {
    const listas: { g: GuiaVistaPrevia; item: ItemImportarGuia }[] = [];
    let trozas = 0;
    let m3 = 0;
    let fichas = 0;
    const faltaPermiso: string[] = [];
    /** Guías que pasan lo autorizado sin motivo: la ruta las rechazaría (T9). */
    const faltaMotivo: string[] = [];
    /** Guías que despacharían más de lo autorizado (T6): no entran ni con motivo. */
    const pasanDespacho: string[] = [];
    /** ADR-474: guías con códigos renombrados sin confirmar: la ruta las rechazaría. */
    const faltaRenombre: string[] = [];
    for (const grupo of grupos) {
      const d = decisiones[grupo.clave];
      const crearTala = d?.crearTala ?? false;
      for (const g of grupo.guias) {
        if (!esImportable(g, crearTala) || excluidas.has(g.clave)) {
          if (g.avisos.some((a) => a.codigo === "exceso_autorizado")) pasanDespacho.push(g.guia?.gtfNumber ? `GTF ${g.guia.gtfNumber}` : g.clave);
          continue;
        }
        const destino = d?.destino ?? null;
        if (!destino || (destino.tipo === "nuevo" && !planNuevoCompleto(destino.plan))) {
          faltaPermiso.push(grupo.titulo ?? g.clave);
          continue;
        }
        const motivo = motivosCupo[g.clave];
        if (faltaMotivoDeCupo(g, crearTala, motivo)) {
          faltaMotivo.push(g.guia?.gtfNumber ? `GTF ${g.guia.gtfNumber}` : g.clave);
          continue;
        }
        const renombres = g.trozas.filter((t) => t.estado === "renombrada").map((t) => t.trozaCode);
        const confirmados = renombresOk[g.clave] ?? [];
        if (renombres.some((c) => !confirmados.includes(c))) {
          faltaRenombre.push(g.guia?.gtfNumber ? `GTF ${g.guia.gtfNumber}` : g.clave);
          continue;
        }
        /* T9 contra lo autorizado, o T6 de una guía verificada (ADR-468): el mismo motivo. */
        const conMotivo = pideMotivo(g, crearTala);
        const directorio = pedidoDirectorio(g.directorio, alDirectorio[g.clave] ?? {});
        listas.push({
          g,
          item: {
            fuente: g.fuente,
            planDestino: destino,
            crearTala,
            ...(directorio ? { directorio } : {}),
            ...(conMotivo && motivo ? { motivoSobreCupo: motivo.trim() } : {}),
            /* T6 (ADR-468): sólo si la vista mostró el despacho sobre lo autorizado y se escribió el motivo. */
            ...(g.t6ConMotivo && motivo ? { confirmaDespacho: true } : {}),
            ...(renombres.length ? { confirmaRenombres: renombres } : {}),
          },
        });
        fichas += cuantasAlDirectorio(directorio);
        trozas += g.trozas.filter((t) => t.estado === "nueva" || t.estado === "renombrada").length;
        m3 += g.guia?.volumenTrozasM3 ?? 0;
      }
    }
    const ordenadas = enOrdenDeImportacion(
      listas.map((x) => ({
        ...x,
        fecha: x.g.guia?.fecha ?? null,
        gtfNumber: x.g.guia?.gtfNumber ?? null,
      })),
    );
    return { listas: ordenadas, trozas, m3, fichas, faltaPermiso: [...new Set(faltaPermiso)], faltaMotivo, pasanDespacho, faltaRenombre };
  }, [grupos, decisiones, excluidas, alDirectorio, motivosCupo, renombresOk]);

  /** Importa de a una, por fecha. Lo que ya entró queda aunque se detenga o falle la red. */
  const confirmar = useCallback(async () => {
    if (plan.listas.length === 0 || envio.enviando) return;
    detener.current = false;
    const resultados: ResultadoImportarGuia[] = [];
    setEnvio({ ...ENVIO_VACIO, enviando: true, total: plan.listas.length });
    setFase("resultado");
    for (const { g, item } of plan.listas) {
      if (detener.current) break;
      setEnvio((e) => ({ ...e, actual: g.guia?.gtfNumber ?? g.clave }));
      try {
        const r = await postJson<RespuestaImportar>(
          BASE,
          { items: [item] },
          "El servidor no respondió: no se anotó esta guía.",
        );
        resultados.push(...r.resultados);
      } catch (err) {
        logger.warn("[importar-guias] importar", { error: String(err), clave: g.clave });
        resultados.push(falloDeRed(g, err instanceof Error ? err.message : String(err)));
      }
      setEnvio((e) => ({ ...e, resultados: [...resultados] }));
    }
    setEnvio((e) => ({ ...e, enviando: false, actual: null }));
    if (resultados.some((r) => r.estado === "importada")) onImportadas();
  }, [plan.listas, envio.enviando, onImportadas]);

  const pedirDetener = useCallback(() => void (detener.current = true), []);

  /** «Importar otras»: vuelve a elegir con la lista de recibidas al día. */
  const reiniciar = useCallback(() => {
    pedido.current++;
    setFase("elegir");
    setElegidas(new Set());
    setTexto("");
    setLeidos([]);
    setVista({ cargando: false, error: null, guias: [] });
    setEnvio(ENVIO_VACIO);
    void cargarCandidatas();
  }, [cargarCandidatas]);

  const volver = useCallback(() => {
    pedido.current++;
    setFase("elegir");
  }, []);

  return {
    fase,
    pestana,
    setPestana,
    candidatas,
    cargarCandidatas,
    elegidas,
    alternar,
    texto,
    setTexto,
    leidos,
    sumarLeido,
    quitarLeido,
    fuentes,
    pedirVistaPrevia,
    vista,
    grupos,
    decisiones,
    decidir,
    elegirPlanDelGrupo,
    recalculando,
    excluidas,
    incluir,
    alDirectorio,
    decidirDirectorio,
    motivosCupo,
    escribirMotivoCupo,
    renombresOk,
    confirmarRenombres,
    plan,
    envio,
    respuesta: respuestaDe(envio.resultados),
    confirmar,
    pedirDetener,
    reiniciar,
    volver,
  };
}

export type ImportarGuias = ReturnType<typeof useImportarGuias>;
