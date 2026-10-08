import "server-only";
import { lookup } from "node:dns/promises";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { cifrarSecreto, descifrarSecreto, hayClaveDeCifrado } from "@/lib/cripto-secretos";
import type { CredencialesCamara } from "@/lib/camaras/isapi";
import {
  agregarCamara,
  agregarCaptura,
  anotarPrueba,
  camarasParaPantalla,
  conectarCamara,
  desconectarCamara,
  hostPermitido,
  ipPermitida,
  nuevoToken,
  puertoPermitido,
  quitarCamara,
  rotarToken,
  type Camara,
  type CamaraPublica,
  type Captura,
  type EventoCamara,
  type PruebaDeCamara,
  type ResultadoCamaras,
  configurarAvisos,
  renombrarCamara,
  type AvisosCamara,
  type ChalecosDelNegocio,
  MAX_CAPTURAS,
} from "@/lib/camaras/camaras";
import {
  aplicarAnalisis,
  asignarChaleco,
  chalecosDe,
  configurarVigilaPila,
  confirmarCruce,
  puedeAvisarPila,
  puedeCompararPila,
  type AnalisisDeCaptura,
  type ResultadoChalecos,
  type ResultadoConfirmar,
} from "@/lib/camaras/cruces";
import { diasRetencionDe, diasRetencionValidos } from "@/lib/camaras/personas-retencion";
import { configurarPuente, type CambiosPuente } from "@/lib/camaras/vivo";

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
/**
 * El historial va como `interno:` (ADR-456): con la lectura, los cruces y la
 * pila una foto pesa ~1,4 KB y 800 son ~1,1 MB. Como clave de configuración
 * viajaba dentro de `getAll()` —que lee el layout de TODA la plataforma— y cada
 * foto que entraba invalidaba esa foto global. Antes del 01-10 vivía en
 * `camaras-capturas:<tenantId>`; no hubo capturas reales en esa clave (Blas: 0).
 */
const CLAVE_CAPTURAS = (tenantId: string) => `interno:camaras-capturas:${tenantId}`;
/** Número de chaleco/casco → colaborador (ADR-456 §3). */
const CLAVE_CHALECOS = (tenantId: string) => `camaras-chalecos:${tenantId}`;
/**
 * Cuándo salió el último aviso de pila de cada cámara. `interno:` porque se
 * escribe desde la ingesta: no viaja en `getAll()` ni invalida su foto.
 */
const CLAVE_AVISO_PILA = (tenantId: string) => `interno:camaras-pila-aviso:${tenantId}`;
/** Cuántos días se guardan las fotos del detector de personas: `{ dias }` (default 30). */
const CLAVE_RETENCION_PERSONAS = (tenantId: string) => `camaras-personas-retencion:${tenantId}`;
/** Cuándo (hora de la FOTO) se reservó la última comparación de pila de cada cámara. */
const CLAVE_COMPARACION_PILA = (tenantId: string) => `interno:camaras-pila-comparacion:${tenantId}`;

/**
 * Cuánto se espera para EMPEZAR la transacción del candado. Con el default de
 * Prisma (2 s) una ráfaga de 4 fotos sobre un pool frío daba P2028 «Unable to
 * start a transaction in the given time» (medido 01-10 desde local: abrir las
 * conexiones al pooler tardó ~1 s): la foto ya estaba en el storage y la
 * captura no se anotaba. El candado en sí dura ~300 ms por escritor.
 */
const TX_KV = { maxWait: 10_000, timeout: 10_000 } as const;

/** Un turno por cámara: `camaraId → ISO` de quien lo tomó. */
type Turno = { ok: boolean; previo: string | null };
const mapaDeTurnos = (actual: unknown): Record<string, string> =>
  actual && typeof actual === "object" && !Array.isArray(actual) ? { ...(actual as Record<string, string>) } : {};

/**
 * Toma el turno de una cámara bajo candado: lee lo anotado, decide con `puede`
 * y, si toca, anota `en`. Dos fotos de la misma ráfaga hacen fila acá: la
 * primera lo toma, la segunda ve el turno tomado. Devuelve lo que había para
 * poder devolverlo si lo que se iba a hacer falla.
 */
