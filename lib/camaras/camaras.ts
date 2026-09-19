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
  /**
   * A quién avisar por WhatsApp cuando la IA ve a alguien (2026-09-12).
   *
   * «Alerta cuando entra alguien» era lo que Brandon pidió de la cámara desde
   * el primer día. El aviso es por lectura, no por evento del aparato: la
   * cámara dispara por cualquier movimiento (una rama, un perro) y lo que
   * vale avisar es una persona o un vehículo que la IA confirmó.
   */
  avisos?: AvisosCamara | null;
  /**
   * Cómo se llega a la cámara para verla en vivo. `null` = sólo push (lo de
   * siempre): la cámara 4G detrás de CGNAT empuja fotos y nadie la llama.
   *
   * Existe porque el caso de Brandon es el otro: el panel corre en `localhost`,
   * en la MISMA red que el aparato, así que el servidor sí la alcanza por
   * ISAPI. Hik-Connect no tiene API pública (sólo partners), de modo que la
   * única conexión posible es la directa.
   */
  conexion?: ConexionCamara | null;
}

/**
 * Los datos para llamar a la cámara por ISAPI.
 *
 * La clave va CIFRADA (`cifrarSecreto`) y no sale nunca del servidor: la
 * pantalla ve el host, el usuario y lo que el aparato contestó, jamás el
 * secreto. Por eso todo lo que responde la API pasa antes por
 * `camaraParaPantalla`.
 */
export interface ConexionCamara {
  host: string;
  puerto: number;
  usuario: string;
  /** Cifrada con `cifrarSecreto`. NUNCA sale del servidor. */
  claveCifrada: string;
  https: boolean;
  canal: number;
  /** Lo que dijo el aparato la última vez que se probó. */
  modelo?: string | null;
  firmware?: string | null;
  serie?: string | null;
  soportaPtz?: boolean;
  probadaEn?: string | null;
  /** Si la última prueba falló, por qué — para que la pantalla lo diga sin volver a probar. */
  ultimaFalla?: { motivo: string; detalle: string; en: string } | null;
}

export interface AvisosCamara {
  /** Número de WhatsApp (9 dígitos de Perú o con +51). Vacío = no avisar. */
  whatsapp: string | null;
  /** `siempre` · `noche` (19:00–06:00 de Lima, cuando el patio está solo) · `nunca`. */
  cuando: "siempre" | "noche" | "nunca";
  /** Cuándo se mandó el último: para no mandar veinte por el mismo camión. */
  ultimoAvisoEn?: string | null;
}

/** Entre dos avisos de la misma cámara pasan al menos estos minutos. */
export const MINUTOS_ENTRE_AVISOS = 10;

/** Un número de WhatsApp peruano: 9 dígitos, o 11 con el 51 adelante. */
export function whatsappValido(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length === 9 || (d.length === 11 && d.startsWith("51"));
}

/**
 * ¿Hay que avisar por esta lectura?
 *
 * Tres condiciones, y las tres se leen en la pantalla de la cámara: hay número,
 * es la franja pedida, y pasó el tiempo mínimo desde el último. Y la lectura
 * tiene que haber visto a ALGUIEN: una foto de movimiento sin persona ni
 * vehículo es una rama con viento, y un aviso por rama enseña a silenciar el
 * teléfono.
 *
 * La hora es la de Lima: la cámara y el servidor pueden estar en cualquier zona,
 * pero «de noche» es de noche en el patio.
 */
export function debeAvisar(
  camara: Pick<Camara, "avisos" | "activa">,
  lectura: { hayPersona: boolean; hayVehiculo: boolean } | null | undefined,
  ahora: Date = new Date(),
): boolean {
  const a = camara.avisos;
  if (!camara.activa || !a || !a.whatsapp || a.cuando === "nunca") return false;
  if (!lectura || (!lectura.hayPersona && !lectura.hayVehiculo)) return false;
  if (a.cuando === "noche") {
    const horaLima = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }).format(ahora),
    );
    const esNoche = horaLima >= 19 || horaLima < 6;
    if (!esNoche) return false;
  }
  if (a.ultimoAvisoEn) {
    const hace = ahora.getTime() - new Date(a.ultimoAvisoEn).getTime();
    if (Number.isFinite(hace) && hace < MINUTOS_ENTRE_AVISOS * 60_000) return false;
  }
  return true;
}

