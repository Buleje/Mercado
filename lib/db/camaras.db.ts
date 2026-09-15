import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logger } from "@/lib/logger";
import {
  agregarCamara,
  agregarCaptura,
  nuevoToken,
  quitarCamara,
  rotarToken,
  type Camara,
  type Captura,
  type EventoCamara,
  type ResultadoCamaras,
  configurarAvisos,
  type AvisosCamara,
} from "@/lib/camaras/camaras";

/**
 * CamarasDB — las cámaras del negocio y lo que mandan.
 *
 * POR QUÉ KV y no tablas (mismo criterio que la biblioteca de fotos de especies
 * y que trámites, ADR-308 §4): son unas pocas cámaras por negocio y cada captura
 * es una REFERENCIA (url + hora + motivo, ~150 bytes) — la imagen vive en el
 * storage. Promoverlo a Prisma el día que haga falta guardar años es leer el KV
 * e insertar filas, sin fabricar una migración que necesita DIRECT_URL.
 *
 * ## El índice de tokens es global a propósito
 *
 * Quien empuja una foto es un aparato: manda su token en la URL y nada más. Sin
 * un índice, resolver ese token obligaría a recorrer TODOS los tenants en cada
 * POST. El índice vive en una clave global y sólo guarda `token → {tenant,
 * cámara}`: ni imágenes, ni nombres, ni nada que sirva si se filtra.
 */

const CLAVE_CAMARAS = (tenantId: string) => `camaras:${tenantId}`;
const CLAVE_CAPTURAS = (tenantId: string) => `camaras-capturas:${tenantId}`;
/** token → dónde va. Global: lo consulta un endpoint sin sesión. */
const CLAVE_INDICE = "camaras-token-index";

type Indice = Record<string, { tenantId: string; camaraId: string }>;

const listaDe = (raw: unknown): Camara[] =>
  Array.isArray(raw) ? (raw as Camara[]).filter((c) => c && typeof c.id === "string" && typeof c.token === "string") : [];

