import "server-only";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import {
  fusionarEstado,
  LIMITES_REPARTO,
  normalizarEstado,
  type CambioReparto,
  type EstadoReparto,
} from "@/lib/forestal/reparto-marcas-sync";

/**
 * Las casillas «Distribuido», el nombre de «Sin marcar», la firma del Anexo 04
 * y los códigos 1-01… del reparto de rolliza, POR NEGOCIO (Brandon,
 * 2026-10-19: «marco en la oficina y en el monte veo lo mismo»).
 *
 * Una fila de `PlatformSetting` por tenant, como el talonario de la GTF, pero
 * con el prefijo `interno:`: es trabajo del día, se escribe a cada tilde y no
 * tiene que viajar en `getAll()` (la foto de configuración del layout) ni
 * invalidarla. La escritura es lee-mezcla-escribe bajo el candado de la clave
 * (`actualizar`, ADR-445): dos dispositivos que tildan a la vez no se pisan, y
 * la mezcla es por fila con fecha (`fusionarEstado`).
 */

export const claveRepartoMarcas = (tenantId: string): string => `${PREFIJO_INTERNO}forestal-reparto-marcas:${tenantId}`;

export type ResultadoRepartoMarcas = { ok: true; estado: EstadoReparto } | { ok: false; motivo: "lleno"; estado: EstadoReparto | null };

export const ForestRepartoMarcasDB = {
  /** Lo guardado del negocio, de la base (sin caché); `null` si nunca se guardó. */
  async leer(tenantId: string): Promise<EstadoReparto | null> {
    return normalizarEstado(await PlatformSettingsDB.getFresco<unknown>(claveRepartoMarcas(tenantId)));
  },

  /** Mezcla el cambio con lo guardado y devuelve el resultado (lo que el dispositivo pinta). */
  async aplicar(tenantId: string, cambio: CambioReparto, quien?: string): Promise<ResultadoRepartoMarcas> {
    return PlatformSettingsDB.actualizar<unknown, ResultadoRepartoMarcas>(
      claveRepartoMarcas(tenantId),
      (actual) => {
        const previo = normalizarEstado(actual);
        const siguiente = fusionarEstado(previo, cambio, Date.now());
        if (previo && siguiente === previo) return { resultado: { ok: true, estado: previo } };
        if (JSON.stringify(siguiente).length > LIMITES_REPARTO.bytes) {
          return { resultado: { ok: false, motivo: "lleno", estado: previo } };
        }
        return { valor: siguiente, resultado: { ok: true, estado: siguiente } };
      },
      quien,
      { esperaMaxMs: 4000 },
    );
  },
};
