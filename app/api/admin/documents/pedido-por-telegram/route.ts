/**
 * /api/admin/documents/pedido-por-telegram — Brandon le pide un papel a su bot
 * de Telegram y el bot se lo manda (31-10).
 *
 * Lo llama el buzón de la PC (`~/.local/bin/buzon-telegram` →
 * `tools/mcp-buleje/pedir-papel-telegram.mjs`) con la sesión del usuario del
 * MCP, en el negocio que dijo la frase (Blas por defecto, la bodega si dice
 * «bodega»). Pasos:
 *
 *   GET  ?frase=…            ¿es un pedido de papel? Si sí, los que calzan (≤ 5,
 *                            el mejor primero) y cuál mandar si uno es claro.
 *   GET  ?id=…&que=datos     lo que hace falta para mandarlo y si se puede.
 *   GET  ?id=…               el archivo. No sale si tiene una clave de verdad
 *                            (`papelConClave`) o pasa lo que Telegram deja.
 *   POST {id, mensajeId, enviadoId}   ya salió: queda en el historial del
 *                            papel, una sola vez por envío. Va como «Compartido»
 *                            (`share`) con `canal: "telegram"`, igual que el envío
 *                            por WhatsApp del asistente (`mandar-papel.server.ts`):
 *                            una acción nueva pedía tocar las 3 pantallas que
 *                            pintan el historial.
 *
 * La búsqueda es la del WhatsApp del dueño (`buscarPapeles`: el lector de
 * frases y los filtros del Archivo, con el rol de quien pide), así que el bot
 * ve lo mismo que el Archivo le muestra a ese usuario. El historial se escribe
 * DESPUÉS de que Telegram confirmó el envío: si no salió, no dice que salió.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { ordenarPorRelevancia } from "@/lib/documentos/relevancia";
import { plegar, type CarpetaBuscable } from "@/lib/documentos/busqueda-natural";
import { autorDeTelegram } from "@/lib/documentos/papel-entrante";
import { buscarPapeles } from "@/lib/whatsapp/responder-archivo";
import {
  baseDelPanel,
  enlaceAPapel,
  hoyEnLima,
  loQueBusque,
  ordenarParaResponder,
  papelParaMandar,
  textoDelVencimiento,
} from "@/lib/whatsapp/preguntar-archivo";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";
import type { SessionPayload } from "@/lib/session";
import {
  MAX_BOTONES,
  MAX_BYTES_TELEGRAM,
  cadenaDeCarpetas,
  carpetaCorta,
  leerPedidoDePapel,
  nombreDeArchivo,
  papelConClave,
} from "./pedido";

const MENSAJE_ID = /^-?\d{1,20}:\d{1,12}$/;
const IdPapel = z.string().trim().min(1).max(64).regex(/^[\w-]+$/);
const Frase = z.string().trim().min(1).max(300);
const Salio = z.object({
  id: IdPapel,
  // `<chat>:<message_id>` del pedido (el mensaje de Brandon o el botón que tocó).
  mensajeId: z.string().trim().regex(MENSAJE_ID, "mensajeId va como <chat>:<mensaje>, sólo números"),
  // El message_id con que Telegram entregó el archivo: la prueba de que salió.
  enviadoId: z.number().int().positive().max(1e12),
});

const NO_SALE_CLAVE = "Ese papel tiene claves (usuario y contraseña, clave SOL…): no lo mando por Telegram. Ábrelo en el panel.";
const MB_TOPE = Math.floor(MAX_BYTES_TELEGRAM / 1024 / 1024);

/** Sólo el administrador o el dueño: es su bot y sus papeles salen del panel. */
async function autorizar(req: NextRequest): Promise<SessionPayload | NextResponse> {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  // `requireAdmin` deja pasar a `manager` por el management tier.
  if (auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json(
      { error: "forbidden", message: "Solo el administrador o el dueño piden papeles por Telegram." },
      { status: 403 },
    );
  }
  return auth;
}

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "DRIVE_READ", "documents:telegram-pedido");
  if (rl) return rl;
  const auth = await autorizar(req);
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;

  try {
    if (sp.has("id")) {
      const id = IdPapel.safeParse(sp.get("id"));
      if (!id.success) return NextResponse.json({ error: "invalid_id", message: "Id de papel inválido." }, { status: 400 });
      return await papel(auth, id.data, sp.get("que") === "datos");
    }
    const frase = Frase.safeParse(sp.get("frase") ?? "");
    if (!frase.success) return NextResponse.json({ error: "invalid_body", message: "Falta la frase." }, { status: 400 });
    return await buscar(auth, frase.data);
  } catch (err) {
    logger.error("[telegram/pedido] falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "server", message: "No pude buscar en el Archivo ahora." }, { status: 500 });
  }
}

