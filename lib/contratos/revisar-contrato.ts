import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";
import type { DbContract, ContractRevisionIa, ContractRiesgo } from "@/lib/types/contracts";

/**
 * Revisor de cláusulas (ADR-307).
 *
 * Le lee el contrato a alguien que no es abogado y le dice, antes de firmar,
 * qué le puede salir caro. Dos capas:
 *
 *  1. **Reglas duras**, que corren siempre: son las que no admiten opinión
 *     (campos sin rellenar, fechas al revés, topes legales peruanos). No
 *     dependen de que haya API key ni de que el modelo esté de buen humor.
 *  2. **La IA**, que suma lo que las reglas no ven: cláusulas desbalanceadas,
 *     obligaciones sin contraparte, silencios peligrosos.
 *
 * Las reglas nunca son pisadas por la IA: si el contrato tiene un plazo ilegal,
 * eso aparece aunque el modelo no lo mencione.
 */

// ── Capa 1: reglas duras ─────────────────────────────────────────────────────

/** Lo que quedó sin completar: `fillTemplate` deja `[NOMBRE_CAMPO]` al no encontrar dato. */
function placeholdersSinLlenar(texto: string): string[] {
  const encontrados = texto.match(/\[[A-Z_0-9]{3,40}\]/g) ?? [];
  return [...new Set(encontrados)].map((p) => p.slice(1, -1));
}

function reglaMeses(contrato: DbContract): number | null {
  if (!contrato.fechaVencimiento) return null;
  const inicio = new Date(contrato.fechaInicio).getTime();
  const fin = new Date(contrato.fechaVencimiento).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
  return (fin - inicio) / (30.44 * 86_400_000);
}

export function revisarPorReglas(contrato: DbContract): {
  riesgos: ContractRiesgo[];
  camposVacios: string[];
} {
  const texto = contrato.contenido?.trim() || contrato.clausulas.join("\n\n");
  const riesgos: ContractRiesgo[] = [];
  const camposVacios = placeholdersSinLlenar(texto);

  if (camposVacios.length > 0) {
    riesgos.push({
      severidad: "alta",
      titulo: `Quedaron ${camposVacios.length} dato(s) sin llenar`,
      hallazgo: `En el texto todavía aparece ${camposVacios.slice(0, 4).map((c) => `[${c}]`).join(", ")}${camposVacios.length > 4 ? "…" : ""}.`,
      consecuencia:
        "Un contrato con espacios en blanco se puede completar después sin que vos lo veas, o directamente no vale para lo que quedó vacío.",
      sugerencia: "Volvé al asistente, completá esos campos y regenerá el contrato antes de mandarlo a firmar.",
    });
  }

  if (!contrato.fechaVencimiento) {
    riesgos.push({
      severidad: "media",
      titulo: "El contrato no dice cuándo termina",
      hallazgo: "No hay fecha de vencimiento cargada.",
      consecuencia:
        "Sin fecha de término nadie te avisa cuándo renovarlo, y en alquileres y suministros se prorroga solo en las condiciones viejas.",
      sugerencia: "Cargale una fecha de término o un plazo en meses.",
    });
  }

  const meses = reglaMeses(contrato);
  if (meses !== null && meses < 0) {
    riesgos.push({
      severidad: "alta",
      titulo: "Las fechas están al revés",
      hallazgo: "El vencimiento es anterior al inicio.",
      consecuencia: "El contrato nace vencido.",
      sugerencia: "Corregí las fechas antes de firmar.",
    });
  }

  if (contrato.tipo === "TRABAJO" && meses !== null && meses > 60.5) {
    riesgos.push({
      severidad: "alta",
      titulo: "El contrato de trabajo pasa los 5 años",
      hallazgo: `La duración cargada es de unos ${Math.round(meses)} meses.`,
      consecuencia:
        "Pasados los 5 años, el contrato sujeto a modalidad se convierte en indeterminado y el trabajador gana estabilidad laboral.",
      sugerencia: "Bajá el plazo o asumí que estás contratando a plazo indeterminado.",
      base: "Art. 74 del D.S. 003-97-TR",
    });
  }

  if (contrato.tipo === "TRABAJO" && !/causa objetiva/i.test(texto)) {
    riesgos.push({
      severidad: "media",
      titulo: "Falta la causa objetiva de la contratación",
      hallazgo: "El texto no menciona la causa objetiva.",
      consecuencia:
        "Un contrato a plazo fijo sin causa objetiva declarada se puede desnaturalizar y ser tratado como indeterminado ante una inspección.",
      sugerencia: "Describí por qué la contratación es temporal (campaña, suplencia, aumento de demanda).",
      base: "Arts. 53-83 del D.S. 003-97-TR",
    });
  }

  if (contrato.monto <= 0 && contrato.tipo !== "NDA") {
    riesgos.push({
      severidad: "media",
      titulo: "El contrato no tiene monto",
      hallazgo: "El monto quedó en cero.",
      consecuencia: "Sin monto no se puede reclamar un incumplimiento de pago ni calcular una penalidad.",
      sugerencia: "Cargá el precio, la renta o la remuneración pactada.",
    });
  }

  // Penalidades desmedidas: no hay tope legal fijo, pero por encima del 10%
  // semanal el juez la reduce por excesiva (art. 1346 del Código Civil).
  const penalidad = texto.match(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:del?\s+)?(?:precio|monto|valor)[^.]{0,40}(?:por\s+cada\s+)?(?:semana|d[ií]a)/i);
  if (penalidad) {
    const valor = parseFloat(penalidad[1].replace(",", "."));
    if (Number.isFinite(valor) && valor > 10) {
      riesgos.push({
        severidad: "media",
        titulo: `La penalidad del ${valor}% es muy alta`,
        hallazgo: `El texto pacta una penalidad de ${valor}% por período de atraso.`,
        consecuencia:
          "Una penalidad manifiestamente excesiva puede ser reducida por un juez, así que en la práctica no te protege.",
        sugerencia: "Bajala a un rango razonable (1-3% por semana) con un tope total.",
        base: "Art. 1346 del Código Civil",
      });
    }
  }

  // Documentos de identidad mal formados en el texto final. El rango arranca en
  // UN dígito a propósito: un RUC cortado a la mitad es el error de tipeo más
  // común, y un mínimo de seis lo dejaba pasar sin decir nada.
  const rucs = texto.match(/RUC\s*N?\.?[o°]?\s*(\d{1,15})/gi) ?? [];
  for (const cruda of rucs) {
    const digitos = cruda.replace(/\D/g, "");
    if (digitos.length !== 11 || !/^(10|20)/.test(digitos)) {
      riesgos.push({
        severidad: "alta",
        titulo: "Hay un RUC que no es válido",
        hallazgo: `Aparece "${cruda.trim()}" y un RUC peruano tiene 11 dígitos y empieza con 10 o 20.`,
        consecuencia: "Con el RUC mal escrito el contrato identifica a otra empresa, o a ninguna.",
        sugerencia: "Verificá el RUC en la ficha RUC de SUNAT y corregilo.",
      });
      break;
    }
  }

  if (contrato.firmantes.length === 0) {
    riesgos.push({
      severidad: "baja",
      titulo: "Todavía no hay firmantes definidos",
      hallazgo: "Nadie fue invitado a firmar.",
      consecuencia: "Un contrato sin firmas es un borrador: no obliga a nadie.",
      sugerencia: "Cargá a la contraparte y mandale el link de firma por WhatsApp.",
    });
  }

  return { riesgos, camposVacios };
}

