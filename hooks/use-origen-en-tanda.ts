"use client";

/**
 * use-origen-en-tanda — «¿De qué trozas salió?» EN TANDA (ADR-447 §4-5).
 *
 * · Carga: `GET ?tanda=1` — las corridas listas agrupadas por especie y
 *   permiso, cada una con SUS trozas (ninguna en dos), y lo que dejaría cada
 *   arreglo. Releer suelta lo elegido que ya no está en la propuesta.
 * · Elegir: desmarcar trozas o dejar una corrida sin origen. Nada viaja hasta
 *   que la persona aprieta «Vincular».
 * · Vincular: un POST por grupo (especie + permiso), partido en tandas de
 *   ≤ 15 corridas. El servidor escribe una transacción por corrida y dice cómo
 *   terminó CADA una: si una falla, las demás siguen. Un 429 o «otra tanda en
 *   curso» esperan y reintentan lo que faltó; las `pendiente` (se acabó el
 *   plazo de la tanda) se vuelven a pedir sin perder lo ya hecho; 401/403
 *   cortan la fila (fallarían todas igual).
 *
 * Nada de m³ se decide acá: la propuesta y cada resultado salen del servidor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SIN_ELEGIR,
  eleccionesVigentes,
  gruposEnFila,
  pedidoDelGrupo,
  yaTieneOrigen,
  type EleccionesDeTanda,
  type ResultadoEnPantalla,
  type ResultadosDeTanda,
} from "@/components/admin/forestal/origen-en-tanda-pantalla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esperarCortable } from "./guias-sin-registrar-pedidos";
import { mandarGrupo, type EnvioDeGrupo } from "./origen-en-tanda-envio";
import { leerTandaDeOrigen, type TandaDeOrigen } from "./use-vincular-trozas";

export interface CorridaHecha {
  corridaId: string;
  lineNo: number | null;
  fecha: string;
  especie: string;
  m3Producido: number;
  resultado: ResultadoEnPantalla;
}

export interface FilaDeTanda {
  /** Grupos a mandar y cuántos ya terminaron. */
  total: number;
  hechos: number;
  deteniendo: boolean;
  /** Esperando el límite u otra tanda: hasta cuándo y por qué. */
  espera: { hasta: number; motivo: string } | null;
}

export interface EstadoOrigenEnTanda {
  datos: TandaDeOrigen | null;
  cargando: boolean;
  error: string | null;
  /** Cuándo llegó la última lectura (ms): la bandeja no relee dos veces seguidas. */
  leidaEn: number;
  elecciones: EleccionesDeTanda;
  resultados: ResultadosDeTanda;
  /** Las que quedaron con origen en esta sesión: ya no vienen en la propuesta, pero se dice qué pasó. */
  hechas: CorridaHecha[];
  /** El grupo que se está mandando y desde cuándo. */
  vinculando: { clave: string; desde: number } | null;
  fila: FilaDeTanda | null;
  /** El último pedido que no llegó (sesión, conexión, límite): una frase. */
  aviso: string | null;
  cargar: () => Promise<void>;
  alternarTroza: (trozaId: string) => void;
  marcarTodas: (trozaIds: readonly string[], marcar: boolean) => void;
  dejarSinOrigen: (corridaId: string, sinOrigen: boolean) => void;
  vincularGrupo: (clave: string) => Promise<void>;
  vincularTodas: () => Promise<void>;
  detener: () => void;
}