/** El texto del WhatsApp: corto, con lo que hay que saber a las 3 de la mañana. */
export function textoDelAviso(
  camara: Pick<Camara, "nombre" | "lugar">,
  lectura: { descripcion: string | null; hayPersona: boolean; hayVehiculo: boolean; personas: number | null; placa: string | null },
  cuando: Date,
  enlace: string,
): string {
  const hora = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(cuando);
  const que = lectura.hayVehiculo && lectura.hayPersona
    ? `Vehículo y ${lectura.personas && lectura.personas > 1 ? `${lectura.personas} personas` : "una persona"}`
    : lectura.hayVehiculo
      ? "Un vehículo"
      : lectura.personas && lectura.personas > 1
        ? `${lectura.personas} personas`
        : "Una persona";
  const placa = lectura.placa ? ` · placa ${lectura.placa}` : "";
  const detalle = lectura.descripcion ? `\n${lectura.descripcion.slice(0, 160)}` : "";
  return `📷 ${camara.nombre}${camara.lugar ? ` (${camara.lugar})` : ""} · ${hora}\n${que}${placa}.${detalle}\nVer la foto: ${enlace}`;
}

/** Cambia a quién y cuándo avisa una cámara. */
export function configurarAvisos(
  camaras: readonly Camara[],
  id: string,
  avisos: { whatsapp: string; cuando: AvisosCamara["cuando"] },
): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  const numero = avisos.whatsapp.replace(/\D/g, "");
  if (numero && !whatsappValido(numero)) {
    return { ok: false, motivo: "El WhatsApp tiene que ser un número peruano de 9 dígitos (o con 51 adelante)." };
  }
  const nuevos: AvisosCamara = {
    whatsapp: numero || null,
    cuando: numero ? avisos.cuando : "nunca",
    ultimoAvisoEn: camara.avisos?.ultimoAvisoEn ?? null,
  };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, avisos: nuevos } : c)),
    mensaje: numero
      ? `${camara.nombre} avisa a ${numero} ${nuevos.cuando === "noche" ? "de noche (19:00–06:00)" : "siempre"}.`
      : `${camara.nombre} ya no avisa por WhatsApp.`,
  };
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
  /**
   * Lo que la IA leyó en la foto. Es una LECTURA, no un hecho declarado: la
   * placa de acá no entra sola a ningún documento — se ofrece para que una
   * persona la confirme (ADR-411).
   */
  lectura?: {
    descripcion: string | null;
    hayPersona: boolean;
    hayVehiculo: boolean;
    personas: number | null;
    placa: string | null;
    confianza: "alta" | "media" | "baja";
    motivo: string | null;
  } | null;
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
  if (!nombre) return { ok: false, motivo: "Ponle un nombre a la cámara." };
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
    mensaje: `«${nombre}» quedó lista. Copia su dirección en la cámara para que empiece a mandar fotos.`,
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

/**
 * Cuánto hace que no manda nada, en horas. `null` si nunca mandó.
 *
 * Pide sólo los dos campos que mira (no la `Camara` entera) para que también
 * sirva con la versión sin secretos que recibe la pantalla: son el mismo dato,
 * y obligar al tipo completo forzaría a la pantalla a fingir que tiene la clave.
 */
