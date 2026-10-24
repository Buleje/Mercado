import "server-only";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import { firmarCambios, normalizarMercado, MERCADO_VACIO, type DatosMercado } from "@/lib/compras/mercado";

/**
 * Precios del mercado compartidos con el equipo (C38, noche 17-10).
 *
 * Sin tabla: una clave `interno:` del KV por negocio (no viaja en `getAll()`
 * ni invalida la caché del layout). Guardar es «la lista entera con la versión
 * que leíste»: si otra persona guardó en el medio, no se pisa —vuelve un
 * conflicto con lo último y el panel lo recarga—. Todo bajo el candado de
 * `PlatformSettingsDB.actualizar`, así dos guardados a la vez hacen fila.
 */

export const CLAVE_MERCADO = (tenantId: string) => `${PREFIJO_INTERNO}compras-mercado:${tenantId}`;

export interface MercadoEquipo {
  datos: DatosMercado;
  /** Sube en 1 con cada guardado: 0 = nadie compartió todavía. */
  version: number;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

function leerDoc(raw: unknown): MercadoEquipo {
  if (!raw || typeof raw !== "object") return { datos: MERCADO_VACIO, version: 0, actualizadoEn: null, actualizadoPor: null };
  const r = raw as Record<string, unknown>;
  return {
    datos: normalizarMercado(r.datos),
    version: typeof r.version === "number" && Number.isInteger(r.version) && r.version >= 0 ? r.version : 0,
    actualizadoEn: typeof r.actualizadoEn === "string" ? r.actualizadoEn : null,
    actualizadoPor: typeof r.actualizadoPor === "string" ? r.actualizadoPor : null,
  };
}

export type GuardadoMercado = { ok: true; doc: MercadoEquipo } | { ok: false; conflicto: MercadoEquipo };

export const ComprasMercadoDB = {
  /** De la base, sin caché: la lista se vuelve a mandar entera al guardar. */
  async leer(tenantId: string): Promise<MercadoEquipo> {
    return leerDoc(await PlatformSettingsDB.getFresco(CLAVE_MERCADO(tenantId)));
  },

  /**
   * Graba la lista si nadie guardó desde `versionLeida`. Cada precio nuevo o
   * cambiado queda firmado por `usuario` (quién lo anotó).
   */
  async guardar(tenantId: string, datos: DatosMercado, versionLeida: number, usuario: string): Promise<GuardadoMercado> {
    const clave = CLAVE_MERCADO(tenantId);
    return PlatformSettingsDB.actualizar<unknown, GuardadoMercado>(
      clave,
      (actual) => {
        const previo = leerDoc(actual);
        if (previo.version !== versionLeida) return { resultado: { ok: false, conflicto: previo } };
        const doc: MercadoEquipo = {
          datos: firmarCambios(previo.datos, normalizarMercado(datos), usuario),
          version: previo.version + 1,
          actualizadoEn: new Date().toISOString(),
          actualizadoPor: usuario,
        };
        return { valor: doc, resultado: { ok: true, doc } };
      },
      usuario,
      { timeout: 10_000, maxWait: 5_000 },
    );
  },
};
