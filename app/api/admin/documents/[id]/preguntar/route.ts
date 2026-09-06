import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { motivoDeFalloIA } from "@/lib/documents/aviso-ia";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/[id]/preguntar — preguntarle a UN documento.
 *
 * El asistente del drive responde mirando el índice de TODOS los documentos;
 * esto es lo contrario: una sola pregunta contra un solo archivo, con todo su
 * texto disponible. Sirve para lo que uno hace parado frente al papel:
 * "¿cuánto es la renta?", "¿cuándo vence?", "¿quién firma?".
 *
 * Regla dura: la respuesta sale del documento o no sale. Además del texto, el
 * modelo devuelve la CITA textual en la que se apoyó, y el servidor la verifica
 * contra el documento — una cita inventada se descarta antes de llegar a la
 * pantalla, así nadie decide sobre una frase que el papel no dice.
 */

const Body = z.object({
  pregunta: z.string().min(3).max(400),
});

const Respuesta = z.object({
  respuesta: z.string().max(1200),
  cita: z.string().max(400).nullish(),
  seguro: z.boolean().nullish(),
});

type Ctx = { params: Promise<{ id: string }> };

/** Plegado simple para comparar la cita con el texto (tildes y espacios). */
const plegar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_IA", "documents:preguntar");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const texto = (doc.ocrText ?? "").trim();
    if (!texto) {
      return NextResponse.json(
        { error: "sin_texto", message: "Todavía no leí el texto de este documento. Usá «Analizar con IA» (o «Escanear» si es una foto) y volvé a preguntar." },
        { status: 422 },
      );
    }
    if (getActiveProvider() === "none") {
      return NextResponse.json(
        { error: "sin_ia", message: "No hay ningún servicio de IA configurado, así que no puedo leer el documento por vos." },
        { status: 503 },
      );
    }

    const prompt = `Sos el asistente de una bodega peruana. Contestá la pregunta USANDO SOLO el documento de abajo.

Reglas:
- Si el documento no lo dice, respondé exactamente: "El documento no lo dice." y dejá "cita" en null. NO adivines.
- "cita" tiene que ser una frase COPIADA TAL CUAL del documento (máximo 200 caracteres), la que sostiene tu respuesta.
- Español, tuteo peruano, breve y concreto. Los montos con su moneda.

Devolvé SOLO este JSON: {"respuesta": "<respuesta breve>", "cita": "<frase textual del documento o null>", "seguro": <true si la respuesta está literal en el documento, false si la dedujiste>}

Documento "${doc.name}":
${texto.slice(0, 12000)}

Pregunta: ${parsed.data.pregunta.trim()}`;

    let salida: z.infer<typeof Respuesta>;
    try {
      const { text } = await generateText({ model: smartModel, prompt, temperature: 0.1 });
      const r = Respuesta.safeParse(JSON.parse(cleanJSONResponse(text)));
      if (!r.success) {
        return NextResponse.json({ error: "respuesta_invalida", message: "La IA contestó algo que no pude entender. Probá de nuevo." }, { status: 502 });
      }
      salida = r.data;
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      logger.warn("documents.preguntar.ia_fail", { err: detalle });
      return NextResponse.json({ error: "ia_fail", message: motivoDeFalloIA(detalle) }, { status: 502 });
    }

    // La cita se verifica contra el documento: si no está ahí, se cae. Es la
    // diferencia entre "lo dice el papel" y "lo dijo el modelo".
    const cita = salida.cita?.trim() ?? "";
    const citaVerificada = cita.length > 8 && plegar(texto).includes(plegar(cita)) ? cita : null;

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "view",
      metadata: { preguntar: parsed.data.pregunta.slice(0, 200) },
    }).catch((err) => logger.warn("documents.preguntar.audit_fail", { err: String(err) }));

    return NextResponse.json({
      respuesta: salida.respuesta,
      cita: citaVerificada,
      // Sin cita comprobada no hay respaldo: la pantalla lo muestra más flojo.
      respaldada: !!citaVerificada,
    });
  } catch (e) {
    logger.error("[documents.preguntar] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