export function horasSinVerse(camara: Pick<Camara, "ultimaCapturaEn">, ahora: Date = new Date()): number | null {
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
export function estaCallada(camara: Pick<Camara, "activa" | "ultimaCapturaEn">, ahora: Date = new Date()): boolean {
  if (!camara.activa) return false;
  const h = horasSinVerse(camara, ahora);
  return h != null && h >= 24;
}

/**
 * Busca en el historial por lo que se VE, no por metadatos.
 *
 * Es el único motivo por el que vale la pena que la IA describa cada foto: sin
 * texto, encontrar «el camión rojo del martes» es mirar doscientas miniaturas
 * una por una.
 */
export function buscarCapturas(capturas: readonly Captura[], texto: string): Captura[] {
  const q = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!q) return [...capturas];
  const norm = (v: string | null | undefined) =>
    (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return capturas.filter((c) =>
    [c.lectura?.descripcion, c.lectura?.placa, c.nota, EVENTO_LABEL[c.evento]].some((campo) =>
      norm(campo).includes(q),
    ),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Ver la cámara en vivo: a qué destino SE PERMITE llamar
 *
 * Acá el peligro cambia de lado. En el resto del archivo la cámara empuja y el
 * servidor sólo recibe; en cuanto el servidor LLAMA a un host que escribió una
 * persona, el endpoint se vuelve un SSRF: con esa dirección se lo puede mandar
 * a `169.254.169.254` (las credenciales de la nube), a `127.0.0.1:5432` (la
 * base de datos) o a cualquier servicio interno que no esté publicado, y la
 * respuesta vuelve por la pantalla.
 *
 * La defensa es una lista de BLOQUEO explícita, no una de permitidos: el caso
 * de uso real es justamente una LAN (`192.168.1.64`) y también un DDNS público,
 * así que no se puede exigir que la IP sea «de internet». Se bloquea lo que
 * nunca es una cámara: loopback, link-local (metadata de la nube), CGNAT,
 * multicast y reservadas. Y el puerto se acota: una cámara vive en 80/443/554/
 * 8000/8080/8443 o en el rango alto; 22, 25, 3306, 5432 y 6379 no son cámaras.
 *
 * Queda una ventana conocida y aceptada: **DNS rebinding**. Entre que se
 * resuelve el nombre y que se abre la conexión, el dueño del dominio puede
 * cambiar la respuesta a una IP bloqueada. Cerrarla del todo pide fijar la IP
 * resuelta en el socket (agente HTTP propio), que no está en este contrato. Por
 * eso estos endpoints son SÓLO para admin/owner con sesión, con CSRF y rate
 * limit: quien podría explotarlo ya es dueño del panel.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Sí o no, con el motivo en criollo para mostrarlo tal cual. */
export type Veredicto = { ok: true } | { ok: false; motivo: string };

/** Los que usa una cámara IP: web, https, RTSP y los alternos de Hikvision. */
export const PUERTOS_DE_CAMARA = [80, 443, 554, 8000, 8080, 8443] as const;

/**
 * Puertos que NUNCA se piden, aunque caigan en el rango alto.
 *
 * Están listados uno por uno porque `5432` y `6379` viven arriba de 1024: una
 * regla de «rango» sola los dejaría pasar y el endpoint sería una puerta a la
 * base y al Redis del propio servidor.
 */
const PUERTOS_PROHIBIDOS = new Set([
  22, 23, 25, 53, 110, 135, 137, 138, 139, 143, 389, 445, 465, 587, 636, 993, 995,
  1433, 1521, 2049, 2375, 2376, 3306, 3389, 4444, 5000, 5432, 5672, 5900, 5984,
  6379, 8086, 9042, 9200, 9300, 11211, 15672, 25565, 27017, 27018, 50070,
]);

/** ¿Se puede pedir este puerto? */
export function puertoPermitido(puerto: number): Veredicto {
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return { ok: false, motivo: "El puerto tiene que ser un número entero entre 1 y 65535." };
  }
  if (PUERTOS_PROHIBIDOS.has(puerto)) {
    return {
      ok: false,
      motivo: `El puerto ${puerto} no es de una cámara: es de un servicio interno y no se puede llamar desde acá.`,
    };
  }
  if ((PUERTOS_DE_CAMARA as readonly number[]).includes(puerto)) return { ok: true };
  if (puerto >= 1024) return { ok: true };
  return {
    ok: false,
    motivo: `El puerto ${puerto} no corresponde a una cámara. Usa 80, 443, 554, 8000, 8080, 8443 o uno arriba de 1024.`,
  };
}

/** Los cuatro números de una IPv4, o `null` si el texto no es una IPv4 válida. */
function octetos(ip: string): number[] | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  const nums: number[] = [];
  for (const p of partes) {
    /* Sin ceros a la izquierda a propósito: «0177.0.0.1» es 127.0.0.1 en octal
       para algunos resolvers y una dirección inválida para nosotros — cae como
       nombre y lo agarra el chequeo de la IP resuelta. */
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

/** Los 8 grupos de una IPv6 (con `::` expandido), o `null` si no es IPv6. */
function grupos(ip: string): number[] | null {
  if (!ip.includes(":")) return null;
  const mitades = ip.split("::");
  if (mitades.length > 2) return null;
  const leer = (txtIp: string): number[] | null => {
    if (!txtIp) return [];
    const out: number[] = [];
    const partes = txtIp.split(":");
    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      /* El último grupo puede venir como IPv4 («::ffff:192.168.1.64»). */
      if (parte.includes(".")) {
        if (i !== partes.length - 1) return null;
        const v4 = octetos(parte);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(parte)) return null;
      out.push(parseInt(parte, 16));
    }
    return out;
  };
  const izq = leer(mitades[0] ?? "");
  const der = leer(mitades[1] ?? "");
  if (!izq || !der) return null;
  if (mitades.length === 1) return izq.length === 8 ? izq : null;
  const faltan = 8 - izq.length - der.length;
  if (faltan < 0) return null;
  return [...izq, ...new Array<number>(faltan).fill(0), ...der];
}

/**
 * ¿Se puede llamar a esta IP?
 *
 * Es la función que decide de verdad: el texto que escribe la persona puede ser
 * un nombre, y un nombre resuelve a una IP — por eso el endpoint resuelve
 * primero y pregunta acá por CADA dirección que devolvió el DNS.
 */
export function ipPermitida(ip: string): Veredicto {
  const limpio = (ip ?? "").trim().replace(/^\[|\]$/g, "");
  const v6 = grupos(limpio);
  if (v6) {
    const ceros = v6.slice(0, 5).every((g) => g === 0);
    /* ::ffff:a.b.c.d y compañía son una IPv4 disfrazada: se juzga la IPv4. */
    if (ceros && (v6[5] === 0xffff || v6[5] === 0)) {
      const a = (v6[6] >> 8) & 0xff, b = v6[6] & 0xff, c = (v6[7] >> 8) & 0xff, d = v6[7] & 0xff;
      if (!(a === 0 && b === 0 && c === 0 && (d === 0 || d === 1))) return ipPermitida(`${a}.${b}.${c}.${d}`);
    }
    if (v6.every((g) => g === 0)) return { ok: false, motivo: "«::» no es una dirección a la que se pueda llamar." };
    if (v6.slice(0, 7).every((g) => g === 0) && v6[7] === 1) {
      return { ok: false, motivo: "«::1» es el propio servidor, no una cámara." };
    }
    if ((v6[0] & 0xffc0) === 0xfe80) return { ok: false, motivo: "Esa dirección es de enlace local (fe80::) y no se puede llamar desde el servidor." };
    if ((v6[0] & 0xff00) === 0xff00) return { ok: false, motivo: "Esa dirección es de multidifusión y no es una cámara." };
    /* fc00::/7 (redes locales IPv6) SÍ se permite: es el equivalente de
       192.168.x.x, que es justamente el caso de uso. */
    return { ok: true };
  }

  const v4 = octetos(limpio);
  if (!v4) return { ok: false, motivo: `«${limpio}» no es una dirección IP válida.` };
  const [a, b] = v4;
  if (a === 127) return { ok: false, motivo: "127.x.x.x es el propio servidor, no una cámara." };
  if (a === 0) return { ok: false, motivo: "0.x.x.x no es una dirección a la que se pueda llamar." };
  if (a === 169 && b === 254) {
    return { ok: false, motivo: "169.254.x.x está reservada (ahí vive la metadata del servidor): no se puede llamar." };
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return { ok: false, motivo: "100.64.x.x es la red del operador (CGNAT): desde ahí no se llega a una cámara." };
  }
  if (a >= 224 && a <= 239) return { ok: false, motivo: "224.x.x.x en adelante es multidifusión, no una cámara." };
  if (a >= 240) return { ok: false, motivo: "240.x.x.x en adelante está reservada y no se puede llamar." };
  if (a === 192 && b === 0 && v4[2] === 0) return { ok: false, motivo: "192.0.0.x está reservada por la IANA." };
  if (a === 192 && b === 0 && v4[2] === 2) return { ok: false, motivo: "192.0.2.x es una red de ejemplo, no existe de verdad." };
  if (a === 198 && (b === 18 || b === 19)) return { ok: false, motivo: "198.18.x.x está reservada para pruebas de red." };
  if (a === 198 && b === 51 && v4[2] === 100) return { ok: false, motivo: "198.51.100.x es una red de ejemplo, no existe de verdad." };
  if (a === 203 && b === 0 && v4[2] === 113) return { ok: false, motivo: "203.0.113.x es una red de ejemplo, no existe de verdad." };
  /* 10/8, 172.16/12 y 192.168/16 pasan a propósito: la cámara del patio está
     en la LAN y ése es el caso que hay que soportar. */
  return { ok: true };
}

/**
 * ¿Se puede pedir una conexión a este host?
 *
 * Acepta la IP o el nombre sueltos («192.168.1.64», «patio.ddns.net») y también
 * con el puerto pegado («192.168.1.64:8000», «[fd00::1]:80»), que es como se
 * copia de la app del fabricante. Si trae puerto, el puerto también se valida.
 *
 * OJO: con un NOMBRE esto sólo mira la forma. La dirección de verdad la da el
 * DNS, así que quien llama tiene que resolver y pasar cada IP por
 * `ipPermitida` — es lo que hace `destinoResuelto` en la capa de datos.
 */
export function hostPermitido(host: string): Veredicto {
  const bruto = (host ?? "").trim();
  if (!bruto) return { ok: false, motivo: "Escribe la dirección de la cámara (por ejemplo 192.168.1.64)." };
  if (bruto.length > 255) return { ok: false, motivo: "Esa dirección es demasiado larga." };
  if (/[\s/\\@?#]/.test(bruto) || bruto.includes("://")) {
    return { ok: false, motivo: "Pon sólo la dirección, sin «http://» ni barras ni espacios." };
  }

  let texto = bruto;
  let puerto: number | null = null;
  const conCorchetes = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(bruto);
  if (conCorchetes) {
    texto = conCorchetes[1];
    puerto = conCorchetes[2] ? Number(conCorchetes[2]) : null;
  } else if (!bruto.includes("::") && (bruto.match(/:/g)?.length ?? 0) === 1) {
    const [h, p] = bruto.split(":");
    texto = h;
    puerto = /^\d{1,5}$/.test(p) ? Number(p) : NaN;
    if (Number.isNaN(puerto)) return { ok: false, motivo: "Después de los dos puntos tiene que ir el puerto (por ejemplo 192.168.1.64:8000)." };
  }
  if (puerto !== null) {
    const p = puertoPermitido(puerto);
    if (!p.ok) return p;
  }
  if (!texto) return { ok: false, motivo: "Escribe la dirección de la cámara (por ejemplo 192.168.1.64)." };

  /* Una IP literal se juzga acá mismo; con un nombre todavía falta el DNS. */
  if (texto.includes(":") || octetos(texto)) return ipPermitida(texto);

  const nombre = texto.replace(/\.$/, "").toLowerCase();
  if (nombre === "localhost" || nombre.endsWith(".localhost")) {
    return { ok: false, motivo: "«localhost» es el propio servidor, no una cámara." };
  }
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(nombre)) {
    return { ok: false, motivo: `«${bruto}» no es una dirección ni un nombre válido.` };
  }
  const etiquetas = nombre.split(".");
  /* Un nombre real nunca termina en número: «127.1», «2130706433» o «0x7f.1»
     son formas raras de escribir una IP que algunos resolvers aceptan. */
  if (/^\d+$/.test(etiquetas[etiquetas.length - 1])) {
    return { ok: false, motivo: `«${bruto}» no es una dirección IP válida.` };
  }
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Guardar y sacar la conexión (puro: acá no se habla con ninguna cámara)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lo que contestó el aparato cuando se lo probó. Lo consigue quien tenga red. */
export type PruebaDeCamara =
  | {
      ok: true;
      info: { modelo: string | null; firmware: string | null; serie: string | null; soportaPtz: boolean };
      en: string;
    }
  | { ok: false; motivo: string; detalle: string; en: string };

/** Cómo se le cuenta a una persona por qué no se pudo ver la cámara. */
const TEXTO_DE_FALLA: Record<string, string> = {
  credenciales: "El usuario o la clave no son los de la cámara.",
  inalcanzable: "No se llega a la cámara desde el servidor. Revisa la IP, el puerto y que el panel esté en la misma red que el aparato.",
  "no-es-hikvision": "En esa dirección hay algo que contesta, pero no es una cámara Hikvision.",
  tiempo: "La cámara no contestó a tiempo.",
  rechazado: "La cámara rechazó el pedido.",
  "sin-configurar": "Esta cámara todavía no está conectada.",
  bloqueado: "Esa dirección no se puede llamar desde el servidor.",
};

/** El motivo técnico traducido. Si no lo conocemos, se muestra el detalle. */
export function textoDeFalla(motivo: string, detalle?: string | null): string {
  const base = TEXTO_DE_FALLA[motivo];
  if (base) return base;
  return detalle?.trim() || "No se pudo hablar con la cámara.";
}

const conexionValida = (d: { host: string; puerto: number; usuario: string; claveCifrada: string; canal?: number }): Veredicto => {
  const h = hostPermitido(d.host);
  if (!h.ok) return h;
  const p = puertoPermitido(d.puerto);
  if (!p.ok) return p;
  if (!d.usuario.trim()) return { ok: false, motivo: "Pon el usuario de la cámara (el mismo con el que entras a su página)." };
  if (d.usuario.length > 64) return { ok: false, motivo: "El usuario no puede pasar de 64 caracteres." };
  if (!d.claveCifrada) return { ok: false, motivo: "Pon la clave de la cámara." };
  const canal = d.canal ?? 1;
  if (!Number.isInteger(canal) || canal < 1 || canal > 64) {
    return { ok: false, motivo: "El canal tiene que ser un número entre 1 y 64 (en una cámara suelta es el 1)." };
  }
  return { ok: true };
};

/**
 * Guarda cómo se llega a una cámara — sólo si la prueba contra el aparato salió
 * bien.
 *
 * La prueba entra como dato (`datos.prueba`) en vez de hacerse acá porque este
 * archivo es puro: lo que habla por la red es el cliente ISAPI. Lo que sí es
 * regla y vive acá: **una conexión que no respondió no se guarda**. Guardar un
 * host que nunca contestó deja una cámara «conectada» que no se ve nunca, y la
 * pantalla mostrando una promesa falsa.
 */
export function conectarCamara(
  camaras: readonly Camara[],
  id: string,
  datos: {
    host: string;
    puerto: number;
    usuario: string;
    /** Ya cifrada: el texto plano no entra ni de paso en el modelo. */
    claveCifrada: string;
    https?: boolean;
    canal?: number;
    prueba: PruebaDeCamara;
  },
): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  const valida = conexionValida(datos);
  if (!valida.ok) return valida;
  if (!datos.prueba.ok) {
    return { ok: false, motivo: textoDeFalla(datos.prueba.motivo, datos.prueba.detalle) };
  }
  const conexion: ConexionCamara = {
    host: datos.host.trim(),
    puerto: datos.puerto,
    usuario: datos.usuario.trim(),
    claveCifrada: datos.claveCifrada,
    https: datos.https ?? false,
    canal: datos.canal ?? 1,
    modelo: datos.prueba.info.modelo,
    firmware: datos.prueba.info.firmware,
    serie: datos.prueba.info.serie,
    soportaPtz: datos.prueba.info.soportaPtz,
    probadaEn: datos.prueba.en,
    ultimaFalla: null,
  };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, conexion } : c)),
    mensaje: `«${camara.nombre}» quedó conectada${conexion.modelo ? ` (${conexion.modelo})` : ""}. Ya se puede ver en vivo desde el panel.`,
  };
}