export function useOrigenEnTanda(
  opts: { cargarAlMontar?: boolean; onCambio?: (mensaje: string) => void } = {},
): EstadoOrigenEnTanda {
  const { cargarAlMontar = false } = opts;
  const [datos, setDatos] = useState<TandaDeOrigen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leidaEn, setLeidaEn] = useState(0);
  const [elecciones, setElecciones] = useState<EleccionesDeTanda>(SIN_ELEGIR);
  const [resultados, setResultados] = useState<ResultadosDeTanda>({});
  const [hechas, setHechas] = useState<CorridaHecha[]>([]);
  const [vinculando, setVinculando] = useState<EstadoOrigenEnTanda["vinculando"]>(null);
  const [fila, setFila] = useState<FilaDeTanda | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /* Lo que leen las funciones async: el estado de React quedaría del render en que se llamaron. */
  const datosRef = useRef(datos);
  const eleccionesRef = useRef(elecciones);
  const resultadosRef = useRef(resultados);
  const onCambioRef = useRef(opts.onCambio);
  useEffect(() => {
    onCambioRef.current = opts.onCambio;
  });
  const turno = useRef(0);
  const vivo = useRef(true);
  const detenerPedido = useRef(false);
  const corriendo = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const ponerElecciones = (e: EleccionesDeTanda) => {
    eleccionesRef.current = e;
    setElecciones(e);
  };

  const cargar = useCallback(async () => {
    const t = ++turno.current;
    setCargando(true);
    setError(null);
    const r = await leerTandaDeOrigen();
    if (!vivo.current || t !== turno.current) return;
    if (r.ok) {
      datosRef.current = r.datos;
      setDatos(r.datos);
      ponerElecciones(eleccionesVigentes(r.datos.propuesta, eleccionesRef.current));
      setLeidaEn(Date.now());
    } else {
      setError(r.mensaje);
    }
    setCargando(false);
  }, []);

  const alternarTroza = useCallback((trozaId: string) => {
    const d = new Set(eleccionesRef.current.desmarcadas);
    if (d.has(trozaId)) d.delete(trozaId);
    else d.add(trozaId);
    ponerElecciones({ ...eleccionesRef.current, desmarcadas: d });
  }, []);

  const marcarTodas = useCallback((trozaIds: readonly string[], marcar: boolean) => {
    const d = new Set(eleccionesRef.current.desmarcadas);
    for (const id of trozaIds) {
      if (marcar) d.delete(id);
      else d.add(id);
    }
    ponerElecciones({ ...eleccionesRef.current, desmarcadas: d });
  }, []);

  const dejarSinOrigen = useCallback((corridaId: string, sinOrigen: boolean) => {
    const s = new Set(eleccionesRef.current.sinOrigen);
    if (sinOrigen) s.add(corridaId);
    else s.delete(corridaId);
    ponerElecciones({ ...eleccionesRef.current, sinOrigen: s });
  }, []);

  /** Guarda lo que contestó el servidor y anota las que quedaron con origen. */
  const ponerResultados = useCallback((rs: readonly ResultadoEnPantalla[]) => {
    const corridas = datosRef.current?.propuesta.grupos.flatMap((g) => g.corridas) ?? [];
    const nuevas: CorridaHecha[] = [];
    const porId: Record<string, ResultadoEnPantalla> = { ...resultadosRef.current };
    for (const r of rs) {
      porId[r.corridaId] = r;
      const c = corridas.find((x) => x.corridaId === r.corridaId);
      if (c && yaTieneOrigen(r)) {
        nuevas.push({ corridaId: c.corridaId, lineNo: c.lineNo, fecha: c.fecha, especie: c.especie, m3Producido: c.m3Producido, resultado: r });
      }
    }
    resultadosRef.current = porId;
    if (!vivo.current) return;
    setResultados(porId);
    if (nuevas.length > 0) {
      setHechas((prev) => [...prev.filter((h) => !nuevas.some((n) => n.corridaId === h.corridaId)), ...nuevas]);
    }
  }, []);

  /** Manda UN grupo (`mandarGrupo`, en tandas de ≤ 15) con el pedido de ahora. */
  const mandar = useCallback(
    async (clave: string, cortar: () => boolean): Promise<EnvioDeGrupo> => {
      const g = datosRef.current?.propuesta.grupos.find((x) => x.clave === clave);
      if (!g) return { corta: false, vinculadas: 0, m3: 0 };
      setVinculando({ clave, desde: Date.now() });
      try {
        return await mandarGrupo(pedidoDelGrupo(g, eleccionesRef.current, resultadosRef.current), {
          cortar,
          poner: ponerResultados,
          avisar: (m) => {
            if (vivo.current) setAviso(m);
          },
          esperar: async (seg, motivo) => {
            if (vivo.current) setFila((f) => (f ? { ...f, espera: { hasta: Date.now() + seg * 1000, motivo } } : f));
            await esperarCortable(seg * 1000, cortar);
            if (vivo.current) setFila((f) => (f ? { ...f, espera: null } : f));
          },
          lineNoDe: (id) => g.corridas.find((c) => c.corridaId === id)?.lineNo ?? null,
        });
      } finally {
        if (vivo.current) setVinculando(null);
      }
    },
    [ponerResultados],
  );

  /** La fila entera o un grupo: los mismos pasos, releer al final y avisar a la vista. */
  const correr = useCallback(
    async (claves: readonly string[]) => {
      if (corriendo.current || claves.length === 0) return;
      corriendo.current = true;
      detenerPedido.current = false;
      const cortar = () => detenerPedido.current || !vivo.current;
      setFila({ total: claves.length, hechos: 0, deteniendo: false, espera: null });
      let vinculadas = 0;
      let m3 = 0;
      try {
        for (let i = 0; i < claves.length && !cortar(); i++) {
          const r = await mandar(claves[i]!, cortar);
          vinculadas += r.vinculadas;
          m3 += r.m3;
          if (vivo.current) setFila((f) => (f ? { ...f, hechos: i + 1 } : f));
          if (r.corta) break;
        }
      } finally {
        corriendo.current = false;
        if (vivo.current) setFila(null);
      }
      if (!vivo.current) return;
      if (vinculadas > 0) {
        onCambioRef.current?.(
          `${vinculadas === 1 ? "Se vinculó 1 corrida" : `Se vincularon ${vinculadas} corridas`} con sus trozas (${fmtM3(m3)} m³ de troza).`,
        );
      }
      await cargar();
    },
    [mandar, cargar],
  );

  const vincularGrupo = useCallback((clave: string) => correr([clave]), [correr]);
  const vincularTodas = useCallback(async () => {
    const d = datosRef.current;
    if (!d) return;
    await correr(gruposEnFila(d.propuesta, eleccionesRef.current, resultadosRef.current));
  }, [correr]);

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
    error,
    leidaEn,
    elecciones,
    resultados,
    hechas,
    vinculando,
    fila,
    aviso,
    cargar,
    alternarTroza,
    marcarTodas,
    dejarSinOrigen,
    vincularGrupo,
    vincularTodas,
    detener,
  };
}
