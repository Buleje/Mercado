import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { anthropicProvider } from "@/lib/ai/provider";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { logger } from "@/lib/logger";

/**
 * Qué se ve en la foto que mandó la cámara del patio.
 *
 * La cámara ya deposita imágenes fechadas (ADR-411); esto las convierte en algo
 * que se puede leer y buscar: una línea que describe la escena, si hay gente o
 * vehículos, y la placa cuando se alcanza a leer.
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
 * Nunca lanza: cualquier fallo (red, presupuesto, JSON roto) devuelve un
 * resultado vacío con su motivo. La foto ya está guardada — que el análisis
 * falle no puede hacerla desaparecer.
 */

/**
 * Modelos a intentar, en orden. El primero es el actual; el segundo es el que
 * el resto del repo ya usa para visión, y está de red por si una cuenta todavía
 * no tiene habilitado el nuevo (un id desconocido es un error de runtime, no de
 * compilación).
 */
const MODELOS = ["claude-sonnet-5", "claude-sonnet-4-6"] as const;

/** Costo aproximado por foto (imagen + prompt + respuesta corta). */
const COSTO_POR_FOTO_USD = 0.005;

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
  })
  .passthrough();

const SYSTEM = `Mirás fotos de la cámara de seguridad de un aserradero en la selva peruana
(patio de trozas, portón de entrada, zona de la sierra) y describís lo que se ve.

Respondé SOLO un objeto JSON con estos campos:
- descripcion: UNA línea en español, concreta, como se la contarías a alguien por teléfono.
  Ej: "Camión rojo cargado de trozas entrando por el portón". Sin adornos ni interpretaciones.
- hayPersona: true/false
- hayVehiculo: true/false
- personas: cuántas personas se ven (número), o null si no se pueden contar
- placa: la placa del vehículo si SE LEE con claridad, en formato peruano (ABC-123). Si no se
  lee, está cortada, borrosa o dudosa: null. NUNCA adivines ni completes caracteres.
- confianza: "alta" | "media" | "baja" según qué tan claro se ve
- motivo: si la confianza no es alta, por qué en pocas palabras ("de noche", "lente con gotas",
  "muy lejos", "movimiento")

Reglas:
- Es de noche, hay niebla o el lente está sucio → confianza "baja" y describí lo poco que se vea.
- No hay nada reconocible (pared, cielo, negro) → descripcion breve y confianza "baja".
- Preferí decir "no se lee" antes que arriesgar: un dato inventado acá termina en un documento oficial.

SOLO el JSON, sin texto antes ni después.`;

function extraerJson(raw: string): unknown | null {
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
   */
  const cuerpo = s.slice(0, s.length - 3);
  const final = s.slice(-3);
  if (!/^\d{3}$/.test(final)) return null;
  if (!/[A-Z]/.test(cuerpo)) return null;
  return `${cuerpo}-${final}`;
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

  for (const modelo of MODELOS) {
    try {
      const { text } = await generateText({
        model: anthropicProvider(modelo),
        maxOutputTokens: 400,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "¿Qué se ve en esta foto de la cámara? Devolvé el JSON." },
              { type: "image", image: imagen instanceof URL ? imagen : new URL(imagen) },
            ],
          },
        ],
      });

      const parsed = jsonSchema.safeParse(extraerJson(text));
      if (!parsed.success) {
        ultimoError = "respuesta_ilegible";
        continue;
      }
      const d = parsed.data;
      return {
        descripcion: (d.descripcion ?? "").trim() || null,
        hayPersona: Boolean(d.hayPersona),
        hayVehiculo: Boolean(d.hayVehiculo),
        personas: aNumero(d.personas),
        /* Una placa sólo vale si además la confianza acompaña: el prompt pide no
           adivinar, y esto lo hace cumplir del lado nuestro. */
        placa: d.confianza === "baja" ? null : normalizarPlaca(d.placa),
        confianza: d.confianza ?? "baja",
        motivo: (d.motivo ?? "").trim() || null,
        modelo,
        ms: Date.now() - arrancó,
      };
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