export const CamarasDB = {
  async list(tenantId: string): Promise<Camara[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return listaDe(await PlatformSettingsDB.get<unknown>(CLAVE_CAMARAS(tenantId)));
  },

  async capturas(tenantId: string, opts: { camaraId?: string; limite?: number } = {}): Promise<Captura[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(CLAVE_CAPTURAS(tenantId));
    const todas = Array.isArray(raw) ? (raw as Captura[]) : [];
    const filtradas = opts.camaraId ? todas.filter((c) => c.camaraId === opts.camaraId) : todas;
    return filtradas.slice(0, opts.limite ?? 200);
  },

  /** Alta. Devuelve la cámara con su token — es lo único que hay que copiar. */
  async crear(tenantId: string, entrada: { nombre: string; lugar?: string }, user: string) {
    const camaras = await this.list(tenantId);
    const id = `cam_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const token = nuevoToken();
    const r = agregarCamara(camaras, entrada, { id, token });
    if (!r.ok) return r;
    await this.guardar(tenantId, r.camaras, user);
    await this.indexar(tenantId, r.camaras);
    return { ...r, camara: r.camaras.find((c) => c.id === id)! };
  },

  async rotar(tenantId: string, camaraId: string, user: string): Promise<ResultadoCamaras> {
    const camaras = await this.list(tenantId);
    const viejo = camaras.find((c) => c.id === camaraId)?.token;
    const r = rotarToken(camaras, camaraId, nuevoToken());
    if (!r.ok) return r;
    await this.guardar(tenantId, r.camaras, user);
    /* El token viejo se borra del índice en el mismo acto: si sólo se agregara
       el nuevo, el anterior seguiría entrando y rotar no serviría de nada. */
    await this.indexar(tenantId, r.camaras, viejo ? [viejo] : []);
    return r;
  },

  async quitar(tenantId: string, camaraId: string, user: string): Promise<ResultadoCamaras> {
    const camaras = await this.list(tenantId);
    const viejo = camaras.find((c) => c.id === camaraId)?.token;
    const r = quitarCamara(camaras, camaraId);
    if (!r.ok) return r;
    await this.guardar(tenantId, r.camaras, user);
    await this.indexar(tenantId, r.camaras, viejo ? [viejo] : []);
    return r;
  },

  /** A quién y cuándo avisa una cámara por WhatsApp. */
  async configurarAvisos(
    tenantId: string,
    camaraId: string,
    avisos: { whatsapp: string; cuando: AvisosCamara["cuando"] },
    user: string,
  ): Promise<ResultadoCamaras> {
    const camaras = await this.list(tenantId);
    const r = configurarAvisos(camaras, camaraId, avisos);
    if (!r.ok) return r;
    await this.guardar(tenantId, r.camaras, user);
    return r;
  },

  /** Deja anotado que se mandó un aviso: es lo que frena el siguiente. */
  async marcarAvisada(tenantId: string, camaraId: string, cuando: Date): Promise<void> {
    const camaras = await this.list(tenantId);
    const nuevas = camaras.map((c) =>
      c.id === camaraId && c.avisos ? { ...c, avisos: { ...c.avisos, ultimoAvisoEn: cuando.toISOString() } } : c,
    );
    await this.guardar(tenantId, nuevas, "camara");
  },

  /** Resuelve el token que trae la URL de una cámara. `null` = no entra. */
  async porToken(token: string): Promise<{ tenantId: string; camara: Camara } | null> {
    const limpio = (token ?? "").trim();
    if (limpio.length < 16) return null;
    const indice = (await PlatformSettingsDB.get<Indice>(CLAVE_INDICE)) ?? {};
    const donde = indice[limpio];
    if (!donde) return null;
    const camara = (await this.list(donde.tenantId)).find((c) => c.id === donde.camaraId);
    /* El índice puede quedar viejo (una cámara borrada a mano en el KV): la
       verdad es la lista del tenant, no el índice. */
    if (!camara || camara.token !== limpio || !camara.activa) return null;
    return { tenantId: donde.tenantId, camara };
  },

  /** Guarda lo que mandó una cámara. La hora la pone el servidor. */
  async registrarCaptura(
    tenantId: string,
    entrada: {
      camaraId: string;
      url: string;
      evento: EventoCamara;
      nota?: string | null;
      lectura?: Captura["lectura"];
    },
  ): Promise<{ captura: Captura; descartadas: number }> {
    const captura: Captura = {
      id: `cap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      camaraId: entrada.camaraId,
      url: entrada.url,
      evento: entrada.evento,
      /* La hora la pone el servidor: una cámara en el campo puede tener el reloj
         corrido y el historial ordenaría mal justo cuando hay que reconstruir
         qué pasó. Lo que ella diga de sí misma queda en la nota. */
      at: new Date().toISOString(),
      nota: entrada.nota?.trim() || null,
      lectura: entrada.lectura ?? null,
    };
    const previas = await PlatformSettingsDB.get<unknown>(CLAVE_CAPTURAS(tenantId));
    const { capturas, descartadas } = agregarCaptura(
      Array.isArray(previas) ? (previas as Captura[]) : [],
      captura,
    );
    await PlatformSettingsDB.set(CLAVE_CAPTURAS(tenantId), capturas, "camara");

    /* «Cuándo se la vio por última vez» va en la cámara: es lo que permite
       avisar que una dejó de mandar (sin batería, sin datos) sin recorrer el
       historial entero en cada pantalla. */
    const camaras = await this.list(tenantId);
    await this.guardar(
      tenantId,
      camaras.map((c) => (c.id === entrada.camaraId ? { ...c, ultimaCapturaEn: captura.at } : c)),
      "camara",
    );
    return { captura, descartadas };
  },

  /**
   * Guarda lo que la IA leyó de una foto que ya estaba.
   *
   * Va aparte del alta porque el análisis ocurre DESPUÉS: la foto se guarda
   * primero (que entre es lo que no se puede perder) y se lee en segundo plano.
   * Si el análisis falla o tarda, la foto ya está.
   */
  async guardarLectura(
    tenantId: string,
    capturaId: string,
    lectura: Captura["lectura"],
  ): Promise<boolean> {
    const previas = await PlatformSettingsDB.get<unknown>(CLAVE_CAPTURAS(tenantId));
    const todas = Array.isArray(previas) ? (previas as Captura[]) : [];
    let tocada = false;
    const next = todas.map((c) => {
      if (c.id !== capturaId) return c;
      tocada = true;
      return { ...c, lectura };
    });
    if (!tocada) return false;
    await PlatformSettingsDB.set(CLAVE_CAPTURAS(tenantId), next, "ia");
    return true;
  },

  /**
   * Borra UNA foto del historial.
   *
   * Hace falta por lo mismo que cualquier bandeja: entra una prueba, una foto
   * de la lona tapando el lente, o algo que no corresponde guardar. Se borra la
   * referencia; el archivo queda en el storage —barato y con su URL sin
   * publicar— porque borrarlo también es un pedido distinto (y más difícil de
   * deshacer).
   */
  async borrarCaptura(tenantId: string, capturaId: string, user: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const previas = await PlatformSettingsDB.get<unknown>(CLAVE_CAPTURAS(tenantId));
    const todas = Array.isArray(previas) ? (previas as Captura[]) : [];
    const quedan = todas.filter((c) => c.id !== capturaId);
    if (quedan.length === todas.length) return false;
    await PlatformSettingsDB.set(CLAVE_CAPTURAS(tenantId), quedan, user);
    return true;
  },

  async guardar(tenantId: string, camaras: Camara[], user: string): Promise<void> {
    await PlatformSettingsDB.set(CLAVE_CAMARAS(tenantId), camaras, user);
  },

  /** Deja el índice igual a la lista real, y borra los tokens que ya no existen. */
  async indexar(tenantId: string, camaras: Camara[], borrar: string[] = []): Promise<void> {
    try {
      const indice = (await PlatformSettingsDB.get<Indice>(CLAVE_INDICE)) ?? {};
      for (const t of borrar) delete indice[t];
      for (const c of camaras) indice[c.token] = { tenantId, camaraId: c.id };
      await PlatformSettingsDB.set(CLAVE_INDICE, indice, "sistema");
    } catch (err) {
      /* Sin índice la cámara no puede entregar: se loguea fuerte en vez de
         dejar el alta «exitosa» con una cámara que nunca va a poder mandar. */
      logger.error("[camaras] no se pudo actualizar el índice de tokens", {
        error: String(err),
        tenantId,
      });
      throw err;
    }
  },
};