/** Saca la conexión y con ella la clave. La cámara sigue pudiendo mandar fotos. */
export function desconectarCamara(camaras: readonly Camara[], id: string): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  if (!camara.conexion) return { ok: false, motivo: "Esa cámara no estaba conectada." };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, conexion: null } : c)),
    mensaje: `«${camara.nombre}» ya no se ve en vivo y su clave se borró. Las fotos que ella manda siguen entrando igual.`,
  };
}

/**
 * Deja anotado cómo salió la última prueba de una conexión ya guardada.
 *
 * Sirve para que la pantalla diga «no contesta desde ayer» sin volver a golpear
 * el aparato cada vez que alguien abre la pestaña.
 */
export function anotarPrueba(camaras: readonly Camara[], id: string, prueba: PruebaDeCamara): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  const previa = camara.conexion;
  if (!previa) return { ok: false, motivo: "Esa cámara todavía no está conectada." };
  const conexion: ConexionCamara = prueba.ok
    ? {
        ...previa,
        modelo: prueba.info.modelo ?? previa.modelo ?? null,
        firmware: prueba.info.firmware ?? previa.firmware ?? null,
        serie: prueba.info.serie ?? previa.serie ?? null,
        soportaPtz: prueba.info.soportaPtz,
        probadaEn: prueba.en,
        ultimaFalla: null,
      }
    : { ...previa, ultimaFalla: { motivo: prueba.motivo, detalle: prueba.detalle, en: prueba.en } };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, conexion } : c)),
    mensaje: prueba.ok
      ? `«${camara.nombre}» contesta bien.`
      : `«${camara.nombre}»: ${textoDeFalla(prueba.motivo, prueba.detalle)}`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lo que la pantalla puede ver
 * ──────────────────────────────────────────────────────────────────────────── */

