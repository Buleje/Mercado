import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { OPERACIONES_KEY_PREFIX } from "@/lib/forestal/ctp-operaciones";
import { normalizeCtpFicha } from "@/lib/forestal/ctp-ficha-types";
import { ctpComplianceTone } from "@/lib/forestal/ctp-compliance";
import { isValidSpecializationKey, type SpecializationKey } from "@/lib/specializations";
import { esTenantPorDefecto } from "@/lib/tenancy/negocio-por-defecto";
import type { CumplimientoFoto, PlantaIdentidad } from "@/lib/superadmin/plantas-forestales/tipos";

/**
 * PlantasForestalesDB — quiénes son las plantas del superadmin (17-10,
 * «Plantas forestales», fases 1-2).
 *
 * Planta = negocio con `spec:forestal:ctp-libro` encendido. Esta clase sólo
 * dice QUIÉNES son y su identidad; los números de cada una salen de las MISMAS
 * clases que usa su libro (`ForestCtpDB`, `WoodEntriesDB`, …), nunca de SQL
 * propio (lo arma `lib/superadmin/plantas-forestales/resumen.server.ts`).
 *
 * `listar()` es el ÚNICO método que cruza negocios; las rutas validan el
 * `tenantId` que les llega contra él (no es planta → 404). El resto lleva el
 * `tenantId` de la planta como primer parámetro y en el WHERE.
 *
 * Plantas de prueba (Tenant no tiene marca de prueba): por defecto lo son
 * `main` y las copias `-op-` (QA). Lo que el superadmin cambia a mano se guarda
 * como EXCEPCIÓN en `PlatformSetting` `interno:plantas-forestales:prueba`
 * (`{ si, no }`): la copia de QA que se cree mañana sigue entrando sola como
 * prueba. (Congelar la lista entera al primer cambio la dejaba afuera.)
 */

const FLAG_CTP = "spec:forestal:ctp-libro";
const FICHA_PREFIX = "ctp-ficha:";
export const CLAVE_PRUEBA = "interno:plantas-forestales:prueba";

/** Prefijo de TODA la caché de Plantas forestales: «Recalcular» la limpia. */
export const CACHE_PLANTAS = "plantas-forestales:";
const CLAVE_LISTA = `${CACHE_PLANTAS}__lista`;
const TTL_LISTA_SEG = 60;

interface IndiceGrupo {
  tenants?: { tenantId: string; slug: string; nombre: string }[];
}

/** La regla por defecto, sin lista guardada: `main` y las copias de QA. */
export function esPruebaPorDefecto(t: { tenantId: string; slug: string }): boolean {
  return esTenantPorDefecto(t.tenantId) || esTenantPorDefecto(t.slug) || t.slug.includes("-op-");
}

/** Las excepciones a mano: `si` = de prueba aunque la regla diga que no; `no` = al revés. */
interface ExcepcionesPrueba {
  si: string[];
  no: string[];
}

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/** Lo guardado en la clave de prueba; lo que no tenga la forma `{ si, no }`, vacío. */
function excepcionesGuardadas(valor: unknown): ExcepcionesPrueba {
  const o = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  return { si: textos(o.si), no: textos(o.no) };
}

/** ¿Es de prueba? La excepción guardada manda; si no hay, la regla por defecto. */
export function esPruebaConExcepciones(t: { tenantId: string; slug: string }, ex: ExcepcionesPrueba): boolean {
  if (ex.si.includes(t.tenantId)) return true;
  if (ex.no.includes(t.tenantId)) return false;
  return esPruebaPorDefecto(t);
}

/** `Date` → `AAAA-MM-DD` sin pasar por la zona local (columnas `@db.Date`). */
const isoDia = (d: Date): string => d.toISOString().slice(0, 10);

async function leerPlantas(): Promise<PlantaIdentidad[]> {
  const conLibro = await prisma.tenantFeatureFlag.findMany({
    where: { flagKey: FLAG_CTP, enabled: true },
    select: { tenantId: true },
  });
  const ids = [...new Set(conLibro.map((f) => f.tenantId))];
  if (ids.length === 0) return [];

  /* Tres lecturas para todas las plantas juntas, no N: negocios, sus
     especializaciones y sus fichas (de donde sale el grupo, ADR-395). */
  const [tenants, flags, fichas, prueba] = await Promise.all([
    prisma.tenant.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, name: true, active: true, plan: true },
    }),
    prisma.tenantFeatureFlag.findMany({
      where: { tenantId: { in: ids }, enabled: true, flagKey: { startsWith: "spec:" } },
      select: { tenantId: true, flagKey: true },
    }),
    prisma.platformSetting.findMany({
      where: { key: { in: ids.map((id) => `${FICHA_PREFIX}${id}`) } },
      select: { key: true, value: true },
    }),
    PlatformSettingsDB.getFresco<unknown>(CLAVE_PRUEBA),
  ]);

  const grupoDe = new Map<string, string>();
  for (const f of fichas) {
    const grupoId = normalizeCtpFicha(f.value).operacion?.grupoId;
    if (grupoId) grupoDe.set(f.key.slice(FICHA_PREFIX.length), grupoId);
  }
  const grupos = [...new Set(grupoDe.values())];
  const indices =
    grupos.length > 0
      ? await prisma.platformSetting.findMany({
          where: { key: { in: grupos.map((g) => `${OPERACIONES_KEY_PREFIX}${g}`) } },
          select: { key: true, value: true },
        })
      : [];
  const hermanasDe = new Map<string, { tenantId: string; slug: string; nombre: string }[]>();
  for (const i of indices) {
    const tenantsGrupo = (i.value as IndiceGrupo | null)?.tenants;
    if (!Array.isArray(tenantsGrupo)) continue;
    hermanasDe.set(
      i.key.slice(OPERACIONES_KEY_PREFIX.length),
      tenantsGrupo
        .filter((t) => t && typeof t.tenantId === "string")
        .map((t) => ({ tenantId: t.tenantId, slug: String(t.slug ?? ""), nombre: String(t.nombre ?? "") })),
    );
  }

  const specsDe = new Map<string, SpecializationKey[]>();
  for (const f of flags) {
    if (!isValidSpecializationKey(f.flagKey)) continue;
    const lista = specsDe.get(f.tenantId) ?? [];
    lista.push(f.flagKey);
    specsDe.set(f.tenantId, lista);
  }

  const excepciones = excepcionesGuardadas(prueba);

  return tenants
    .map((t): PlantaIdentidad => {
      const grupoId = grupoDe.get(t.id) ?? null;
      return {
        tenantId: t.id,
        slug: t.slug,
        nombre: t.name,
        activo: t.active,
        plan: t.plan,
        esPrueba: esPruebaConExcepciones({ tenantId: t.id, slug: t.slug }, excepciones),
        especializaciones: (specsDe.get(t.id) ?? []).sort(),
        grupoOperaciones: grupoId
          ? {
              grupoId,
              hermanas: (hermanasDe.get(grupoId) ?? []).filter((h) => h.tenantId !== t.id),
            }
          : null,
      };
    })
    .sort((a, b) => Number(a.esPrueba) - Number(b.esPrueba) || a.nombre.localeCompare(b.nombre, "es"));
}