// ── Capa 2: la IA ────────────────────────────────────────────────────────────

const RiesgoIaSchema = z.object({
  severidad: z.enum(["alta", "media", "baja"]),
  titulo: z.string().min(3).max(120),
  hallazgo: z.string().min(3).max(600),
  consecuencia: z.string().min(3).max(600),
  sugerencia: z.string().min(3).max(600),
  base: z.string().max(160).optional(),
});

const RespuestaIaSchema = z.object({
  puntaje: z.number().min(0).max(100),
  resumen: z.string().min(3).max(800),
  riesgos: z.array(RiesgoIaSchema).max(12),
});

function promptDeRevision(contrato: DbContract, texto: string): string {
  return [
    "Sos un abogado peruano revisando un contrato para el dueño de una bodega que NO es abogado.",
    "Tu trabajo es encontrar lo que le puede salir caro antes de que firme.",
    "",
    `Tipo de contrato: ${contrato.tipo}`,
    `Contraparte: ${contrato.clienteNombre}`,
    `Monto: ${contrato.moneda} ${contrato.monto}`,
    `Vigencia: ${contrato.fechaInicio} → ${contrato.fechaVencimiento ?? "sin término"}`,
    "",
    "TEXTO DEL CONTRATO:",
    texto.slice(0, 14_000),
    "",
    "Devolvé SOLO un JSON con esta forma exacta, sin texto alrededor ni markdown:",
    '{"puntaje": 0-100, "resumen": "…", "riesgos": [{"severidad":"alta|media|baja","titulo":"…","hallazgo":"…","consecuencia":"…","sugerencia":"…","base":"norma peruana si aplica"}]}',
    "",
    "Reglas:",
    "- Escribí en español rioplatense-peruano simple, como si se lo explicaras a un vecino. Nada de latinajos.",
    "- 'hallazgo' = qué dice el contrato hoy. 'consecuencia' = qué le puede pasar en plata o en juicio. 'sugerencia' = qué cambiar.",
    "- Priorizá: obligaciones sin contraparte, plazos ilegales, penalidades desbalanceadas, falta de cláusula de resolución, ausencia de garantías, y todo lo que perjudique a quien contrata.",
    "- 'puntaje' es qué tan sano está el contrato: 100 = impecable, 0 = no lo firmes.",
    "- Máximo 8 riesgos, los más importantes primero. Si está todo bien, devolvé una lista vacía.",
    "- Poné 'base' SÓLO si hay un artículo o decreto peruano concreto que lo respalde (ej.: 'Art. 1362 del Código Civil'). Si no lo hay, omití el campo por completo: no escribas que no aplica ninguna norma.",
  ].join("\n");
}

