/**
 * Cámaras del negocio — el modelo, PURO (sin React, sin Prisma, sin fetch).
 *
 * ## Por qué la cámara EMPUJA y el sistema no la llama
 *
 * La cámara del patio es 4G con SIM y panel solar. Una SIM da IP privada
 * (CGNAT): no hay dirección a la que el servidor pueda conectarse, así que
 * RTSP/ONVIF/ISAPI «desde acá hacia allá» no existen como opción — por eso esas
 * cámaras funcionan con la nube del fabricante, que es la cámara saliendo hacia
 * afuera. Y con panel solar, un stream 1080p (1–2 GB/hora) no se sostiene ni en
 * datos ni en batería.
 *
 * De ahí el diseño: **una bandeja que recibe imágenes**. La cámara —o el correo
 * que ella manda, o un FTP, o alguien desde el celular— deja la foto del evento
 * y el sistema la guarda con su hora y su motivo. Sirve para los tres caminos
 * posibles sin casarse con ninguno, y el día que haya API del fabricante, ese
 * conector deposita en el MISMO lugar.
 *
 * ## El token es de la cámara, no del usuario
 *
 * Quien empuja es un aparato: no tiene sesión ni puede mandar un header CSRF (un
 * FTP o un correo no mandan headers). Por eso cada cámara lleva un token largo
 * que viaja en la URL, y el endpoint que lo recibe **no devuelve datos**: sólo
 * acepta o rechaza. Un token filtrado deja subir fotos basura a esa cámara —
 * molesto, no grave— y se rota desde el panel sin tocar nada más.
 */

/** Qué disparó la captura. `manual` = la subió una persona desde el panel. */
export const EVENTOS = ["movimiento", "persona", "vehiculo", "manual", "programada", "otro"] as const;
export type EventoCamara = (typeof EVENTOS)[number];

export const EVENTO_LABEL: Record<EventoCamara, string> = {
  movimiento: "Movimiento",
  persona: "Persona",
  vehiculo: "Vehículo",
  manual: "Subida a mano",
  programada: "Foto programada",
  otro: "Otro",
};

export interface Camara {
  id: string;
  nombre: string;
  /** Dónde mira: «Portón», «Patio de trozas», «Sierra principal». */
  lugar: string;
  /** Lo que la cámara pone en la URL para identificarse. Se puede rotar. */
  token: string;
  activa: boolean;
  creadaEn: string;
  /** Última vez que ESA cámara dejó una imagen: dice si sigue viva. */
  ultimaCapturaEn?: string | null;
}

export interface Captura {
  id: string;
  camaraId: string;
  /** Dónde quedó la imagen (storage propio), no la imagen. */
  url: string;
  evento: EventoCamara;
  /** Cuándo ocurrió, en ISO. Lo pone el servidor: la cámara puede tener mal la hora. */
  at: string;
  /** Lo que el aparato haya dicho de sí mismo, tal cual. */
  nota?: string | null;
}

/**
 * Tope de capturas guardadas por negocio.
 *
 * Esto vive en el KV (mismo criterio que la biblioteca de fotos): son
 * referencias de ~150 bytes, no las imágenes. Con 800 entra cómodo y da meses
 * de eventos; pasado ese número las viejas se van cayendo y la pantalla lo
 * dice, en vez de crecer sin techo hasta que el KV se vuelva lento. El día que
 * haga falta guardar años, esto pasa a tabla leyendo el KV e insertando filas.
 */
export const MAX_CAPTURAS = 800;
/** Cuántas cámaras puede tener un negocio. */
export const MAX_CAMARAS = 20;

const txt = (v: unknown) => String(v ?? "").trim();

/** ¿Es un evento que conocemos? Lo que no, entra como «otro» — nunca se descarta. */
export function normalizarEvento(v: unknown): EventoCamara {
  const s = txt(v).toLowerCase();
  const directo = EVENTOS.find((e) => e === s);
  if (directo) return directo;
  /* Los aparatos mandan su propia jerga: se traduce lo conocido y lo demás cae
     en «otro» con su texto guardado en la nota. */
  if (/motion|move|movimiento/.test(s)) return "movimiento";
  if (/human|person|people|persona/.test(s)) return "persona";
  if (/vehicle|car|truck|veh[ií]culo|cami[oó]n/.test(s)) return "vehiculo";
  if (/schedul|timer|program/.test(s)) return "programada";
  return "otro";
}

