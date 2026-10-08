/**
 * Lectura de marcadores EN VIVO, para el vigía de una cámara del mosaico
 * (ADR-480). Recibe el cuadro que el vigía ya tomó y, si la cámara está
 * quieta (sin manchas de movimiento: una troza que pasa en la uña sale movida
 * y no se lee), lo lee cada `CADA_CUANTO_MARCADORES_MS`. Cuando lo confirmado
 * (≥3 cuadros en ≥2 s) cambia, anota una pasada `vivo` en el servidor.
 *
 * Exige HD: con el cuadro a menos de 1280 px de ancho un marcador de 20 cm a
 * 5 m da 2 px por celda y no se lee (contrato K3 §1): no gasta el procesador.
 */
import {
  CADA_CUANTO_MARCADORES_MS,
  confirmarMarcadores,
  type LecturaMarcador,
  type MarcadorConfirmado,
} from "@/lib/camaras/marcadores";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { leerMarcadoresDe, retenerMotorMarcadores } from "./motor-marcadores";

const ANCHO_HD = 1280;
/** Una pasada `vivo` como mucho cada esto, aunque lo visto cambie. */
const ENTRE_PASADAS_MS = 5 * 60_000;

export interface LectorMarcadoresVivo {
  /** El cuadro que el vigía acaba de mirar; `quieto` = sin manchas de movimiento. */
  ofrecer(cuadro: HTMLCanvasElement, quieto: boolean): void;
  confirmados(): MarcadorConfirmado[];
  soltar(): void;
}

export function crearLectorMarcadoresVivo(camaraId: string): LectorMarcadoresVivo {
  const soltarMotor = retenerMotorMarcadores();
  let historial: LecturaMarcador[] = [];
  let ultimaLectura = 0;
  let leyendo = false;
  let soltado = false;
  let ultimaPasada = 0;
  let ultimoConjunto = "";

  async function anotar(confirmados: MarcadorConfirmado[]) {
    const clave = confirmados.map((c) => c.id).join(",");
    const ahora = Date.now();
    if (clave === ultimoConjunto || ahora - ultimaPasada < ENTRE_PASADAS_MS) return;
    ultimoConjunto = clave;
    ultimaPasada = ahora;
    const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/marcadores`, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        en: new Date(ahora).toISOString(),
        origen: "vivo",
        calidad: "hd",
        marcadores: confirmados.map((c) => ({ id: c.id, cuadros: Math.min(100, c.cuadros), ladoPx: c.ladoPx })),
      }),
    });
    if (!r.ok) logger.warn("[camaras] la pasada en vivo no se anotó", { camaraId, status: r.status });
  }

  return {
    ofrecer(cuadro, quieto) {
      const ahora = Date.now();
      if (soltado || leyendo || !quieto || cuadro.width < ANCHO_HD) return;
      if (ahora - ultimaLectura < CADA_CUANTO_MARCADORES_MS) return;
      ultimaLectura = ahora;
      leyendo = true;
      void leerMarcadoresDe(cuadro, ahora)
        .then((r) => {
          historial = [...historial.filter((l) => ahora - l.at < 60_000), ...r.lecturas];
          const ok = confirmarMarcadores(historial, ahora);
          if (ok.length) return anotar(ok);
        })
        .catch((err) => logger.warn("[camaras] lectura de marcadores en vivo falló", { camaraId, error: String(err) }))
        .finally(() => {
          leyendo = false;
        });
    },
    confirmados: () => confirmarMarcadores(historial, Date.now()),
    soltar() {
      soltado = true;
      historial = [];
      soltarMotor();
    },
  };
}