interface PapelResumido {
  id: string;
  nombre: string;
  carpeta: string;
  codigo: string | null;
  mime: string;
  bytes: number;
  vence: string | null;
  clave: boolean;
  grande: boolean;
}

function resumir(d: DbDocument, carpetas: readonly CarpetaBuscable[], hoy: string): PapelResumido {
  const cadena = cadenaDeCarpetas(d.folderId, carpetas);
  return {
    id: d.id,
    nombre: d.name,
    carpeta: carpetaCorta(cadena),
    codigo: formatoCodigoDocumento(d.codigo),
    mime: resolverMime(d.name, d.mimeType),
    bytes: d.size,
    vence: textoDelVencimiento(d.expiresAt, hoy),
    // La lista no trae el texto leído (es liviana): acá mira nombre, carpetas y
    // descripción; el archivo (`?id=`) vuelve a mirar con el texto entero.
    clave: papelConClave(d, cadena),
    grande: d.size > MAX_BYTES_TELEGRAM,
  };
}

/** Deja el primero de cada archivo repetido (mismo nombre y mismo tamaño), en el orden que venían. */
function sinCopias(docs: readonly DbDocument[]): DbDocument[] {
  const vistos = new Set<string>();
  return docs.filter((d) => {
    const llave = `${plegar(d.name)}|${d.size}`;
    if (vistos.has(llave)) return false;
    vistos.add(llave);
    return true;
  });
}

async function buscar(auth: SessionPayload, texto: string): Promise<NextResponse> {
  const pedido = leerPedidoDePapel(texto);
  if (!pedido) return NextResponse.json({ esPedido: false });
  const { tenantId, role } = auth;
  const hoy = hoyEnLima();

  let ordenados: DbDocument[];
  let carpetas: CarpetaBuscable[];
  let entendi: string;
  let elegido: DbDocument | null;
  if (pedido.codigo != null) {
    // El código es único: la lista lo cruza con su número (`idPorCodigo`).
    carpetas = await DocumentsDB.carpetasParaBuscar(tenantId, role);
    ordenados = (await DocumentsDB.list(tenantId, { q: pedido.frase }, role)).filter((d) => d.codigo === pedido.codigo);
    entendi = formatoCodigoDocumento(pedido.codigo) ?? pedido.frase;
    elegido = ordenados.length === 1 ? ordenados[0] : null;
  } else {
    const r = await buscarPapeles(tenantId, pedido.frase, role);
    carpetas = r.carpetas;
    const palabras = plegar(r.interp.texto).split(/[^a-z0-9ñ]+/).filter((p) => p.length > 1);
    // Relevancia primero (nombre > descripción > contenido); después, estable,
    // los que tienen todas las palabras EN EL NOMBRE (`ordenarParaResponder`).
    const porRelevancia = palabras.length ? ordenarPorRelevancia(r.docs, [r.interp.texto, ...palabras]) : r.docs;
    ordenados = ordenarParaResponder(porRelevancia, r.interp, hoy) as DbDocument[];
    entendi = loQueBusque(r.interp);
    elegido = papelParaMandar(ordenados, r.interp) as DbDocument | null;
  }

  // El mismo archivo guardado en dos carpetas (medido 31-10: «DNI JEFE SHINSHIGUANI D.pdf», 186 045 bytes, en la
  // carpeta de la comunidad y en la del permiso) es UN papel: un botón, y si es el único, va directo.
  const unicos = sinCopias(ordenados);
  if (!elegido && unicos.length === 1) elegido = unicos[0];
  const visibles = unicos.slice(0, MAX_BOTONES);
  if (elegido && !visibles.some((d) => d.id === elegido.id)) visibles.unshift(elegido);
  // Sin la frase ni nombres (Ley 29733): cuántos y si hubo uno claro.
  logger.info("[telegram/pedido] búsqueda", { tenantId, resultados: ordenados.length, elegido: Boolean(elegido), codigo: pedido.codigo != null });
  return NextResponse.json({
    esPedido: true,
    frase: pedido.frase,
    entendi,
    total: ordenados.length,
    elegido: elegido?.id ?? null,
    papeles: visibles.map((d) => resumir(d, carpetas, hoy)),
  });
}