async function reservarTurno(
  clave: string,
  camaraId: string,
  en: string,
  puede: (previo: string | null) => boolean,
): Promise<Turno> {
  return PlatformSettingsDB.actualizar<unknown, Turno>(
    clave,
    (actual) => {
      const mapa = mapaDeTurnos(actual);
      const previo = typeof mapa[camaraId] === "string" ? mapa[camaraId] : null;
      if (!puede(previo)) return { resultado: { ok: false, previo } };
      return { valor: { ...mapa, [camaraId]: en }, resultado: { ok: true, previo } };
    },
    "camara",
    TX_KV,
  );
}

/** Devuelve el turno — sólo si sigue siendo el que se tomó (nadie lo tomó después). */
async function liberarTurno(clave: string, camaraId: string, en: string, previo: string | null): Promise<void> {
  await PlatformSettingsDB.actualizar<unknown, null>(
    clave,
    (actual) => {
      const mapa = mapaDeTurnos(actual);
      if (mapa[camaraId] !== en) return { resultado: null };
      if (previo) mapa[camaraId] = previo;
      else delete mapa[camaraId];
      return { valor: mapa, resultado: null };
    },
    "camara",
    TX_KV,
  );
}
/** token → dónde va. Global: lo consulta un endpoint sin sesión. */
const CLAVE_INDICE = "camaras-token-index";

type Indice = Record<string, { tenantId: string; camaraId: string }>;

const listaDe = (raw: unknown): Camara[] =>
  Array.isArray(raw) ? (raw as Camara[]).filter((c) => c && typeof c.id === "string" && typeof c.token === "string") : [];
const capturasDe = (raw: unknown): Captura[] => (Array.isArray(raw) ? (raw as Captura[]) : []);

/**
 * Cambia la lista de cámaras leyéndola FRESCA y bajo candado.
 *
 * Antes cada cambio era `get` (caché de 5 min por instancia) + `set`: la foto
 * que entraba a las 10:00:01 reescribía la lista entera con lo que esa
 * instancia tenía en memoria, y podía devolver a «apagado» el aviso o la pila
 * que alguien acababa de prender en el panel. `actualizar` lee de la base
 * dentro de una transacción con advisory lock por clave: dos escritores de la
 * misma lista hacen fila en vez de pisarse.
 */
async function mutarCamaras(
  tenantId: string,
  user: string,
  cambio: (camaras: Camara[]) => ResultadoCamaras,
): Promise<ResultadoCamaras & { antes?: Camara[] }> {
  if (!tenantId) throw new Error("tenantId is required");
  return PlatformSettingsDB.actualizar<unknown, ResultadoCamaras & { antes?: Camara[] }>(
    CLAVE_CAMARAS(tenantId),
    (actual) => {
      const antes = listaDe(actual);
      const r = cambio(antes);
      return r.ok ? { valor: r.camaras, resultado: { ...r, antes } } : { resultado: r };
    },
    user,
    TX_KV,
  );
}

/**
 * Lo mismo para el historial de fotos: alta, análisis, confirmación y baja
 * pasan por acá. Es un arreglo de hasta 800 capturas que se reescribe entero;
 * sin candado, la lectura de la IA de una foto borraba la foto que había
 * entrado mientras tanto.
 */
async function mutarCapturas<R>(
  tenantId: string,
  user: string,
  cambio: (capturas: Captura[]) => { valor?: Captura[]; resultado: R },
): Promise<R> {
  if (!tenantId) throw new Error("tenantId is required");
  return PlatformSettingsDB.actualizar<unknown, R>(CLAVE_CAPTURAS(tenantId), (actual) => cambio(capturasDe(actual)), user, TX_KV);
}

/**
 * El host pelado: sin corchetes y sin el puerto pegado.
 *
 * La dirección se copia de la app del fabricante y suele venir «192.168.1.64:8000».
 * El `::` de una IPv6 se respeta: ahí los dos puntos no son un puerto.
 */
function soloHost(host: string): string {
  const h = host.trim();
  const conCorchetes = /^\[([^\]]+)\](?::\d+)?$/.exec(h);
  if (conCorchetes) return conCorchetes[1];
  if (!h.includes("::") && (h.match(/:/g)?.length ?? 0) === 1) return h.split(":")[0];
  return h;
}