/** Token nuevo: largo, aleatorio y sin caracteres que un FTP o un correo rompan. */
export function nuevoToken(random: () => string = () => Math.random().toString(36).slice(2)): string {
  return `${random()}${random()}${random()}`.replace(/[^a-z0-9]/g, "").slice(0, 32).padEnd(32, "0");
}

export type ResultadoCamaras =
  | { ok: true; camaras: Camara[]; mensaje: string }
  | { ok: false; motivo: string };

/** Da de alta una cámara. El token lo genera el servidor, nunca el formulario. */
export function agregarCamara(
  camaras: readonly Camara[],
  entrada: { nombre: string; lugar?: string },
  meta: { id: string; token: string; ahora?: string },
): ResultadoCamaras {
  const nombre = txt(entrada.nombre);
  if (!nombre) return { ok: false, motivo: "Ponele un nombre a la cámara." };
  if (nombre.length > 80) return { ok: false, motivo: "El nombre no puede pasar de 80 caracteres." };
  if (camaras.length >= MAX_CAMARAS) {
    return { ok: false, motivo: `Ya hay ${MAX_CAMARAS} cámaras cargadas.` };
  }
  if (camaras.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    return { ok: false, motivo: `Ya hay una cámara que se llama «${nombre}».` };
  }
  const camara: Camara = {
    id: meta.id,
    nombre,
    lugar: txt(entrada.lugar),
    token: meta.token,
    activa: true,
    creadaEn: meta.ahora ?? new Date().toISOString(),
    ultimaCapturaEn: null,
  };
  return {
    ok: true,
    camaras: [...camaras, camara],
    mensaje: `«${nombre}» quedó lista. Copiá su dirección en la cámara para que empiece a mandar fotos.`,
  };
}

/** Cambia el token: lo viejo deja de entrar en el acto. */
export function rotarToken(
  camaras: readonly Camara[],
  id: string,
  token: string,
): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, token } : c)),
    mensaje: `«${camara.nombre}» tiene dirección nueva. La anterior dejó de funcionar: hay que cargarla de nuevo en la cámara.`,
  };
}

/** Saca una cámara. Sus fotos NO se borran: son lo que pasó. */
export function quitarCamara(camaras: readonly Camara[], id: string): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  return {
    ok: true,
    camaras: camaras.filter((c) => c.id !== id),
    mensaje: `«${camara.nombre}» ya no recibe. Las fotos que mandó siguen en el historial.`,
  };
}

/** Agrega la captura al principio y respeta el tope. Devuelve también qué se cayó. */
export function agregarCaptura(
  capturas: readonly Captura[],
  nueva: Captura,
): { capturas: Captura[]; descartadas: number } {
  const todas = [nueva, ...capturas];
  if (todas.length <= MAX_CAPTURAS) return { capturas: todas, descartadas: 0 };
  return { capturas: todas.slice(0, MAX_CAPTURAS), descartadas: todas.length - MAX_CAPTURAS };
}

/** Cuánto hace que no manda nada, en horas. `null` si nunca mandó. */
export function horasSinVerse(camara: Camara, ahora: Date = new Date()): number | null {
  if (!camara.ultimaCapturaEn) return null;
  const t = Date.parse(camara.ultimaCapturaEn);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round(((ahora.getTime() - t) / 3_600_000) * 10) / 10);
}

/**
 * ¿Hay que preocuparse por esta cámara?
 *
 * Con panel solar, un día nublado puede dejarla sin batería; y una SIM sin datos
 * deja de mandar sin avisar. Que la pantalla lo diga a las 24 h es la diferencia
 * entre enterarse hoy o el día que pase algo y no haya foto.
 */
export function estaCallada(camara: Camara, ahora: Date = new Date()): boolean {
  if (!camara.activa) return false;
  const h = horasSinVerse(camara, ahora);
  return h != null && h >= 24;
}
