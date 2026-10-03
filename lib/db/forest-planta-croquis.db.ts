import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  HOLGURA_BORDE_M,
  croquisParaCliente,
  esPathImagenCroquis,
  parsearCroquisGuardado,
  type CroquisGuardado,
} from "@/lib/forestal/planta-croquis-guardado";
import type { MaquinaPlanta, PlantaCroquis } from "@/lib/forestal/planta-zona-types";

/**
 * ForestPlantaCroquisDB — el croquis del aserradero en METROS (ADR-465):
 * medidas del terreno, versión del plano, imagen de fondo y máquinas.
 *
 * KV `ctp-planta-croquis:{tenantId}` (PlatformSetting), como las zonas: es la
 * identidad física de la planta, no un movimiento del libro, y no fabrica una
 * migración. La imagen vive en el bucket privado (`croquis-storage.ts`); acá
 * sólo su RUTA — la URL firmada vence y se arma en cada lectura.
 *
 * `tenantId` 1er param. La escritura va por `PlatformSettingsDB.actualizar`
 * (lock por clave): dos guardados a la vez no se pisan, y el reemplazo de la
 * imagen sabe cuál era la anterior para borrarla.
 */

const KEY_PREFIX = "ctp-planta-croquis:";
const clave = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;

/** El cliente mandó una imagen que no es de este negocio (o no es del croquis). */
export class CroquisInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CroquisInvalidoError";
  }
}

/**
 * Lo que se cambia. Todo opcional: mover una máquina manda sólo `maquinas`;
 * lo que no viene se conserva. Sin croquis previo, `anchoM` y `altoM` son
 * obligatorios (un plano sin medidas no se puede dibujar).
 */
export interface CroquisInput {
  /** Versión del plano (la que dice la lámina: «Versión 8»). */
  version?: number;
  anchoM?: number;
  altoM?: number;
  maquinas?: MaquinaPlanta[];
  /** `undefined` = no tocar la imagen · `null` = sacarla · string = ruta subida por `croquis/imagen`. */
  imagenPath?: string | null;
}

export const ForestPlantaCroquisDB = {
  async get(tenantId: string): Promise<CroquisGuardado | null> {
    if (!tenantId) throw new Error("tenantId is required");
    return parsearCroquisGuardado(await PlatformSettingsDB.get<unknown>(clave(tenantId)));
  },

  /** Lo que viaja en el GET: sin la ruta del bucket, con la URL propia de la imagen. */
  async getParaCliente(tenantId: string): Promise<PlantaCroquis | null> {
    const g = await this.get(tenantId);
    return g ? croquisParaCliente(g) : null;
  },

  /**
   * Guarda el croquis entero. Devuelve el guardado y, si la imagen cambió, la
   * ruta de la ANTERIOR (para que la ruta la borre del bucket fuera de la tx).
   */
  async save(
    tenantId: string,
    input: CroquisInput,
    user = "unknown",
  ): Promise<{ croquis: CroquisGuardado; imagenAnterior: string | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (input.imagenPath != null && !esPathImagenCroquis(input.imagenPath, tenantId)) {
      throw new CroquisInvalidoError("La imagen no es un croquis subido por este negocio.");
    }
    const r = await PlatformSettingsDB.actualizar<unknown, { croquis: CroquisGuardado; imagenAnterior: string | null }>(
      clave(tenantId),
      (actual) => {
        const previo = parsearCroquisGuardado(actual);
        const anchoM = input.anchoM ?? previo?.anchoM;
        const altoM = input.altoM ?? previo?.altoM;
        if (anchoM == null || altoM == null) {
          throw new CroquisInvalidoError("Primero carga el ancho y el alto del terreno, en metros.");
        }
        const maquinas = input.maquinas ?? previo?.maquinas ?? [];
        /* Una máquina EN la planta tiene que caer dentro del terreno; la que
           está «fuera» (en otro almacén) se dibuja aparte y su punto no importa. */
        const h = HOLGURA_BORDE_M;
        const afuera = maquinas.find((m) => !m.fuera && (m.x < -h || m.y < -h || m.x > anchoM + h || m.y > altoM + h));
        if (afuera) {
          throw new CroquisInvalidoError(`La máquina ${afuera.codigo} queda fuera del terreno (${anchoM} × ${altoM} m): muévela o márcala «fuera».`);
        }
        const codigos = new Set<string>();
        for (const m of maquinas) {
          const k = m.codigo.trim().toUpperCase();
          if (codigos.has(k)) throw new CroquisInvalidoError(`El código de máquina ${m.codigo} está repetido.`);
          codigos.add(k);
        }
        const imagenPath = input.imagenPath === undefined ? (previo?.imagenPath ?? null) : input.imagenPath;
        const croquis: CroquisGuardado = {
          version: input.version ?? previo?.version ?? 1,
          anchoM,
          altoM,
          imagenPath,
          maquinas,
          actualizadoEn: new Date().toISOString(),
          actualizadoPor: user,
        };
        const anterior = previo?.imagenPath && previo.imagenPath !== imagenPath ? previo.imagenPath : null;
        return { valor: croquis, resultado: { croquis, imagenAnterior: anterior } };
      },
      user,
    );
    const c = r.croquis;
    const img = input.imagenPath === undefined ? "" : input.imagenPath ? " · imagen nueva" : " · sin imagen";
    auditCtp({
      tenantId,
      action: "ctp_planta_croquis_set",
      entity: "ForestPlantaCroquis",
      entityId: tenantId,
      detail: `Guardó el croquis v${c.version}: ${c.anchoM} × ${c.altoM} m, ${c.maquinas.length} máquina(s)${img}`,
      user,
    });
    return r;
  },
};