/**
 * ¿A esta dirección se puede llamar DE VERDAD?
 *
 * `hostPermitido` sólo mira el texto, y un NOMBRE no dice a dónde apunta:
 * `camara.mi-dominio.com` puede resolver a `169.254.169.254` y llevarse las
 * credenciales de la nube. Por eso acá se resuelve con el DNS y se juzga **cada
 * IP que devuelve** — no la primera, porque un dominio hostil puede devolver
 * una buena y una mala y el sistema operativo elegir cualquiera.
 *
 * Lo que NO cierra: entre esta resolución y la conexión real hay una ventana
 * (DNS rebinding) en la que el dueño del dominio puede cambiar la respuesta.
 * Cerrarla pide fijar la IP en el socket, que no está en el contrato del
 * cliente ISAPI. Por eso estos endpoints piden sesión de admin/owner: quien
 * podría aprovecharla ya entró al panel.
 */
export async function destinoResuelto(
  host: string,
  puerto: number,
): Promise<{ ok: true; ip: string } | { ok: false; motivo: string; detalle: string }> {
  const forma = hostPermitido(host);
  if (!forma.ok) return { ok: false, motivo: "bloqueado", detalle: forma.motivo };
  const p = puertoPermitido(puerto);
  if (!p.ok) return { ok: false, motivo: "bloqueado", detalle: p.motivo };

  let direcciones: { address: string }[];
  try {
    /* `all` para ver TODAS las respuestas; el timeout evita que un DNS colgado
       deje el pedido esperando hasta el tope de la plataforma. */
    direcciones = await Promise.race([
      lookup(soloHost(host), { all: true, verbatim: true }),
      new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("dns-timeout")), 3000)),
    ]);
  } catch (err) {
    return {
      ok: false,
      motivo: "inalcanzable",
      detalle:
        String(err).includes("dns-timeout")
          ? "El nombre tardó demasiado en resolverse."
          : `No se pudo resolver «${host}». Revisa que esté bien escrito.`,
    };
  }
  if (!direcciones.length) {
    return { ok: false, motivo: "inalcanzable", detalle: `«${host}» no apunta a ninguna dirección.` };
  }
  for (const d of direcciones) {
    const v = ipPermitida(d.address);
    if (!v.ok) return { ok: false, motivo: "bloqueado", detalle: v.motivo };
  }
  return { ok: true, ip: direcciones[0].address };
}

/** Las credenciales listas para usar, o por qué no se pueden usar. */
export type CredencialesListas =
  | { ok: true; camara: Camara; credenciales: CredencialesCamara }
  | { ok: false; motivo: string; detalle: string };