/** La conexión SIN el secreto. Es lo único que viaja al navegador. */
export interface ConexionCamaraPublica {
  host: string;
  puerto: number;
  usuario: string;
  https: boolean;
  canal: number;
  modelo: string | null;
  firmware: string | null;
  serie: string | null;
  soportaPtz: boolean;
  probadaEn: string | null;
  ultimaFalla: { motivo: string; detalle: string; en: string } | null;
  /** El motivo de la última falla ya traducido, para pintarlo sin lógica extra. */
  ultimaFallaTexto: string | null;
}

export type CamaraPublica = Omit<Camara, "conexion"> & { conexion: ConexionCamaraPublica | null };

/**
 * Saca la clave antes de que la cámara salga del servidor.
 *
 * Es una lista de campos a mano y no un `delete claveCifrada` a propósito: si
 * mañana la conexión gana un campo secreto (un token de la nube, un certificado),
 * el default de esta función es NO mostrarlo.
 */
export function camaraParaPantalla(c: Camara): CamaraPublica {
  const { conexion, ...resto } = c;
  if (!conexion) return { ...resto, conexion: null };
  return {
    ...resto,
    conexion: {
      host: conexion.host,
      puerto: conexion.puerto,
      usuario: conexion.usuario,
      https: conexion.https,
      canal: conexion.canal,
      modelo: conexion.modelo ?? null,
      firmware: conexion.firmware ?? null,
      serie: conexion.serie ?? null,
      soportaPtz: conexion.soportaPtz ?? false,
      probadaEn: conexion.probadaEn ?? null,
      ultimaFalla: conexion.ultimaFalla ?? null,
      ultimaFallaTexto: conexion.ultimaFalla
        ? textoDeFalla(conexion.ultimaFalla.motivo, conexion.ultimaFalla.detalle)
        : null,
    },
  };
}

/** La lista entera lista para responder. */
export const camarasParaPantalla = (camaras: readonly Camara[]): CamaraPublica[] => camaras.map(camaraParaPantalla);
