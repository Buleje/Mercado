import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { anthropicProvider } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { logger } from "@/lib/logger";
import { ACTIVIDADES, type ActividadPatio } from "@/lib/camaras/camaras";
import { comoDigito, normalizarChalecos } from "@/lib/camaras/cruces";

/**
 * Qué se ve en la foto que mandó la cámara del patio.
 *
 * La cámara ya deposita imágenes fechadas (ADR-411); esto las convierte en algo
 * que se puede leer y buscar: una línea que describe la escena, si hay gente o
 * vehículos, la placa cuando se alcanza a leer, los números de chaleco/casco del
 * personal y qué se está haciendo (lectura v2, 2026-10-01 — ADR-456).
 *
 * ## Lo que NO hace, a propósito
 *
 * **No declara nada.** Una placa mal leída cruzada contra una guía forestal
 * sería un dato falso dentro de un acta que se presenta ante SERFOR. Acá la
 * lectura se guarda COMO LECTURA —con su confianza— y la pantalla la ofrece
 * para que una persona la confirme. El sistema propone; el que firma decide.
 *
 * **No inventa cuando no ve.** De noche, con lluvia o con el lente tapado, lo
 * correcto es `confianza: "baja"` y `placa: null`. Un «ABC-123» inventado es
 * peor que un «no se lee»: manda a buscar un camión que nunca existió.
 *
 * **No reconoce caras.** Al personal se lo identifica por el NÚMERO impreso en
 * su chaleco o casco, nunca por el rostro: Claude no identifica personas por la
 * cara, y la Ley 29733 trata el dato biométrico como sensible (consentimiento
 * escrito de cada trabajador). El prompt lo prohíbe y pide describir a la gente
 * sólo por lo que hace y su ropa de trabajo (ADR-456 §3).
 *
 * Nunca lanza: cualquier fallo (red, presupuesto, JSON roto) devuelve un
 * resultado vacío con su motivo. La foto ya está guardada — que el análisis
 * falle no puede hacerla desaparecer.
 */

/**
 * Modelos a intentar, en orden. El primero es el actual; los otros están de red
 * por si una cuenta todavía no tiene habilitado el nuevo (un id desconocido es
 * un error de runtime, no de compilación). Lo usa también la pila (`pila.ts`).
 */
export const MODELOS_CAMARA = ["claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"] as const;

/**
 * Costo aproximado por foto. Una foto de 1600 px son ~1 900 tokens de imagen,
 * más ~900 de instrucciones y ~200 de respuesta: con precios de Sonnet
 * ($3/$15 por millón) da ≈ US$ 0,011. El 0,005 de antes contaba la mitad.
 */
const COSTO_POR_FOTO_USD = 0.01;

export interface LecturaDeFoto {
  /** Una línea en español, como se la contaría alguien por teléfono. */
  descripcion: string | null;
  hayPersona: boolean;
  hayVehiculo: boolean;
  /** Cuántas personas se ven, si se pueden contar. */
  personas: number | null;
  /** Placa leída, normalizada. `null` = no se lee o no hay. */
  placa: string | null;
  confianza: "alta" | "media" | "baja";
  /** Por qué la confianza es baja: «de noche», «lente sucio», «muy lejos». */
  motivo: string | null;
  /** Números de chaleco/casco que se leen completos. `[]` = no se ve ninguno. */
  chalecos: string[];
  /** Qué se está haciendo. `null` = no se distingue. */
  actividad: ActividadPatio | null;
  /** Qué modelo la leyó y cuánto tardó — para poder auditar después. */
  modelo?: string;
  ms?: number;
}

const VACIA: LecturaDeFoto = {
  descripcion: null,
  hayPersona: false,
  hayVehiculo: false,
  personas: null,
  placa: null,
  confianza: "baja",
  motivo: null,
  chalecos: [],
  actividad: null,
};

const sinLectura = (motivo: string): LecturaDeFoto => ({ ...VACIA, motivo });

const jsonSchema = z
  .object({
    descripcion: z.string().nullable().optional(),
    hayPersona: z.boolean().optional(),
    hayVehiculo: z.boolean().optional(),
    personas: z.union([z.number(), z.string()]).nullable().optional(),
    placa: z.string().nullable().optional(),
    confianza: z.enum(["alta", "media", "baja"]).optional(),
    motivo: z.string().nullable().optional(),
    chalecos: z.array(z.union([z.string(), z.number()])).nullable().optional(),
    actividad: z.string().nullable().optional(),
  })
  .passthrough();