async function papel(auth: SessionPayload, id: string, soloDatos: boolean): Promise<NextResponse> {
  const { tenantId, role } = auth;
  const doc = await DocumentsDB.getById(tenantId, id, role);
  if (!doc) return NextResponse.json({ error: "not_found", message: "Ese papel ya no está en el Archivo." }, { status: 404 });
  const carpetas = await DocumentsDB.carpetasParaBuscar(tenantId, role);
  const cadena = cadenaDeCarpetas(doc.folderId, carpetas);
  const clave = papelConClave(doc, cadena);
  const grande = doc.size > MAX_BYTES_TELEGRAM;
  const mime = resolverMime(doc.name, doc.mimeType);

  if (soloDatos) {
    return NextResponse.json({
      id: doc.id,
      nombre: doc.name,
      archivo: nombreDeArchivo(doc.name, doc.originalName),
      carpeta: carpetaCorta(cadena),
      codigo: formatoCodigoDocumento(doc.codigo),
      mime,
      bytes: doc.size,
      vence: textoDelVencimiento(doc.expiresAt, hoyEnLima()),
      guardadoEn: doc.ubicacionFisica ?? null,
      clave,
      grande,
      enlace: enlaceAPapel(baseDelPanel(), doc.id),
    });
  }

  if (clave) return NextResponse.json({ error: "con_clave", message: NO_SALE_CLAVE }, { status: 422 });
  const muyGrande = { error: "too_large", message: `Pesa más de ${MB_TOPE} MB, lo que Telegram deja mandar. Ábrelo en el panel.` };
  if (grande) return NextResponse.json(muyGrande, { status: 413 });
  const buf = await downloadFromStorage(doc.storagePath);
  if (!buf) return NextResponse.json({ error: "storage_unavailable", message: "No pude leerlo del Archivo." }, { status: 502 });
  // `size` lo escribe quien subió; una versión nueva puede no haberlo actualizado.
  if (buf.length > MAX_BYTES_TELEGRAM) return NextResponse.json(muyGrande, { status: 413 });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mime || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": 'attachment; filename="documento"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "DRIVE", "documents:telegram-salio");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await autorizar(req);
  if (auth instanceof NextResponse) return auth;

  const body = Salio.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body", message: "Faltan el papel o los mensajes.", issues: body.error.issues }, { status: 400 });
  }
  const { id, mensajeId, enviadoId } = body.data;
  const { tenantId, role } = auth;
  try {
    // Incluye la papelera: si lo borraron justo después de mandarlo, igual salió.
    if (!(await DocumentsDB.puedeVer(tenantId, id, role, { incluirBorrados: true }))) {
      return NextResponse.json({ error: "not_found", message: "Ese papel ya no está en el Archivo." }, { status: 404 });
    }
    // Un envío = una línea: si el buzón reintenta (se cortó la respuesta), no se duplica.
    // La llave lleva QUIÉN lo pide, como en «Llegó por Telegram».
    const llave = `${auth.username}|${mensajeId}|${enviadoId}`;
    const previos = await DocumentsDB.listAudit(tenantId, id, 200, role);
    if (previos.some((l) => l.action === "share" && l.metadata?.llave === llave)) {
      return NextResponse.json({ ok: true, duplicado: true });
    }
    await DocumentsDB.logMany(
      tenantId,
      [id],
      {
        actorId: autorDeTelegram(mensajeId.split(":")[0]),
        action: "share",
        metadata: { canal: "telegram", llave, mensaje: mensajeId, enviado: enviadoId, pedidoPor: auth.username },
      },
      { estricto: true },
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    logger.error("[telegram/pedido] el historial del envío falló", { tenantId, error: String(err) });
    return NextResponse.json({ error: "server", message: "No pude anotarlo en el historial del papel." }, { status: 500 });
  }
}