export const CamarasDB = {
  async list(tenantId: string): Promise<Camara[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return listaDe(await PlatformSettingsDB.get<unknown>(CLAVE_CAMARAS(tenantId)));
  },

  async capturas(tenantId: string, opts: { camaraId?: string; limite?: number } = {}): Promise<Captura[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const todas = capturasDe(await PlatformSettingsDB.get<unknown>(CLAVE_CAPTURAS(tenantId)));
    const filtradas = opts.camaraId ? todas.filter((c) => c.camaraId === opts.camaraId) : todas;
    return filtradas.slice(0, Math.min(opts.limite ?? 200, MAX_CAPTURAS));
  },

  /** Alta. Devuelve la cámara con su token — es lo único que hay que copiar. */
  async crear(tenantId: string, entrada: { nombre: string; lugar?: string }, user: string) {
    const id = `cam_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const token = nuevoToken();
    const r = await mutarCamaras(tenantId, user, (camaras) => agregarCamara(camaras, entrada, { id, token }));
    if (!r.ok) return r;
    await this.indexar(tenantId, r.camaras);
    return { ...r, camara: r.camaras.find((c) => c.id === id)! };
  },

  async rotar(tenantId: string, camaraId: string, user: string): Promise<ResultadoCamaras> {
    const r = await mutarCamaras(tenantId, user, (camaras) => rotarToken(camaras, camaraId, nuevoToken()));
    if (!r.ok) return r;
    const viejo = r.antes?.find((c) => c.id === camaraId)?.token;
    /* El token viejo se borra del índice en el mismo acto: si sólo se agregara
       el nuevo, el anterior seguiría entrando y rotar no serviría de nada. */
    await this.indexar(tenantId, r.camaras, viejo ? [viejo] : []);
    return r;
  },

  async quitar(tenantId: string, camaraId: string, user: string): Promise<ResultadoCamaras> {
    const r = await mutarCamaras(tenantId, user, (camaras) => quitarCamara(camaras, camaraId));
    if (!r.ok) return r;
    const viejo = r.antes?.find((c) => c.id === camaraId)?.token;
    await this.indexar(tenantId, r.camaras, viejo ? [viejo] : []);
    return r;
  },

  /** Nombre (y lugar) de una cámara: el id y su token no cambian, ni sus fotos ni su enlace. */
  async renombrar(
    tenantId: string,
    camaraId: string,
    entrada: { nombre: string; lugar?: string },
    user: string,
  ): Promise<ResultadoCamaras> {
    return mutarCamaras(tenantId, user, (camaras) => renombrarCamara(camaras, camaraId, entrada));
  },

  /** A quién y cuándo avisa una cámara por WhatsApp. */
  async configurarAvisos(
    tenantId: string,
    camaraId: string,
    avisos: { whatsapp: string; cuando: AvisosCamara["cuando"] },
    user: string,
  ): Promise<ResultadoCamaras> {
    return mutarCamaras(tenantId, user, (camaras) => configurarAvisos(camaras, camaraId, avisos));
  },

  /** Prende o apaga la vigilancia de la pila de trozas en una cámara (ADR-456 §4). */
  async configurarVigilaPila(tenantId: string, camaraId: string, activa: boolean, user: string): Promise<ResultadoCamaras> {
    const r = await mutarCamaras(tenantId, user, (camaras) => configurarVigilaPila(camaras, camaraId, activa));
    if (r.ok) {
      logActivity(
        "camara.vigila_pila",
        "camara",
        `${activa ? "Prendió" : "Apagó"} la vigilancia de la pila en «${r.camaras.find((c) => c.id === camaraId)?.nombre ?? camaraId}»`,
        camaraId,
        user,
        undefined,
        tenantId,
      ).catch((err) => logger.error("[camaras] no se pudo auditar la pila", { error: String(err), tenantId }));
    }
    return r;
  },

  /**
   * Fuente, recorte y ajustes del puente de pantalla de una cámara (ADR-466).
   * Va en la misma lista de cámaras (sin migración): `porToken` la lee en cada
   * cuadro y el recorte se aplica desde el siguiente.
   */
  async configurarPuente(tenantId: string, camaraId: string, cambios: CambiosPuente, user: string): Promise<ResultadoCamaras> {
    const r = await mutarCamaras(tenantId, user, (camaras) => configurarPuente(camaras, camaraId, cambios));
    if (r.ok) {
      logActivity(
        "camara.puente",
        "camara",
        `Ajustó el puente de pantalla de «${r.camaras.find((c) => c.id === camaraId)?.nombre ?? camaraId}»: ${JSON.stringify(cambios).slice(0, 300)}`,
        camaraId,
        user,
        undefined,
        tenantId,
      ).catch((err) => logger.error("[camaras] no se pudo auditar el puente", { error: String(err), tenantId }));
    }
    return r;
  },

  /**
   * Toma el turno del aviso por WhatsApp de una cámara ANTES de mandarlo y bajo
   * candado: lee la cámara fresca, decide con `puede` y, si toca, deja anotado
   * `avisos.ultimoAvisoEn = ahora` (la misma pausa que usan las fotos de la IA).
   *
   * `marcarAvisada` anota DESPUÉS de mandar: dos fotos a 1-2 s de distancia
   * («apareció» y «llegó otra», o el mosaico abierto en dos pantallas) pasaban
   * las dos la pausa y salían dos WhatsApps por la misma persona. Devuelve lo
   * que había para devolverlo si el envío falla.
   */
  async reservarAviso(
    tenantId: string,
    camaraId: string,
    ahora: Date,
    puede: (camara: Camara) => boolean,
  ): Promise<{ ok: true; camara: Camara; previo: string | null } | { ok: false }> {
    if (!tenantId) throw new Error("tenantId is required");
    const en = ahora.toISOString();
    return PlatformSettingsDB.actualizar<unknown, { ok: true; camara: Camara; previo: string | null } | { ok: false }>(
      CLAVE_CAMARAS(tenantId),
      (actual) => {
        const camaras = listaDe(actual);
        const camara = camaras.find((c) => c.id === camaraId);
        if (!camara?.avisos || !puede(camara)) return { resultado: { ok: false } };
        const tomada: Camara = { ...camara, avisos: { ...camara.avisos, ultimoAvisoEn: en } };
        return {
          valor: camaras.map((c) => (c.id === camaraId ? tomada : c)),
          resultado: { ok: true, camara: tomada, previo: camara.avisos.ultimoAvisoEn ?? null },
        };
      },
      "camara",
      TX_KV,
    );
  },

  /** Devuelve el turno de `reservarAviso` si el WhatsApp no salió — sólo si nadie lo tomó después. */
  async liberarAviso(tenantId: string, camaraId: string, reservadoEn: Date, previo: string | null): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const en = reservadoEn.toISOString();
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE_CAMARAS(tenantId),
      (actual) => {
        const camaras = listaDe(actual);
        if (!camaras.some((c) => c.id === camaraId && c.avisos?.ultimoAvisoEn === en)) return { resultado: null };
        return {
          valor: camaras.map((c) =>
            c.id === camaraId && c.avisos ? { ...c, avisos: { ...c.avisos, ultimoAvisoEn: previo } } : c,
          ),
          resultado: null,
        };
      },
      "camara",
      TX_KV,
    );
  },

  /** Deja anotado que se mandó un aviso: es lo que frena el siguiente. */
  async marcarAvisada(tenantId: string, camaraId: string, cuando: Date): Promise<void> {
    await mutarCamaras(tenantId, "camara", (camaras) =>
      /* Sin la cámara (la sacaron mientras salía el aviso) no se reescribe nada. */
      camaras.some((c) => c.id === camaraId && c.avisos)
        ? {
            ok: true,
            mensaje: "",
            camaras: camaras.map((c) =>
              c.id === camaraId && c.avisos ? { ...c, avisos: { ...c.avisos, ultimoAvisoEn: cuando.toISOString() } } : c,
            ),
          }
        : { ok: false, motivo: "sin cámara" },
    );
  },

  /** Resuelve el token que trae la URL de una cámara. `null` = no entra. */
  async porToken(token: string): Promise<{ tenantId: string; camara: Camara } | null> {
    const limpio = (token ?? "").trim();
    if (limpio.length < 16) return null;
    const indice = (await PlatformSettingsDB.get<Indice>(CLAVE_INDICE)) ?? {};
    /* `Object.hasOwn`: un token como `__defineGetter__` daba 500 al tomar una
       función heredada del prototipo (revisión de seguridad 03-10). */
    const donde = Object.hasOwn(indice, limpio) ? indice[limpio] : undefined;
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
    const descartadas = await mutarCapturas(tenantId, "camara", (previas) => {
      const r = agregarCaptura(previas, captura);
      return { valor: r.capturas, resultado: r.descartadas };
    });

    /* «Cuándo se la vio por última vez» va en la cámara: es lo que permite
       avisar que una dejó de mandar (sin batería, sin datos) sin recorrer el
       historial entero en cada pantalla. */
    await mutarCamaras(tenantId, "camara", (camaras) =>
      camaras.some((c) => c.id === entrada.camaraId)
        ? {
            ok: true,
            mensaje: "",
            camaras: camaras.map((c) => (c.id === entrada.camaraId ? { ...c, ultimaCapturaEn: captura.at } : c)),
          }
        : { ok: false, motivo: "sin cámara" },
    );
    return { captura, descartadas };
  },

  /**
   * Guarda lo que el análisis dejó de una foto que ya estaba: la lectura de la
   * IA, los cruces con guías/fletes/personal y la pila — en UNA escritura.
   *
   * Va aparte del alta porque el análisis ocurre DESPUÉS: la foto se guarda
   * primero (que entre es lo que no se puede perder) y se lee en segundo plano.
   * Y va en una sola porque el historial es un arreglo de hasta 800 fotos que
   * se reescribe entero: tres escrituras eran tres reescrituras y tres
   * ventanas para pisar la foto que entró mientras tanto.
   *
   * `false` si la foto ya no está (se borró o se cayó del tope): no se resucita.
   */
  async guardarAnalisis(tenantId: string, capturaId: string, analisis: AnalisisDeCaptura): Promise<boolean> {
    return mutarCapturas(tenantId, "ia", (previas) => {
      const next = aplicarAnalisis(previas, capturaId, analisis);
      return next ? { valor: next, resultado: true } : { resultado: false };
    });
  },

  /**
   * Una persona confirma que la placa leída es la de esa guía/flete/vehículo.
   * Se marca en la CAPTURA (quién y cuándo); la guía no se toca (ADR-411).
   */
  async confirmarCruce(tenantId: string, capturaId: string, refId: string, user: string): Promise<ResultadoConfirmar> {
    const r = await mutarCapturas<ResultadoConfirmar>(tenantId, user, (previas) => {
      const c = confirmarCruce(previas, capturaId, refId, user, new Date().toISOString());
      return c.ok && c.cambio ? { valor: c.capturas, resultado: c } : { resultado: c };
    });
    if (r.ok && r.cambio) {
      const cruce = r.captura.cruces?.placas.find((p) => p.refId === refId);
      logActivity(
        "camara.confirmar_cruce",
        "camara",
        `Confirmó que la placa ${cruce?.placa ?? "?"} de la foto ${capturaId} es ${cruce?.etiqueta ?? refId}`,
        r.captura.camaraId,
        user,
        undefined,
        tenantId,
      ).catch((err) => logger.error("[camaras] no se pudo auditar la confirmación", { error: String(err), tenantId }));
    }
    return r;
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
    return mutarCapturas(tenantId, user, (todas) => {
      const quedan = todas.filter((c) => c.id !== capturaId);
      return quedan.length === todas.length ? { resultado: false } : { valor: quedan, resultado: true };
    });
  },

  /** Días que se guardan las fotos del detector de personas (default 30). */
  async retencionPersonas(tenantId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    return diasRetencionDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE_RETENCION_PERSONAS(tenantId)));
  },

  /** Guarda los días de retención (entero 1-365). `false` si el número no vale. */
  async fijarRetencionPersonas(tenantId: string, dias: number, user: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const validos = diasRetencionValidos(dias);
    if (validos === null) return false;
    await PlatformSettingsDB.set(CLAVE_RETENCION_PERSONAS(tenantId), { dias: validos }, user);
    logActivity(
      "camara.retencion",
      "camara",
      `Fotos de personas: se guardan ${validos} días`,
      undefined,
      user,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[camaras] no se pudo auditar la retención", { error: String(err), tenantId }));
    return true;
  },

  /** Número de chaleco/casco → id del colaborador. `{}` si no hay ninguno. */
  async chalecos(tenantId: string): Promise<ChalecosDelNegocio> {
    if (!tenantId) throw new Error("tenantId is required");
    return chalecosDe(await PlatformSettingsDB.get<unknown>(CLAVE_CHALECOS(tenantId)));
  },

  /**
   * Asigna (o libera, con `colaboradorId: null`) un número de chaleco. Que el
   * colaborador sea de ESTE negocio lo valida quien llama, contra RRHH: acá
   * sólo se guarda el mapa.
   */
  async asignarChaleco(
    tenantId: string,
    numero: string,
    colaboradorId: string | null,
    nombreDe: (id: string) => string | null,
    user: string,
  ): Promise<ResultadoChalecos> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await PlatformSettingsDB.actualizar<unknown, ResultadoChalecos>(
      CLAVE_CHALECOS(tenantId),
      (actual) => {
        const c = asignarChaleco(chalecosDe(actual), numero, colaboradorId, nombreDe);
        return c.ok ? { valor: c.chalecos, resultado: c } : { resultado: c };
      },
      user,
      TX_KV,
    );
    if (r.ok) {
      logActivity("camara.chaleco", "camara", r.mensaje, colaboradorId ?? numero, user, undefined, tenantId).catch((err) =>
        logger.error("[camaras] no se pudo auditar el chaleco", { error: String(err), tenantId }),
      );
    }
    return r;
  },

  /**
   * Toma el turno del aviso de pila de una cámara: `true` = este proceso manda
   * el WhatsApp. Bajo candado porque una alarma de Hikvision llega con varias
   * fotos casi juntas, y cada una compararía contra la misma anterior: sin esto
   * salían tres WhatsApps por la misma pila.
   *
   * Devuelve también lo que había, para devolverlo si el envío falla — un aviso
   * que no salió no tiene que frenar al siguiente tres horas.
   */
  async reservarAvisoPila(
    tenantId: string,
    camaraId: string,
    ahora: Date,
  ): Promise<Turno> {
    if (!tenantId) throw new Error("tenantId is required");
    return reservarTurno(CLAVE_AVISO_PILA(tenantId), camaraId, ahora.toISOString(), (previo) => puedeAvisarPila(previo, ahora));
  },

  /** Devuelve el turno si el WhatsApp no salió (sólo si nadie lo tomó después). */
  async liberarAvisoPila(tenantId: string, camaraId: string, reservadoEn: Date, previo: string | null): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await liberarTurno(CLAVE_AVISO_PILA(tenantId), camaraId, reservadoEn.toISOString(), previo);
  },

  /**
   * Toma el turno de COMPARAR la pila de una cámara, antes de llamar al modelo.
   *
   * Mirar la `pila` ya guardada no alcanzaba: se guarda al final del análisis,
   * así que las 3-4 fotos de una alarma (segundos de diferencia) llegaban las
   * cuatro sin ver ninguna y pagaban cuatro comparaciones de dos imágenes. Con
   * el turno, una por cámara cada `MINUTOS_MINIMOS_PILA` (por la hora de la foto).
   */
  async reservarComparacionPila(tenantId: string, camaraId: string, fotoAt: string): Promise<Turno> {
    if (!tenantId) throw new Error("tenantId is required");
    return reservarTurno(CLAVE_COMPARACION_PILA(tenantId), camaraId, fotoAt, (previo) => puedeCompararPila(previo, fotoAt));
  },

  /** Devuelve el turno si la comparación no se pudo hacer (sin IA, sin presupuesto, error). */
  async liberarComparacionPila(tenantId: string, camaraId: string, fotoAt: string, previo: string | null): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await liberarTurno(CLAVE_COMPARACION_PILA(tenantId), camaraId, fotoAt, previo);
  },

  /**
   * Guarda cómo se llega a una cámara para verla en vivo.
   *
   * La prueba contra el aparato la hace el endpoint (es el que tiene el cliente
   * ISAPI) y entra como dato: acá se cifra la clave y se guarda **sólo si la
   * cámara contestó**. El texto plano no se escribe en ningún lado, ni siquiera
   * en el log de auditoría.
   */
  async conectar(
    tenantId: string,
    camaraId: string,
    datos: {
      host: string;
      puerto: number;
      usuario: string;
      clave: string;
      https?: boolean;
      canal?: number;
      prueba: PruebaDeCamara;
    },
    user: string,
  ): Promise<ResultadoCamaras> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!hayClaveDeCifrado()) {
      /* Sin clave de cifrado la alternativa sería guardar el secreto en claro
         en el KV: antes que eso, no se guarda nada. */
      return {
        ok: false,
        motivo: "Falta la clave de cifrado del servidor: sin eso la clave de la cámara no se puede guardar. Avisa al soporte.",
      };
    }
    const claveCifrada = cifrarSecreto(datos.clave);
    const r = await mutarCamaras(tenantId, user, (camaras) =>
      conectarCamara(camaras, camaraId, {
        host: datos.host,
        puerto: datos.puerto,
        usuario: datos.usuario,
        claveCifrada,
        https: datos.https,
        canal: datos.canal,
        prueba: datos.prueba,
      }),
    );
    if (!r.ok) return r;
    const conexion = r.camaras.find((c) => c.id === camaraId)?.conexion;
    /* Auditoría SIN la clave: queda el quién, el cuándo y a qué aparato. */
    logActivity(
      "camara.conectar",
      "camara",
      `Conectó «${r.camaras.find((c) => c.id === camaraId)?.nombre ?? camaraId}» a ${datos.host}:${datos.puerto} (usuario ${datos.usuario}${conexion?.modelo ? `, ${conexion.modelo}` : ""})`,
      camaraId,
      user,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[camaras] no se pudo auditar la conexión", { error: String(err), tenantId }));
    return r;
  },

  /** Saca la conexión y con ella la clave guardada. */
  async desconectar(tenantId: string, camaraId: string, user: string): Promise<ResultadoCamaras> {
    const r = await mutarCamaras(tenantId, user, (camaras) => desconectarCamara(camaras, camaraId));
    if (!r.ok) return r;
    logActivity(
      "camara.desconectar",
      "camara",
      `Desconectó «${r.camaras.find((c) => c.id === camaraId)?.nombre ?? camaraId}»`,
      camaraId,
      user,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[camaras] no se pudo auditar la desconexión", { error: String(err), tenantId }));
    return r;
  },

  /** Deja anotado cómo salió la última prueba, para que la pantalla lo cuente. */
  async registrarPrueba(
    tenantId: string,
    camaraId: string,
    prueba: PruebaDeCamara,
    user: string,
  ): Promise<ResultadoCamaras> {
    return mutarCamaras(tenantId, user, (camaras) => anotarPrueba(camaras, camaraId, prueba));
  },

  /**
   * Las credenciales de una cámara, listas para llamarla.
   *
   * Es el único lugar donde la clave vuelve a texto plano, y sale de acá para
   * morir dentro del handler que la usa. Antes de devolverla se revalida el
   * destino: una conexión guardada hace un mes pudo quedar apuntando a un
   * nombre que hoy resuelve a la metadata del servidor.
   */
  async credenciales(tenantId: string, camaraId: string): Promise<CredencialesListas> {
    if (!tenantId) throw new Error("tenantId is required");
    const camara = (await this.list(tenantId)).find((c) => c.id === camaraId);
    if (!camara) return { ok: false, motivo: "no-existe", detalle: "Esa cámara no está en la lista." };
    const conexion = camara.conexion;
    if (!conexion) {
      return {
        ok: false,
        motivo: "sin-configurar",
        detalle: "Esta cámara todavía no está conectada. Entra a Cámaras, toca «Conectar» y carga la dirección, el usuario y la clave del aparato.",
      };
    }
    const destino = await destinoResuelto(conexion.host, conexion.puerto);
    if (!destino.ok) return destino;
    const clave = descifrarSecreto(conexion.claveCifrada);
    if (clave === null) {
      return {
        ok: false,
        motivo: "credenciales",
        detalle: "No se pudo leer la clave guardada de la cámara. Vuelve a conectarla.",
      };
    }
    return {
      ok: true,
      camara,
      credenciales: {
        host: conexion.host,
        puerto: conexion.puerto,
        usuario: conexion.usuario,
        clave,
        https: conexion.https,
        canal: conexion.canal,
      },
    };
  },

  /** La lista SIN secretos: lo único que puede viajar al navegador. */
  async listaParaPantalla(tenantId: string): Promise<CamaraPublica[]> {
    return camarasParaPantalla(await this.list(tenantId));
  },

  /** Deja el índice igual a la lista real, y borra los tokens que ya no existen. */
  async indexar(tenantId: string, camaras: Camara[], borrar: string[] = []): Promise<void> {
    try {
      /* Bajo candado y leído de la base: el índice es UNO para todos los
         negocios, y dos altas a la vez (desde instancias distintas) se borraban
         el token una a la otra con el get cacheado + set de antes. */
      await PlatformSettingsDB.actualizar<Indice, null>(
        CLAVE_INDICE,
        (actual) => {
          const indice: Indice = { ...(actual ?? {}) };
          for (const t of borrar) delete indice[t];
          for (const c of camaras) indice[c.token] = { tenantId, camaraId: c.id };
          return { valor: indice, resultado: null };
        },
        "sistema",
        TX_KV,
      );
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