export async function revisarContrato(contrato: DbContract): Promise<ContractRevisionIa> {
  const texto = (contrato.contenido?.trim() || contrato.clausulas.join("\n\n")).trim();
  const reglas = revisarPorReglas(contrato);

  // Sin texto no hay nada que revisar más allá de lo que ya dicen las reglas.
  if (!texto || getActiveProvider() === "none") {
    return {
      revisadoEn: new Date().toISOString(),
      puntaje: puntajeDesdeRiesgos(reglas.riesgos),
      resumen: resumenDesdeRiesgos(reglas.riesgos),
      riesgos: reglas.riesgos,
      camposVacios: reglas.camposVacios,
      fuente: "reglas",
    };
  }

  try {
    // `generateObject` no sirve acá: con Groq falla por falta de json_schema.
    // El patrón del repo es texto + limpieza + safeParse.
    const { text } = await generateText({
      model: smartModel,
      prompt: promptDeRevision(contrato, texto),
    });
    const limpio = cleanJSONResponse(text);
    const parsed = RespuestaIaSchema.safeParse(JSON.parse(limpio));
    if (!parsed.success) throw new Error("respuesta de la IA con forma inesperada");

    // Las reglas van primero: son las que no admiten discusión.
    const riesgos = [...reglas.riesgos, ...dedupe(parsed.data.riesgos, reglas.riesgos)];
    return {
      revisadoEn: new Date().toISOString(),
      // El puntaje del modelo se castiga con lo que encontraron las reglas.
      puntaje: Math.min(parsed.data.puntaje, puntajeDesdeRiesgos(riesgos)),
      resumen: parsed.data.resumen,
      riesgos,
      camposVacios: reglas.camposVacios,
      fuente: "ia",
    };
  } catch (err) {
    logger.warn("[contratos] la revisión con IA falló, quedan las reglas", { err: String(err).slice(0, 200) });
    return {
      revisadoEn: new Date().toISOString(),
      puntaje: puntajeDesdeRiesgos(reglas.riesgos),
      resumen: resumenDesdeRiesgos(reglas.riesgos),
      riesgos: reglas.riesgos,
      camposVacios: reglas.camposVacios,
      fuente: "reglas",
    };
  }
}

/**
 * Evita que la IA repita, con otras palabras, algo que las reglas ya dijeron.
 * De paso limpia el "base" cuando el modelo, en vez de omitirlo, escribe que no
 * hay norma aplicable: eso ocupa el lugar de una cita real y no aporta nada.
 */
function dedupe(deLaIa: ContractRiesgo[], deReglas: ContractRiesgo[]): ContractRiesgo[] {
  const clave = (r: ContractRiesgo) => r.titulo.toLowerCase().replace(/[^a-záéíóúñ ]/g, "").slice(0, 28);
  const yaEstan = new Set(deReglas.map(clave));
  const sinNorma = /no\s+(se\s+)?aplica|ninguna\s+norma|no\s+hay\s+norma|pr[aá]ctica\s+com[uú]n/i;
  return deLaIa
    .filter((r) => !yaEstan.has(clave(r)))
    .map((r) => (r.base && sinNorma.test(r.base) ? { ...r, base: undefined } : r));
}

function puntajeDesdeRiesgos(riesgos: ContractRiesgo[]): number {
  const castigo = riesgos.reduce(
    (s, r) => s + (r.severidad === "alta" ? 22 : r.severidad === "media" ? 10 : 4),
    0,
  );
  return Math.max(0, 100 - castigo);
}

function resumenDesdeRiesgos(riesgos: ContractRiesgo[]): string {
  if (riesgos.length === 0) return "No encontramos problemas evidentes en este contrato.";
  const altas = riesgos.filter((r) => r.severidad === "alta").length;
  if (altas > 0) {
    return `Encontramos ${altas} problema${altas === 1 ? "" : "s"} serio${altas === 1 ? "" : "s"} que conviene arreglar antes de firmar.`;
  }
  return `Encontramos ${riesgos.length} punto${riesgos.length === 1 ? "" : "s"} para revisar antes de firmar.`;
}
