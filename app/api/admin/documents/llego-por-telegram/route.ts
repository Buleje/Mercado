/**
 * POST /api/admin/documents/llego-por-telegram — papel que Brandon le mandó a
 * su bot de Telegram → Archivo › Llegó por Telegram › <día de Lima> (31-10).
 *
 * Lo llama el buzón de la PC (`~/.local/bin/buzon-telegram` →
 * `tools/mcp-buleje/archivar-telegram.mjs`) con la sesión del usuario del MCP,
 * después de guardar la copia local. Multipart:
 *
 *   archivo    la foto / PDF / Word / Excel (≤ MAX_BYTES_PAPEL)
 *   mensajeId  `<chat>:<message_id>` de Telegram: la llave de la idempotencia
 *   pie        opcional: el nombre con que quedó en la PC
 *
 * El mismo mensaje dos veces (el buzón se cayó tras subirlo y Telegram lo
 * re-entrega) = un solo documento: la segunda vez responde `duplicado: true`
 * con dónde está. El núcleo (tipo por bytes, carpeta y papel con candado de
 * dueño, análisis que lo ordena) es el mismo de WhatsApp:
 * `lib/documentos/papel-entrante.ts`.
 */
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";
import {
  CARPETA_DEL_CANAL,
  MAX_BYTES_PAPEL,
  analizarYOrdenarPapel,
  autorDeTelegram,
  enlaceACarpeta,
  guardarPapelEntrante,
  idDelPapelDeCanal,
  type ResultadoPapel,
} from "@/lib/documentos/papel-entrante";

const RAIZ = CARPETA_DEL_CANAL.telegram;
const MB = MAX_BYTES_PAPEL / 1024 / 1024;

const Campos = z.object({
  // Un chat privado es positivo; un grupo, negativo. message_id es por chat.
  mensajeId: z
    .string()
    .trim()
    .regex(/^-?\d{1,20}:\d{1,12}$/, "mensajeId va como <chat>:<mensaje>, sólo números"),
  pie: z.string().trim().max(200).optional(),
});

type Motivo = Exclude<ResultadoPapel, { ok: true }>["motivo"];
const NO_GUARDADO: Record<Exclude<Motivo, "duplicado">, { status: number; message: string }> = {
  tipo: { status: 415, message: "Ese tipo de archivo no lo guardo en el Archivo: foto, PDF, Word o Excel." },
  grande: { status: 413, message: `Ese archivo pesa más de ${MB} MB. Súbelo desde el panel, en Archivo.` },
  descarga: { status: 400, message: "No llegó el archivo completo. Mándalo de nuevo." },
  storage: { status: 503, message: "No pude guardarlo en el Archivo. Prueba de nuevo en un rato." },
  error: { status: 500, message: "No pude guardarlo en el Archivo. Prueba de nuevo en un rato." },
};

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : undefined);

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "DRIVE", "documents:telegram");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  // `requireAdmin` deja pasar a `manager` por el management tier: los papeles
  // que llegan por un canal son sólo del admin o del dueño (nacen con candado).
  if (auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo el administrador o el dueño guardan papeles que llegan por Telegram." },
      { status: 403 },
    );
  }

  // Seguridad 31-10: cortar por el largo declarado ANTES de leer el cuerpo (el proxy deja pasar 50 MB).
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_PAPEL + 64 * 1024) return NextResponse.json({ error: "too_large", ...NO_GUARDADO.grande }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Mándalo como formulario con el archivo." }, { status: 400 });
  }
  const archivo = form.get("archivo");
  if (!(archivo instanceof Blob)) {
    return NextResponse.json({ error: "no_file", message: "Falta el archivo." }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES_PAPEL) return NextResponse.json({ error: "too_large", ...NO_GUARDADO.grande }, { status: 413 });

  const campos = Campos.safeParse({ mensajeId: texto(form.get("mensajeId")), pie: texto(form.get("pie")) || undefined });
  if (!campos.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Falta el id del mensaje de Telegram.", issues: campos.error.issues },
      { status: 400 },
    );
  }
  const { mensajeId, pie } = campos.data;
  // Seguridad 31-10: la llave lleva QUIÉN lo sube; otro admin del negocio no puede «ocupar» antes un
  // <chat>:<mensaje> futuro de Brandon (los message_id van en orden) y hacer que su papel diga «ya estaba».
  const llave = `${auth.username}|${mensajeId}`;
  const tenantId = auth.tenantId;
  const autor = autorDeTelegram(mensajeId.split(":")[0]);
  const filename = archivo instanceof File ? archivo.name : undefined;
  const mimeDeclarado = archivo.type || undefined;

  const r = await guardarPapelEntrante(
    tenantId,
    "telegram",
    {
      idMensaje: llave,
      tipo: mimeDeclarado?.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(filename ?? "") ? "imagen" : "documento",
      mimeDeclarado,
      filename,
      pie,
      autor,
      pedidoPor: auth.username,
    },
    async () => ({ ok: true, bytes: Buffer.from(await archivo.arrayBuffer()), mime: mimeDeclarado }),
  );

  if (r.ok) {
    // Igual que la subida del panel: lo lee y, si sugiere una carpeta que existe, lo mueve.
    after(() => analizarYOrdenarPapel(tenantId, "telegram", r, autor, async () => undefined));
    return NextResponse.json(
      {
        nombre: r.nombre,
        carpetaId: r.carpetaId,
        carpetaNombre: r.carpetaNombre,
        carpetaRaiz: RAIZ,
        enlace: enlaceACarpeta(r.carpetaId),
      },
      { status: 201 },
    );
  }

  if (r.motivo === "duplicado") return yaGuardado(tenantId, llave);
  const no = NO_GUARDADO[r.motivo];
  return NextResponse.json({ error: r.motivo, message: no.message }, { status: no.status });
}

/** Re-entrega: dónde quedó la primera vez (o 409 si la primera todavía se está subiendo). */
async function yaGuardado(tenantId: string, mensajeId: string): Promise<NextResponse> {
  try {
    const doc = await DocumentsDB.getByIdIncludingDeleted(tenantId, idDelPapelDeCanal(tenantId, "telegram", mensajeId));
    if (!doc || doc.storagePath === "pending") {
      return NextResponse.json(
        { error: "en_curso", message: "Ese papel se está guardando ahora mismo; espera un momento." },
        { status: 409 },
      );
    }
    const carpeta = doc.folderId
      ? (await DocumentsDB.listFolders(tenantId)).find((f) => f.id === doc.folderId)
      : undefined;
    return NextResponse.json({
      duplicado: true,
      enPapelera: Boolean(doc.deletedAt),
      nombre: doc.name,
      carpetaId: doc.folderId,
      carpetaNombre: carpeta?.name ?? "Archivo",
      carpetaRaiz: RAIZ,
      enlace: doc.folderId ? enlaceACarpeta(doc.folderId) : null,
    });
  } catch (err) {
    logger.error("[telegram/archivo] no se pudo leer el papel ya guardado", { tenantId, error: String(err) });
    return NextResponse.json({ duplicado: true, nombre: null, carpetaId: null, carpetaNombre: null, carpetaRaiz: RAIZ, enlace: null });
  }
}
