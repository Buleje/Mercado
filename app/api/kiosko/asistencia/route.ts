import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { limaDateKey } from "@/lib/utils";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { KioskoAsistenciaDB } from "@/lib/db/rrhh-kiosko.db";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { guardarFotoAsistencia } from "@/lib/rrhh/asistencia-fotos.server";
import { revisarMarca } from "@/lib/rrhh/asistencia";
import { fechaKeyDeDate } from "@/lib/rrhh/fechas";
import { secretoCoincide } from "@/lib/rrhh/kiosko-token.server";
import {
  MARCADO_POR_KIOSKO,
  codigoDeMarcacion,
  decidirMarcaKiosko,
  kioskoMarcarSchema,
  partirToken,
  primerNombre,
  puedeMarcarEnKiosko,
  revisarEnlace,
  type RespuestaKiosko,
} from "@/lib/rrhh/kiosko";
import { COOKIE_APARATO_KIOSKO, MENSAJE_OTRO_APARATO, estadoAparato, faltaFoto } from "@/lib/rrhh/kiosko-aparato";

/**
 * POST /api/kiosko/asistencia — la marca del propio trabajador desde la
 * tablet del local (`lib/rrhh/kiosko.ts`). PÚBLICA: no hay sesión; manda el
 * token del enlace del kiosko Y la cookie de la tablet atada
 * (`lib/rrhh/kiosko-aparato.ts`): el enlace solo, abierto en un celular, no
 * marca. Multipart: `token`, `codigo` (lo que leyó la cámara del QR del
 * fotocheck, o el DNI tipeado), `tipo` ENTRADA|SALIDA y `file` (la foto del
 * momento: obligatoria salvo que el dueño permita marcar sin foto).
 *
 * Lo único que devuelve del trabajador: su primer nombre y la hora marcada.
 * Cada marca deja la IP en la actividad del negocio.
 * 200 marcada (o repetida <2 min) · 400 datos · 401 enlace inválido/vencido ·
 * 403 kiosko apagado, otra tablet o ficha no activa · 404 código de nadie de
 * este negocio · 409 ya tenía entrada / salida antes de la entrada · 413 · 415 ·
 * 422 código/foto · 429.
 */
const MAX_SIZE = 3 * 1024 * 1024;
const ANCHO_MAX = 960;

/* Por IP y compartido entre instancias (Redis): la cola de la mañana (30 personas en un par de
   minutos) entra holgada. Probar DNIs exige además la tablet atada (cookie del aparato). */
const marcasDelKiosko = createDistributedRateLimiter({ key: "kiosko:asistencia", maxRequests: 40, windowMs: 60_000 });