export const PlantasForestalesDB = {
  /**
   * Todas las plantas (negocios con el libro CTP), las reales primero.
   * Cacheado 60 s; lo limpian {@link marcarPrueba} y «Recalcular».
   */
  async listar(): Promise<PlantaIdentidad[]> {
    const caja = await getOrSet<{ v: PlantaIdentidad[] }>(CLAVE_LISTA, TTL_LISTA_SEG, async () => ({
      v: await leerPlantas(),
    }));
    return caja.v;
  },

  /** La planta por id, o `null` si ese negocio no tiene el libro (la ruta responde 404). */
  async obtener(tenantId: string): Promise<PlantaIdentidad | null> {
    if (!tenantId) return null;
    return (await this.listar()).find((p) => p.tenantId === tenantId) ?? null;
  },

  /**
   * Marca o desmarca una planta como de prueba. Sólo se guarda lo que contradice
   * la regla por defecto (volver a la regla borra la excepción). Lee y escribe
   * bajo el candado de la clave (`actualizar`): dos superadmins a la vez no se pisan.
   *
   * @param planta La identidad que la ruta ya validó contra {@link listar}.
   */
  async marcarPrueba(
    planta: { tenantId: string; slug: string },
    esPrueba: boolean,
    actor: string,
  ): Promise<{ esPrueba: boolean }> {
    if (!planta.tenantId) throw new Error("tenantId is required");
    const { tenantId } = planta;
    const resultado = await PlatformSettingsDB.actualizar<unknown, { esPrueba: boolean }>(
      CLAVE_PRUEBA,
      (actual) => {
        const ex = excepcionesGuardadas(actual);
        const si = new Set(ex.si);
        const no = new Set(ex.no);
        si.delete(tenantId);
        no.delete(tenantId);
        if (esPrueba !== esPruebaPorDefecto(planta)) (esPrueba ? si : no).add(tenantId);
        return { valor: { si: [...si].sort(), no: [...no].sort() }, resultado: { esPrueba } };
      },
      actor,
    );
    invalidate(CLAVE_LISTA);
    return resultado;
  },

  /** Limpia la lista cacheada (lo llama «Recalcular»). */
  olvidarLista(): void {
    invalidate(CLAVE_LISTA);
  },

  /**
   * La última foto del puntaje de cumplimiento que guardó el libro de la planta
   * (`ForestCtpComplianceSnapshot`: el gauge la graba al abrirse). `null` = la
   * planta nunca abrió su cumplimiento: no se inventa un puntaje.
   */
  async ultimaFotoCumplimiento(tenantId: string): Promise<CumplimientoFoto | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const foto = await prisma.forestCtpComplianceSnapshot.findFirst({
      where: { tenantId },
      orderBy: [{ fecha: "desc" }, { updatedAt: "desc" }],
      select: { score: true, fecha: true, periodo: true },
    });
    if (!foto) return null;
    return { score: foto.score, tono: ctpComplianceTone(foto.score), fecha: isoDia(foto.fecha), periodo: foto.periodo };
  },

  /**
   * Cuándo se cargó por última vez algo en el libro: el asiento o el ingreso
   * más nuevo (`createdAt`, no la fecha del asiento, que puede ser atrasada).
   * Incluye lo anulado o borrado: también es actividad. `null` = libro vacío.
   */
  async ultimaActividad(tenantId: string): Promise<Date | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const [ingreso, asiento] = await Promise.all([
      prisma.woodEntry.aggregate({ where: { tenantId }, _max: { createdAt: true } }),
      prisma.forestCtpEntry.aggregate({ where: { tenantId }, _max: { createdAt: true } }),
    ]);
    const fechas = [ingreso._max.createdAt, asiento._max.createdAt].filter((d): d is Date => d instanceof Date);
    if (fechas.length === 0) return null;
    return new Date(Math.max(...fechas.map((d) => d.getTime())));
  },
};
