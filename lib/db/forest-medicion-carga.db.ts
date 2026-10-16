import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import {
  agregarFoto,
  aplicarAccion,
  armarCarga,
  crearCarga,
  liberarCargas,
  normalizarAlmacen,
  podar,
  recientes,
  reservarCargas,
  vigentes,
  type AccionCarga,
  type AlmacenCargas,
  type CargaMedida,
  type Firma,
  type FotoCarga,
  type NuevaCarga,
  type ResultadoArmar,
  type ResultadoCambio,
  type ResultadoCrear,
  type ResultadoReservar,
} from "@/lib/forestal/medicion-carga";

/**
 * ForestMedicionCargaDB — las cargas medidas en el monte, por tenant (16-10, F3).
 *
 * POR QUÉ KV: es un borrador compartido entre el celular del monte y la PC de
 * la oficina, con vida de días (se mide, se recoge, se usa en una guía); el
 * movimiento del libro lo escribe el despacho al registrar. Mismo patrón que la
 * cola «Por imprimir» (`ForestGtfColaMonteDB`): un `PlatformSetting` por tenant,
 * lectura fresca y escritura con bloqueo por clave (ADR-445). Con `esperaMaxMs`
 * la segunda PC que escribe a la vez no hace fila 5 s: recibe
 * `ClaveOcupadaError` y la ruta contesta 409 («otra PC está guardando»).
 *
 * Clave `interno:`: es dato de trabajo, no configuración — no invalida la
 * lista entera de ajustes de la plataforma en cada guardado.
 */

const KEY_PREFIX = `${PREFIJO_INTERNO}medicion-carga:`;
/** Cuánto espera la clave antes del 409: un guardado tarda decenas de ms. */
const ESPERA_CLAVE_MS = 3000;
/** Soltar las cargas de una guía que no se registró espera más: si no se sueltan, quedan «usadas» sin guía. */
const ESPERA_LIBERAR_MS = 10_000;

export const claveMedicionCarga = (tenantId: string): string => `${KEY_PREFIX}${tenantId}`;

const firma = (user: string) => ({ en: new Date().toISOString(), por: user });

export type ResultadoGuardar = ResultadoCrear | Extract<ResultadoArmar, { ok: false }>;

export const ForestMedicionCargaDB = {
  async leer(tenantId: string): Promise<AlmacenCargas> {
    if (!tenantId) throw new Error("tenantId is required");
    return podar(normalizarAlmacen(await PlatformSettingsDB.getFresco<unknown>(claveMedicionCarga(tenantId))), Date.now());
  },

  /** Las sin usar (la oficina las recoge) y las últimas terminadas (el monte ve qué pasó con lo suyo). */
  async lista(tenantId: string): Promise<{ cargas: CargaMedida[]; recientes: CargaMedida[] }> {
    const alm = await ForestMedicionCargaDB.leer(tenantId);
    return { cargas: vigentes(alm), recientes: recientes(alm) };
  },

  async get(tenantId: string, id: string): Promise<CargaMedida | null> {
    const alm = await ForestMedicionCargaDB.leer(tenantId);
    return alm.cargas.find((c) => c.id === id) ?? null;
  },

  /** Valida las filas, recalcula el volumen y la guarda «medida». */
  async crear(tenantId: string, entrada: NuevaCarga, user = "unknown"): Promise<ResultadoGuardar> {
    if (!tenantId) throw new Error("tenantId is required");
    const armada = armarCarga(entrada, firma(user), randomUUID());
    if (!armada.ok) return armada;
    return PlatformSettingsDB.actualizar<unknown, ResultadoCrear>(
      claveMedicionCarga(tenantId),
      (actual) => {
        const r = crearCarga(normalizarAlmacen(actual), armada.carga, Date.now());
        return r.ok ? { valor: r.almacen, resultado: r } : { resultado: r };
      },
      user,
      { esperaMaxMs: ESPERA_CLAVE_MS },
    );
  },

  /** Ata una foto ya subida al Drive (su id de documento) a la carga. */
  async agregarFoto(tenantId: string, id: string, foto: FotoCarga, user = "unknown"): Promise<ResultadoCambio> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, ResultadoCambio>(
      claveMedicionCarga(tenantId),
      (actual) => {
        const r = agregarFoto(normalizarAlmacen(actual), id, foto);
        return r.ok && r.cambio ? { valor: r.almacen, resultado: r } : { resultado: r };
      },
      user,
      { esperaMaxMs: ESPERA_CLAVE_MS },
    );
  },

  /**
   * Las cargas de la guía que se va a registrar quedan `usada` con su N°, todas
   * o ninguna, ANTES de escribir el libro (la clave es el candado: dos PCs con
   * la misma carga → la 2.ª recibe `otra_guia`). Devuelve la firma para soltarlas.
   */
  async reservar(
    tenantId: string,
    ids: readonly string[],
    gtfNumber: string,
    user = "unknown",
  ): Promise<ResultadoReservar & { firma: Firma }> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = firma(user);
    const r = await PlatformSettingsDB.actualizar<unknown, ResultadoReservar>(
      claveMedicionCarga(tenantId),
      (actual) => {
        const res = reservarCargas(normalizarAlmacen(actual), ids, gtfNumber, f);
        return res.ok && res.cambiadas.length ? { valor: res.almacen, resultado: res } : { resultado: res };
      },
      user,
      { esperaMaxMs: ESPERA_CLAVE_MS },
    );
    return { ...r, firma: f };
  },

  /** El registro falló: vuelven a `medida` las que `reservar` marcó con esa firma. */
  async liberar(tenantId: string, ids: readonly string[], gtfNumber: string, f: Firma, user = "unknown"): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (ids.length === 0) return [];
    return PlatformSettingsDB.actualizar<unknown, string[]>(
      claveMedicionCarga(tenantId),
      (actual) => {
        const r = liberarCargas(normalizarAlmacen(actual), ids, gtfNumber, f);
        return r.liberadas.length ? { valor: r.almacen, resultado: r.liberadas } : { resultado: r.liberadas };
      },
      user,
      /* La transacción tiene que durar más que la espera (Prisma corta a los 5 s). */
      { esperaMaxMs: ESPERA_LIBERAR_MS, timeout: ESPERA_LIBERAR_MS + 5000 },
    );
  },

  /** medida → usada (N° de guía) o descartada (motivo). */
  async accion(tenantId: string, id: string, accion: AccionCarga, user = "unknown"): Promise<ResultadoCambio> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, ResultadoCambio>(
      claveMedicionCarga(tenantId),
      (actual) => {
        const r = aplicarAccion(normalizarAlmacen(actual), id, accion, firma(user));
        return r.ok && r.cambio ? { valor: r.almacen, resultado: r } : { resultado: r };
      },
      user,
      { esperaMaxMs: ESPERA_CLAVE_MS },
    );
  },
};