const SYSTEM = `Miras fotos de la cámara de seguridad de un aserradero en la selva peruana
(patio de trozas, portón de entrada, zona de la sierra) y describes lo que se ve.

Responde SOLO un objeto JSON con estos campos:
- descripcion: UNA línea en español, concreta, como se la contarías a alguien por teléfono.
  Ej: "Camión rojo cargado de trozas entrando por el portón". Sin adornos ni interpretaciones.
- hayPersona: true/false
- hayVehiculo: true/false
- personas: cuántas personas se ven (número), o null si no se pueden contar
- placa: la placa del vehículo si SE LEE con claridad, en formato peruano (ABC-123). Si no se
  lee, está cortada, borrosa o dudosa: null. NUNCA adivines ni completes caracteres.
- chalecos: lista de los NÚMEROS impresos en chalecos o cascos del personal que se lean completos,
  como texto (ej. ["3", "12"]). Si no se ve ninguno o no se lee entero: []. NUNCA adivines un dígito.
- actividad: lo que se está haciendo, UNA de estas palabras:
  "carga" (subiendo madera a un vehículo), "descarga" (bajando madera de un vehículo),
  "aserrio" (cortando en la sierra), "apilado" (acomodando trozas o tablas en una pila),
  "transito" (gente o vehículos pasando, sin trabajar la madera), "ninguna" (no pasa nada).
- confianza: "alta" | "media" | "baja" según qué tan claro se ve
- motivo: si la confianza no es alta, por qué en pocas palabras ("de noche", "lente con gotas",
  "muy lejos", "movimiento")

Reglas:
- PERSONAS: nunca identifiques a nadie ni digas quién es. No describas la cara, los rasgos
  faciales, la edad, el color de piel, el pelo, tatuajes ni ningún rasgo del cuerpo. Describe a
  la gente sólo por lo que hace y su ropa de trabajo ("un trabajador con chaleco naranja
  cargando una troza"). Lo único que puede decir quién es alguien es el número impreso en su
  chaleco o casco, y eso va en "chalecos".
- Es de noche, hay niebla o el lente está sucio → confianza "baja" y describe lo poco que se vea.
- No hay nada reconocible (pared, cielo, negro) → descripcion breve, actividad "ninguna" y
  confianza "baja".
- Prefiere decir "no se lee" antes que arriesgar: un dato inventado acá termina en un documento oficial.

SOLO el JSON, sin texto antes ni después.`;

/** El primer objeto JSON de la respuesta, aunque venga con ```json o texto alrededor. */
export function extraerJson(raw: string): unknown | null {
  const limpio = raw.replace(/```json\s*|\s*```/g, "").trim();
  const m = limpio.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Normaliza una placa peruana: mayúsculas, un guion, sin espacios.
 * Si no tiene la forma esperada se devuelve `null` — media placa no sirve para
 * cruzar contra nada y es peor que nada.
 */
export function normalizarPlaca(v: unknown): string | null {
  const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < 6 || s.length > 7) return null;
  /**
   * Los formatos peruanos vigentes —ABC-123, A1B-234, AB1C-234— terminan todos
   * en TRES DÍGITOS y llevan al menos una letra adelante. Exigirlo no es
   * cosmética: sin esa regla, una frase que el modelo devolviera en el campo
   * («no se lee», sin espacios `NOSELEE`) entraba como la placa «NOSE-LEE» y de
   * ahí a cruzarse contra una guía forestal — lo encontró su propio test.
   *
   * Pero en esos tres lugares la cámara confunde un dígito con su letra
   * gemela (8↔B, 0↔O, 5↔S…): «W2D-B35» se descartaba y el camión W2D-835
   * nunca se cruzaba. Se acepta UNA letra confundible ahí —se valida como si
   * fuera su dígito— y la placa se guarda COMO SE LEYÓ: así el cruce con
   * W2D-835 sale «parecida», nunca «exacta», y una persona confirma. Dos ya
   * no: «BORROSO» sería «BORR-OSO» con tres, y es una palabra, no una placa.
   */
  const cuerpo = s.slice(0, s.length - 3);
  const final = s.slice(-3);
  let letrasEnLosDigitos = 0;
  for (const ch of final) {
    if (/\d/.test(ch)) continue;
    if (!comoDigito(ch)) return null;
    letrasEnLosDigitos += 1;
  }
  if (letrasEnLosDigitos > 1) return null;
  if (!/[A-Z]/.test(cuerpo)) return null;
  return `${cuerpo}-${final}`;
}

