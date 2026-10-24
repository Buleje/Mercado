"use client";

/**
 * use-guias-sin-registrar — los datos de «Guías sin registrar» (ADR-446): las
 * guías que salieron con su Anexo 04 y el libro no tiene en Despacho.
 *
 * · Carga: `GET ?pendientes=1` (la tanda propuesta, la más vieja primero).
 * · Elegir el origen de un grupo vuelve a pedir la tanda ENTERA con
 *   `simular: true`: cambiar la corrida de la 055 cambia lo que le queda a la
 *   060, y la pantalla tiene que mostrarlo antes de registrar.
 * · Registrar: UN POST por guía. Una guía de 37 líneas tarda ~90 s contra la
 *   base desde el panel local; de a una se ve el avance y, si una falla, las
 *   demás siguen. En la fila, un 429 (20 registros cada 5 min por tienda) o
 *   «otra guía se está registrando» esperan y reintentan la MISMA guía; un
 *   401/403 la corta (fallarían todas igual).
 *
 * Nada de m³ se calcula acá: todo sale de la respuesta del servidor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RespuestaPendientes,
  ResultadoGuia,
  ResultadoTanda,
  UsadaLiberada,
} from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import {
  CODIGOS_PASAJEROS,
  eleccionesParaApi,
  listasEnFila,
  mensajeDeCodigo,
  siguienteEnFila,
  type EleccionesPorGuia,
} from "@/components/admin/forestal/guias-sin-registrar-pantalla";
import {
  MAX_POR_PEDIDO,
  esperarCortable,
  pedir,
  type EstadoGuiasSinRegistrar,
  type GrupoAElegir,
  type Respuesta,
} from "./guias-sin-registrar-pedidos";

export type { EstadoGuiasSinRegistrar, GrupoAElegir } from "./guias-sin-registrar-pedidos";

/** Sesión o permiso: la fila se corta, las demás fallarían igual. */
const CORTA_LA_FILA = new Set([401, 403]);
/** Otra pestaña u otra operación del libro: se espera esto y se reintenta la MISMA guía. */
const ESPERA_PASAJERA_SEG = 5;
/** Reintentos de una misma guía dentro de la fila antes de dejarla como fallida y seguir. */
const MAX_REINTENTOS = 3;

