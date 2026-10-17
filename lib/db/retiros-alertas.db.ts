import "server-only";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import type { AlertaRetiro, JustificacionAlerta } from "@/lib/delivery/retiros-conciliacion";

/**
 * Justificaciones de las alertas de retiros (17-10, P36): «el supervisor puede
 * justificar operaciones distintas». Sin migración: viven en la tabla clave →
 * valor (`PlatformSetting`), una clave por negocio con prefijo `interno:` (no
 * viaja en la configuración de la plataforma ni la invalida).
 *
 * Guardar NO toca ningún retiro: sólo anota quién revisó la coincidencia, cuándo
 * y por qué. Se guardan sólo las de alertas vigentes (la lista no crece sola).
 */
const clave = (tenantId: string) => `${PREFIJO_INTERNO}retiros-alertas-justificadas:${tenantId}`;

type Mapa = Record<string, JustificacionAlerta>;

function esMapa(v: unknown): v is Mapa {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export const RetirosAlertasDB = {
  /** Las alertas con su justificación, si la tienen. */
  async conJustificacion(tenantId: string, alertas: AlertaRetiro[]): Promise<AlertaRetiro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (alertas.length === 0) return alertas;
    const guardadas = await PlatformSettingsDB.get<Mapa>(clave(tenantId));
    const mapa = esMapa(guardadas) ? guardadas : {};
    return alertas.map((a) => ({ ...a, revisada: mapa[a.clave] ?? null }));
  },

  /**
   * Anota (o quita, con `motivo` null) la justificación de una alerta vigente.
   * `vigentes` = las claves de las alertas de este momento: las demás se podan.
   */
  async justificar(
    tenantId: string,
    claveAlerta: string,
    motivo: string | null,
    por: string,
    vigentes: string[],
    ahora: Date = new Date(),
  ): Promise<JustificacionAlerta | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const vivas = new Set(vigentes);
    return PlatformSettingsDB.actualizar<Mapa, JustificacionAlerta | null>(
      clave(tenantId),
      (actual) => {
        const previo = esMapa(actual) ? actual : {};
        const valor: Mapa = {};
        for (const [k, v] of Object.entries(previo)) if (vivas.has(k) && k !== claveAlerta) valor[k] = v;
        const nueva = motivo ? { motivo, por, en: ahora.toISOString() } : null;
        if (nueva) valor[claveAlerta] = nueva;
        return { valor, resultado: nueva };
      },
      por,
    );
  },
};
