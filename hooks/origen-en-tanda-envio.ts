/**
 * Mandar UN grupo de «Vincular en tanda» (ADR-447): el pedido de la persona,
 * partido en tandas de ≤ 15 corridas (lo que acepta el servidor), sin perder
 * el avance cuando algo es pasajero.
 *
 *  · 429 (límite de la tienda) u «otra tanda en curso»: se espera lo que pide
 *    el servidor y se manda ESTA parte y las que faltaban.
 *  · Corridas `pendiente` (se acabó el plazo total de la tanda) o con error de
 *    choque (`LIBRO_OCUPADO`): se vuelven a pedir sólo ésas.
 *  · 401/403: se corta — las demás fallarían igual.
 *  · Otro error de la llamada (500, sin conexión): esas corridas quedan con el
 *    mensaje y las demás partes siguen.
 *
 * Sin React: el hook le pasa cómo guardar, avisar y esperar. Así se prueba con
 * un `fetch` falso.
 */
import {
  CORRIDAS_POR_PEDIDO,
  enTandas,
  type ResultadoEnPantalla,
} from "@/components/admin/forestal/origen-en-tanda-pantalla";
import type { VincularTrozasPedido } from "@/lib/forestal/vincular-trozas";
import { vincularEnTanda } from "./use-vincular-trozas";

/** Sesión o permiso: la fila se corta, las demás fallarían igual. */
const CORTA_LA_FILA = new Set([401, 403]);
/** Errores de UNA corrida que se arreglan esperando: se vuelve a pedir esa corrida. */
const PASAJEROS = new Set(["LIBRO_OCUPADO", "TANDA_EN_CURSO"]);
/** Vueltas SIN avance (nada nuevo contestado) antes de dejar lo que falta con su motivo. */
const MAX_VUELTAS_SIN_AVANCE = 3;

export interface EnvioDeGrupo {
  corta: boolean;
  vinculadas: number;
  /** m³ de troza que quedaron atribuidos. */
  m3: number;
}

export interface CanalesDelEnvio {
  cortar: () => boolean;
  poner: (rs: readonly ResultadoEnPantalla[]) => void;
  /** Un pedido entero que no llegó (o `null` cuando uno sí llegó). */
  avisar: (mensaje: string | null) => void;
  esperar: (seg: number, motivo: string) => Promise<void>;
  lineNoDe: (corridaId: string) => number | null;
}

export async function mandarGrupo(pedido: readonly VincularTrozasPedido[], io: CanalesDelEnvio): Promise<EnvioDeGrupo> {
  let vinculadas = 0;
  let m3 = 0;
  let cola: VincularTrozasPedido[] = [...pedido];
  let sinAvance = 0;
  while (cola.length > 0 && !io.cortar()) {
    const siguiente: VincularTrozasPedido[] = [];
    let espera: { seg: number; motivo: string } | null = null;
    let avance = false;
    const partes = enTandas(cola, CORRIDAS_POR_PEDIDO);
    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i]!;
      if (io.cortar()) {
        siguiente.push(...partes.slice(i).flat());
        break;
      }
      const r = await vincularEnTanda(parte);
      if (!r.ok) {
        io.avisar(r.mensaje);
        if (CORTA_LA_FILA.has(r.status)) return { corta: true, vinculadas, m3 };
        if (r.esperarSeg != null) {
          espera = { seg: r.esperarSeg, motivo: r.mensaje };
          siguiente.push(...partes.slice(i).flat());
          break;
        }
        io.poner(
          parte.map((p) => ({ corridaId: p.corridaId, lineNo: io.lineNoDe(p.corridaId), estado: "error", codigo: "INTERNO", mensaje: r.mensaje })),
        );
        continue;
      }
      io.avisar(null);
      const rs: readonly ResultadoEnPantalla[] = r.datos.corridas;
      io.poner(rs);
      for (const x of rs) {
        if (x.estado === "vinculada") {
          vinculadas++;
          m3 += x.m3;
        }
        const reintentar = x.estado === "pendiente" || (x.estado === "error" && PASAJEROS.has(x.codigo));
        if (!reintentar) {
          avance = true;
          continue;
        }
        const p = parte.find((y) => y.corridaId === x.corridaId);
        if (p) siguiente.push(p);
        espera ??= x.estado === "pendiente" ? { seg: 1, motivo: "Se acabó el tiempo de la tanda" } : { seg: 5, motivo: x.mensaje };
      }
    }
    cola = siguiente;
    if (cola.length === 0 || io.cortar()) break;
    sinAvance = avance ? 0 : sinAvance + 1;
    if (sinAvance > MAX_VUELTAS_SIN_AVANCE) break;
    if (espera) await io.esperar(espera.seg, espera.motivo);
  }
  return { corta: false, vinculadas, m3 };
}