/** La actividad sólo si es una de la lista: lo demás es el modelo inventando una categoría. */
function aActividad(v: unknown): ActividadPatio | null {
  const s = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (ACTIVIDADES as readonly string[]).includes(s) ? (s as ActividadPatio) : null;
}

/**
 * La respuesta del modelo convertida en lectura. Exportada para probarla sin
 * llamar a la IA: es donde se hace cumplir lo que el prompt pide.
 */
export function lecturaDesdeRespuesta(texto: string): Omit<LecturaDeFoto, "modelo" | "ms"> | null {
  const parsed = jsonSchema.safeParse(extraerJson(texto));
  if (!parsed.success) return null;
  const d = parsed.data;
  const confiable = d.confianza === "alta" || d.confianza === "media";
  return {
    descripcion: (d.descripcion ?? "").trim() || null,
    hayPersona: Boolean(d.hayPersona),
    hayVehiculo: Boolean(d.hayVehiculo),
    personas: aNumero(d.personas),
    /* Una placa o un número de chaleco sólo valen si además la confianza
       acompaña: el prompt pide no adivinar, y esto lo hace cumplir del lado
       nuestro. Un «3» leído de noche le pone nombre a la persona equivocada. */
    placa: confiable ? normalizarPlaca(d.placa) : null,
    chalecos: confiable ? normalizarChalecos(d.chalecos) : [],
    actividad: aActividad(d.actividad),
    confianza: d.confianza ?? "baja",
    motivo: (d.motivo ?? "").trim() || null,
  };
}

function aNumero(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 0 && n < 1000 ? n : null;
}

/**
 * Lee una foto. `tenantId` define el presupuesto: una cámara disparada por el
 * viento no puede gastarle la cuota de IA a otro negocio.
 */
export async function leerFotoDeCamara(
  tenantId: string,
  imagen: string | URL,
): Promise<LecturaDeFoto> {
  if (!tenantId) return sinLectura("sin_tenant");
  if (!process.env.ANTHROPIC_API_KEY) return sinLectura("sin_ia_configurada");

  const bucket = `camaras:${tenantId}`;
  if (!(await aiCostGuard.canSpend(bucket, COSTO_POR_FOTO_USD, "business"))) {
    logger.warn("[camara-vision] presupuesto agotado", { tenantId });
    return sinLectura("presupuesto_agotado");
  }

  const arrancó = Date.now();
  let ultimoError = "";

  for (const modelo of MODELOS_CAMARA) {
    try {
      const { text } = await generateText({
        model: anthropicProvider(modelo),
        maxOutputTokens: 500,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "¿Qué se ve en esta foto de la cámara? Devuelve el JSON." },
              { type: "image", image: imagen instanceof URL ? imagen : new URL(imagen) },
            ],
          },
        ],
      });

      /* La llamada ya se cobró, se entienda o no la respuesta: sin esto el
         tope por negocio nunca bajaba y no frenaba nada. */
      aiCostGuard
        .recordSpend(bucket, COSTO_POR_FOTO_USD)
        .catch((err) => logger.error("[camara-vision] no se pudo anotar el gasto", { error: String(err), tenantId }));
      const lectura = lecturaDesdeRespuesta(text);
      if (!lectura) {
        ultimoError = "respuesta_ilegible";
        continue;
      }
      return { ...lectura, modelo, ms: Date.now() - arrancó };
    } catch (err) {
      ultimoError = err instanceof Error ? err.message : String(err);
      /* Un modelo que la cuenta no tiene habilitado se ve como error de la
         llamada: se prueba el siguiente en vez de dar la foto por perdida. */
      logger.warn("[camara-vision] falló con un modelo, probando el siguiente", {
        modelo,
        error: ultimoError,
      });
    }
  }

  logger.error("[camara-vision] no se pudo leer la foto", { tenantId, error: ultimoError });
  return sinLectura("no_se_pudo_leer");
}