const falla = (status: number, error: string, message: string, extra: { nombre?: string; hora?: string | null } = {}) =>
  NextResponse.json({ ok: false, error, message, ...extra } satisfies RespuestaKiosko, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const MENSAJE_ENLACE = "Este enlace del kiosko ya no sirve. Pídele al encargado uno nuevo.";

export const POST = withApiHandler("kiosko-asistencia", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const ip = getClientIp(req);
  if (!(await marcasDelKiosko.check(ip))) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Muchas marcas seguidas: espera un minuto." } satisfies RespuestaKiosko,
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(Math.ceil(marcasDelKiosko.windowMs / 1000)) } },
    );
  }

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_SIZE + 64 * 1024) return falla(413, "muy_grande", "La foto pesa demasiado.");

  let archivo: File | null = null;
  let campos: Record<string, unknown> = {};
  try {
    const form = await req.formData();
    const f = form.get("file");
    archivo = f instanceof File && f.size > 0 ? f : null;
    campos = { token: form.get("token"), codigo: form.get("codigo"), tipo: form.get("tipo") };
  } catch {
    return falla(400, "datos_invalidos", "No llegaron los datos de la marca.");
  }
  const body = kioskoMarcarSchema.safeParse(campos);
  if (!body.success) return falla(400, "datos_invalidos", "No llegaron los datos de la marca.");
  if (archivo && archivo.size > MAX_SIZE) return falla(413, "muy_grande", "La foto pesa demasiado.");

  // 1. El enlace: negocio + secreto (por hash) + vigente + bandera encendida.
  const ahora = new Date();
  const partes = partirToken(body.data.token);
  if (!partes) return falla(401, "enlace_invalido", MENSAJE_ENLACE);
  const tenantId = partes.tenantId;
  const config = await KioskoAsistenciaDB.config(tenantId);
  const enlace = revisarEnlace(config, secretoCoincide(partes.secreto, config.tokenHash), ahora);
  if (!enlace.ok) {
    if (enlace.motivo === "apagado") return falla(403, "apagado", "La marcación en el kiosko está apagada.");
    if (enlace.motivo === "vencido") return falla(401, "vencido", "El enlace del kiosko venció. Pídele al encargado uno nuevo.");
    return falla(401, "enlace_invalido", MENSAJE_ENLACE);
  }
  // 1b. La tablet atada: sin su cookie, el enlace no marca (antes de buscar a nadie).
  const aparato = estadoAparato(config, secretoCoincide(req.cookies.get(COOKIE_APARATO_KIOSKO)?.value ?? "", config.aparatoHash));
  if (aparato === "libre") return falla(403, "sin_tablet", "Esta tablet todavía no está atada al kiosko: recarga la página.");
  if (aparato === "otro") return falla(403, "otro_aparato", MENSAJE_OTRO_APARATO);
  // 1c. La foto es la única evidencia de quién marcó: sin ella no hay marca, salvo permiso del dueño.
  if (faltaFoto(config, archivo != null)) {
    return falla(422, "foto_requerida", "Falta la foto: mira a la cámara e intenta de nuevo. Si la cámara no anda, avísale al encargado.");
  }

  // 2. La persona: SIEMPRE de este negocio (tenantId del enlace en el WHERE).
  const codigo = codigoDeMarcacion(body.data.codigo);
  if (!codigo) return falla(422, "codigo_invalido", "No reconocí ese código. Muestra el QR de tu fotocheck o escribe tu DNI.");
  const persona = await KioskoAsistenciaDB.colaborador(tenantId, codigo);
  if (!persona) return falla(404, "no_encontrado", "No encontré a nadie con ese código en este negocio.");
  const nombre = primerNombre(persona.nombre);
  if (!puedeMarcarEnKiosko(persona.estado)) {
    return falla(403, "no_activo", "Hoy tu ficha no está activa: avísale al encargado.", { nombre });
  }

  // 3. La foto se revisa ANTES de escribir: una imagen inválida no deja marca.
  let imagen: Buffer | null = null;
  if (archivo) {
    try {
      const bytes = Buffer.from(await archivo.arrayBuffer());
      await verificarImagen(bytes, new Set(["jpeg", "png", "webp"]));
      imagen = await sharpSeguro(bytes).rotate().resize({ width: ANCHO_MAX, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    } catch (err) {
      if (err instanceof ImagenNoPermitida) return falla(415, "imagen_no_permitida", "La foto no se pudo leer. Intenta de nuevo.");
      throw err;
    }
  }

  // 4. Decidir sobre la marca viva del día (hora de Lima del servidor).
  const hoy = limaDateKey(ahora);
  const viva = await KioskoAsistenciaDB.vivaDelDia(tenantId, persona.id, hoy);
  const decision = decidirMarcaKiosko({ tipo: body.data.tipo, viva, ahora, horario: persona.horario });
  if (decision.accion === "ignorar") {
    return NextResponse.json(
      { ok: true, nombre, tipo: decision.tipo, hora: decision.hora, repetida: true } satisfies RespuestaKiosko,
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (decision.accion === "rechazar") {
    return falla(409, decision.motivo, decision.message, { nombre, hora: decision.hora });
  }

  const nota = imagen ? decision.marca.nota : [decision.marca.nota, "Sin foto en el kiosko"].filter(Boolean).join(" · ");
  const revision = revisarMarca(
    { colaboradorId: persona.id, fecha: hoy, ...decision.marca, nota },
    {
      colaborador: {
        fechaIngreso: persona.fechaIngreso ? fechaKeyDeDate(persona.fechaIngreso) : null,
        fechaCese: persona.fechaCese ? fechaKeyDeDate(persona.fechaCese) : null,
        eliminado: false,
      },
      hoy,
      ventana: { desde: hoy, hasta: hoy },
      marcadoPor: MARCADO_POR_KIOSKO,
      origen: "kiosko",
    },
  );
  if (!revision.ok) return falla(422, revision.motivo, `${revision.message} Avísale al encargado.`, { nombre });

  await AsistenciaDB.guardar(tenantId, [revision.marca], {
    usuario: MARCADO_POR_KIOSKO,
    origen: "kiosko",
    motivo: decision.motivo,
  });
  logActivity(
    "rrhh_kiosko_marca",
    "Asistencia",
    `${persona.nombre}: ${body.data.tipo === "ENTRADA" ? "entrada" : "salida"} ${decision.hora} en el kiosko${imagen ? "" : " (sin foto)"} · IP ${ip}`,
    persona.id,
    MARCADO_POR_KIOSKO,
    undefined,
    tenantId,
  ).catch((err) => logger.warn("[kiosko-asistencia] no se registró la actividad", { tenantId, error: String(err) }));

  // 5. La foto es la evidencia (una foto del QR de otro deja la cara de quien marcó).
  if (imagen) {
    const foto = await guardarFotoAsistencia(tenantId, {
      colaborador: { id: persona.id, nombre: persona.nombre },
      fecha: hoy,
      camara: { id: "kiosko", nombre: body.data.tipo === "ENTRADA" ? "Kiosko entrada" : "Kiosko salida" },
      imagen,
      marcadoPor: MARCADO_POR_KIOSKO,
      cuando: ahora,
    });
    if (!foto.ok) logger.warn("[kiosko-asistencia] la marca quedó sin foto", { tenantId, error: foto.error });
  }

  return NextResponse.json(
    { ok: true, nombre, tipo: body.data.tipo, hora: decision.hora, repetida: false } satisfies RespuestaKiosko,
    { headers: { "Cache-Control": "no-store" } },
  );
});
