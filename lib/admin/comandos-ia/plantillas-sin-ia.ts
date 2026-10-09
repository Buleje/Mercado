/**
 * «A quién escribir» — plantillas de siempre (sin IA) y el relleno de huecos.
 *
 * La IA escribe UNA plantilla por tipo con huecos; los datos los pone SIEMPRE
 * este archivo con lo que el servidor releyó de la base. Así la IA nunca ve un
 * teléfono, un DNI ni un monto (Ley 29733) y no puede inventar una cifra.
 * Sin clave de IA o sin tope del plan, se usan estas mismas plantillas.
 */
import { fechaConDia, formatoMonto, type Candidato, type TipoCandidato } from "./candidatos";

export type Tono = "amable" | "claro";

/** Clave de plantilla: los seguimientos sin monto (clientes) tienen la suya. */
export type ClavePlantilla = Exclude<TipoCandidato, "seguimiento"> | "seguimiento" | "seguimiento-cliente";

export const CLAVES_PLANTILLA: readonly ClavePlantilla[] = [
  "fiado-vencido",
  "fiado-por-vencer",
  "cliente-ritmo",
  "adelanto",
  "seguimiento",
  "seguimiento-cliente",
];

/** Huecos que cada plantilla DEBE traer (si la IA los omite, se usa la de siempre). */
export const HUECOS_OBLIGATORIOS: Record<ClavePlantilla, readonly string[]> = {
  "fiado-vencido": ["{nombre}", "{monto}"],
  "fiado-por-vencer": ["{nombre}", "{monto}"],
  "cliente-ritmo": ["{nombre}"],
  adelanto: ["{nombre}", "{monto}"],
  seguimiento: ["{nombre}", "{monto}"],
  "seguimiento-cliente": ["{nombre}"],
};

export const PLANTILLAS_SIN_IA: Record<Tono, Record<ClavePlantilla, string>> = {
  amable: {
    "fiado-vencido":
      "Hola {nombre}, ¿cómo estás? Te escribo de {negocio} para recordarte tu cuenta de {monto} del {desde}, que venció hace {dias} días. Cuando puedas, me avisas cómo la vas pagando. ¡Gracias!",
    "fiado-por-vencer":
      "Hola {nombre}, te escribo de {negocio}: tu cuenta de {monto} vence en {dias} días. Cualquier cosa me avisas. ¡Gracias!",
    "cliente-ritmo":
      "Hola {nombre}, ¡te extrañamos en {negocio}! Hace {dias} días que no pasas por aquí. Si necesitas algo, escríbeme y te lo separo.",
    adelanto:
      "Hola {nombre}, ¿cómo vas? Te escribo de {negocio} por el adelanto del {desde}: queda un saldo de {monto}. Cuando puedas, lo coordinamos. ¡Gracias!",
    seguimiento:
      "Hola {nombre}, te escribo de nuevo de {negocio} por tu cuenta de {monto}. ¿Me confirmas cuándo puedes pagarla? ¡Gracias!",
    "seguimiento-cliente":
      "Hola {nombre}, te escribo de {negocio} para saber cómo estás. ¿Necesitas algo esta semana? Te lo tengo listo.",
  },
  claro: {
    "fiado-vencido":
      "Hola {nombre}. Tu cuenta de {monto} en {negocio} venció hace {dias} días. ¿Cuándo puedes pagarla? Puedes hacerlo por Yape o en la tienda.",
    "fiado-por-vencer":
      "Hola {nombre}. Tu cuenta de {monto} en {negocio} vence en {dias} días. Puedes pagarla por Yape o en la tienda.",
    "cliente-ritmo":
      "Hola {nombre}, soy de {negocio}. Hace {dias} días que no te vemos. Si necesitas algo, pídelo por aquí y te lo tengo listo.",
    adelanto:
      "Hola {nombre}. Del adelanto del {desde} queda un saldo de {monto}. ¿Cuándo lo coordinamos?",
    seguimiento:
      "Hola {nombre}. Sigue pendiente tu cuenta de {monto} en {negocio}. Necesito que me confirmes hoy cuándo la pagas.",
    "seguimiento-cliente":
      "Hola {nombre}, soy de {negocio}. ¿Te preparo tu pedido de siempre esta semana?",
  },
};

/** La plantilla que le toca a un candidato. */
export function clavePlantilla(c: Pick<Candidato, "tipo" | "datos">): ClavePlantilla {
  if (c.tipo === "seguimiento") return c.datos.monto == null ? "seguimiento-cliente" : "seguimiento";
  return c.tipo;
}

/** La del SIGUIENTE mensaje (el que queda guardado en «Recuérdame»). */
export function claveSiguiente(c: Pick<Candidato, "tipo" | "datos">): ClavePlantilla {
  return c.datos.monto == null ? "seguimiento-cliente" : "seguimiento";
}

/** ¿Sirve la plantilla de la IA? Trae sus huecos, no trae cifras ni enlaces. */
export function plantillaValida(clave: ClavePlantilla, texto: unknown): texto is string {
  if (typeof texto !== "string") return false;
  const t = texto.trim();
  if (t.length < 20 || t.length > 600) return false;
  if (/\d|https?:|www\./i.test(t)) return false; // una cifra escrita por la IA sería inventada
  return HUECOS_OBLIGATORIOS[clave].every((h) => t.includes(h));
}

/** «Rosa María Paredes» → «Rosa»; «Cliente 4455» se queda entero. */
export function nombreDePila(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (/^cliente\s+\d+$/i.test(limpio)) return limpio;
  return limpio.split(" ")[0] || limpio;
}

/** Rellena los huecos con los datos releídos (y arregla «en 0 días» / «1 días»). */
export function rellenarPlantilla(plantilla: string, c: Pick<Candidato, "nombre" | "datos">, negocio: string): string {
  const d = c.datos;
  const texto = plantilla
    .replaceAll("{nombre}", nombreDePila(c.nombre))
    .replaceAll("{negocio}", negocio.trim() || "la tienda")
    .replaceAll("{monto}", d.monto != null ? formatoMonto(d.monto, d.moneda) : "tu saldo")
    .replaceAll("{dias}", String(d.dias ?? 0))
    .replaceAll("{desde}", d.desde ? fechaConDia(d.desde) : "la última vez");
  return texto
    .replace(/\ben 0 días\b/g, "hoy")
    .replace(/\bhace 0 días\b/g, "hoy")
    .replace(/\b1 días\b/g, "1 día")
    .replace(/\{[a-z]+\}/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