export function useGuiasSinRegistrar(
  opts: { cargarAlMontar?: boolean; onCambio?: () => void } = {},
): EstadoGuiasSinRegistrar {
  const { cargarAlMontar = false } = opts;
  const [datos, setDatos] = useState<RespuestaPendientes | null>(null);
  const [cargando, setCargando] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elecciones, setElecciones] = useState<EleccionesPorGuia>({});
  const [liberar, setLiberar] = useState<ReadonlySet<string>>(new Set());
  const [resultados, setResultados] = useState<Readonly<Record<string, ResultadoGuia>>>({});
  const [liberadas, setLiberadas] = useState<readonly UsadaLiberada[]>([]);
  const [registrando, setRegistrando] = useState<EstadoGuiasSinRegistrar["registrando"]>(null);
  const [fila, setFila] = useState<EstadoGuiasSinRegistrar["fila"]>(null);

  /* Lo que leen las funciones async: el estado de React quedaría del render en que se llamaron. */
  const datosRef = useRef(datos);
  const eleccionesRef = useRef(elecciones);
  const liberarRef = useRef(liberar);
  const resultadosRef = useRef(resultados);
  const onCambioRef = useRef(opts.onCambio);
  useEffect(() => {
    onCambioRef.current = opts.onCambio;
  });
  /** Turno de la última lectura: una respuesta vieja no pisa una más nueva. */
  const turno = useRef(0);
  const vivo = useRef(true);
  const detenerPedido = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const ponerDatos = (d: RespuestaPendientes) => {
    datosRef.current = d;
    setDatos(d);
  };
  const ponerElecciones = (e: EleccionesPorGuia) => {
    eleccionesRef.current = e;
    setElecciones(e);
  };

  /** La tanda con las elecciones de hoy (o la base tal cual, si no hay ninguna). */
  const simularCon = useCallback(async (base: RespuestaPendientes, elec: EleccionesPorGuia): Promise<Respuesta<RespuestaPendientes>> => {
    const guias = base.tanda.guias.map((g) => ({ anexoId: g.anexoId, elecciones: eleccionesParaApi(elec[g.anexoId]) }));
    if (guias.length === 0) return { ok: true, datos: base };
    const r = await pedir<RespuestaPendientes>("POST", { guias: guias.slice(0, MAX_POR_PEDIDO), simular: true });
    if (!r.ok) return r;
    const extra = base.tanda.guias.slice(MAX_POR_PEDIDO);
    return extra.length === 0 ? r : { ok: true, datos: { ...r.datos, tanda: { ...r.datos.tanda, guias: [...r.datos.tanda.guias, ...extra] } } };
  }, []);

  const cargar = useCallback(async () => {
    const t = ++turno.current;
    setCargando(true);
    setError(null);
    const r = await pedir<RespuestaPendientes>("GET");
    if (!vivo.current || t !== turno.current) return;
    if (!r.ok) {
      setError(r.mensaje);
      setCargando(false);
      setSimulando(false);
      return;
    }
    /* Las elecciones de guías que ya no están pendientes se sueltan. */
    const pendientes = new Set(r.datos.tanda.guias.map((g) => g.anexoId));
    const vivas = Object.fromEntries(Object.entries(eleccionesRef.current).filter(([id]) => pendientes.has(id)));
    ponerElecciones(vivas);
    let d = r.datos;
    if (Object.keys(vivas).length > 0) {
      const s = await simularCon(d, vivas);
      if (!vivo.current || t !== turno.current) return;
      if (s.ok) d = s.datos;
      else setError(s.mensaje);
    }
    ponerDatos(d);
    /* El último pedido apaga los DOS indicadores: uno viejo que vuelve tarde
       sale arriba sin tocarlos, y el nuevo puede ser el otro tipo de lectura. */
    setCargando(false);
    setSimulando(false);
  }, [simularCon]);

  const revisar = useCallback(async () => {
    const base = datosRef.current;
    if (!base) return cargar();
    const t = ++turno.current;
    setSimulando(true);
    setError(null);
    const r = await simularCon(base, eleccionesRef.current);
    if (!vivo.current || t !== turno.current) return;
    if (r.ok) ponerDatos(r.datos);
    else setError(r.mensaje);
    setSimulando(false);
    setCargando(false);
  }, [cargar, simularCon]);

  const elegir = useCallback(
    (anexoId: string, grupo: GrupoAElegir, corridas: string[] | null) => {
      const porGuia = { ...(eleccionesRef.current[anexoId] ?? {}) };
      if (corridas == null) delete porGuia[grupo.clave];
      else porGuia[grupo.clave] = { especie: grupo.especie, tipo: grupo.tipo, corridas };
      const nuevas = { ...eleccionesRef.current };
      if (Object.keys(porGuia).length > 0) nuevas[anexoId] = porGuia;
      else delete nuevas[anexoId];
      ponerElecciones(nuevas);
      void revisar();
    },
    [revisar],
  );

  const alternarLiberar = useCallback((corridaId: string) => {
    const s = new Set(liberarRef.current);
    if (s.has(corridaId)) s.delete(corridaId);
    else s.add(corridaId);
    liberarRef.current = s;
    setLiberar(s);
  }, []);

  /**
   * UNA guía, sin releer la lista. `corta` = la fila no debe seguir;
   * `esperarSeg` = el fallo es pasajero y la fila reintenta después de eso.
   */
  const registrarUna = useCallback(
    async (anexoId: string): Promise<{ resultado: ResultadoGuia; corta: boolean; esperarSeg: number | null; motivo: string }> => {
      const guia = datosRef.current?.tanda.guias.find((g) => g.anexoId === anexoId);
      const base = { anexoId, numero: guia?.numero ?? "", gtf: guia?.gtf ?? "" };
      setRegistrando({ anexoId, desde: Date.now() });
      const r = await pedir<ResultadoTanda>("POST", {
        guias: [{ anexoId, elecciones: eleccionesParaApi(eleccionesRef.current[anexoId]) }],
        ...(liberarRef.current.size > 0 ? { liberarUsadas: [...liberarRef.current] } : {}),
      });
      let resultado: ResultadoGuia;
      let esperarSeg: number | null = null;
      if (!r.ok) {
        resultado = { ...base, estado: "error", codigo: r.codigo ?? `HTTP_${r.status}`, mensaje: r.mensaje };
        esperarSeg = r.esperarSeg ?? (r.codigo && CODIGOS_PASAJEROS.has(r.codigo) ? ESPERA_PASAJERA_SEG : null);
      } else {
        resultado = r.datos.guias.find((g) => g.anexoId === anexoId) ?? {
          ...base, estado: "error", codigo: "SIN_RESPUESTA",
          mensaje: "El servidor no devolvió esta guía: vuelve a cargar la lista antes de reintentar.",
        };
        if (resultado.estado === "error" && CODIGOS_PASAJEROS.has(resultado.codigo)) esperarSeg = ESPERA_PASAJERA_SEG;
        if (r.datos.liberadas.length > 0 && vivo.current) {
          setLiberadas((prev) => [...prev, ...r.datos.liberadas]);
          const s = new Set(liberarRef.current);
          r.datos.liberadas.forEach((l) => s.delete(l.corridaId));
          liberarRef.current = s;
          setLiberar(s);
        }
      }
      resultadosRef.current = { ...resultadosRef.current, [anexoId]: resultado };
      if (vivo.current) {
        setResultados(resultadosRef.current);
        setRegistrando(null);
      }
      if (resultado.estado === "registrada") {
        const resto: EleccionesPorGuia = Object.fromEntries(Object.entries(eleccionesRef.current).filter(([id]) => id !== anexoId));
        eleccionesRef.current = resto;
        if (vivo.current) setElecciones(resto);
        onCambioRef.current?.();
      }
      const motivo = !r.ok && r.status === 429
        ? "Límite de registros de la tienda"
        : resultado.estado === "error" ? mensajeDeCodigo(resultado.codigo, resultado.mensaje) : "";
      return { resultado, corta: !r.ok && CORTA_LA_FILA.has(r.status), esperarSeg, motivo };
    },
    [],
  );

  const registrar = useCallback(
    async (anexoId: string) => {
      await registrarUna(anexoId);
      if (vivo.current) await cargar();
    },
    [registrarUna, cargar],
  );

  const registrarListas = useCallback(async () => {
    const base = datosRef.current;
    if (!base) return;
    const ids = listasEnFila(base.tanda.guias, resultadosRef.current);
    if (ids.length === 0) return;
    detenerPedido.current = false;
    const cortar = () => detenerPedido.current || !vivo.current;
    setFila({ total: ids.length, hechas: 0, deteniendo: false, espera: null });
    let i = 0;
    let reintentos = 0;
    while (i < ids.length && !cortar()) {
      const { corta, esperarSeg, motivo } = await registrarUna(ids[i]);
      if (corta) break;
      if (esperarSeg != null && reintentos < MAX_REINTENTOS) {
        /* Pasajero: la cola no se rompe, espera y vuelve a intentar ESTA guía. */
        reintentos++;
        if (vivo.current) setFila((f) => (f ? { ...f, espera: { hasta: Date.now() + esperarSeg * 1000, motivo } } : f));
        await esperarCortable(esperarSeg * 1000, cortar);
        if (vivo.current) setFila((f) => (f ? { ...f, espera: null } : f));
        continue;
      }
      reintentos = 0;
      i++;
      if (vivo.current) setFila((f) => (f ? { ...f, hechas: i } : f));
    }
    if (!vivo.current) return;
    setFila(null);
    await cargar();
  }, [registrarUna, cargar]);

  const detener = useCallback(() => {
    detenerPedido.current = true;
    setFila((f) => (f ? { ...f, deteniendo: true } : f));
  }, []);

  useEffect(() => {
    if (cargarAlMontar) void cargar();
  }, [cargarAlMontar, cargar]);

  return {
    datos,
    cargando,
    simulando,
    error,
    elecciones,
    liberar,
    resultados,
    liberadas,
    registrando,
    fila,
    siguiente: datos ? siguienteEnFila(datos.tanda.guias, resultados) : null,
    cargar,
    revisar,
    elegir,
    alternarLiberar,
    registrar,
    registrarListas,
    detener,
  };
}
