import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { esModoCajero, permisoEntregar, PREFIJO_CLAVE_CAJERO, VENTANA_FIRMA_CAJERO_MS } from "@/lib/adelantos/permisos";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { limaDateKey } from "@/lib/utils";
import { EntregarDatosSchema } from "@/lib/adelantos/entregar-schema";
import { TOPE_CAJERO_POR_DEFECTO, type CodigoErrorEntregar, type EntregarRespuesta, type ExistenteConClave, type ImagenGuardada } from "@/lib/adelantos/entregar-tipos";
import { imagenesDeFirma, jsonDe, leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { guardarEnRegistro, type ImagenAGuardar } from "@/lib/adelantos/guardar-en-registro.server";
import { AdelantosDB, IdempotenciaDistintaError, SinCajaError, TopeCajeroError } from "@/lib/db/adelantos.db";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { formatCurrency } from "@/lib/currency";

/**
 * POST /api/adelantos/entregar — entregar un adelanto en una pantalla (ADR-491):
 * persona + monto + firma (+ huella) en un multipart (`datos` JSON, `firma`
 * PNG, `huella` imagen opcional).
 *
 * Permiso: `adelantos-entregar:write` (admin, dueño, encargado, cajero). Quien
 * NO tiene `adelantos:write` (el cajero) entra en MODO CAJERO: plata DADA, en
 * cuenta corriente, con fecha de ahora, en soles, sin pasar el tope de crédito
 * ni el tope del cajero de Ajustes (leído acá, nunca del cuerpo), de la caja
 * abierta (sin caja → 409 y no queda nada) y con firma.
 *
 * Orden: imágenes a WebP ANTES de mover plata (422 sin escribir) → alta con
 * caja en una transacción → firma y huella al registro. Si la imagen no se
 * guarda, la plata ya salió: 201 con `firma.guardada: false` y la pantalla
 * ofrece «Reintentar firma» (`POST …/firmas` con `entregaKey`). La misma
 * `idempotencyKey` devuelve el mismo adelanto (200 `repetido`), sin mover la
 * caja, y completa la firma si había faltado.
 */
function error(status: number, code: CodigoErrorEntregar | null, mensaje: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: mensaje, message: mensaje, ...(code ? { code } : {}), ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-entregar"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoEntregar(auth.role);
  if (sinPermiso) return sinPermiso;

  const leido = await leerMultipartFirma(req, { archivos: ["firma", "huella"], textos: ["datos"] });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const parsed = EntregarDatosSchema.safeParse(jsonDe(leido.textos.datos));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const d = parsed.data;
  const modoCajero = esModoCajero(auth.role);
  const { firma: archivoFirma, huella: archivoHuella } = leido.archivos;

  let tope = TOPE_CAJERO_POR_DEFECTO;
  if (modoCajero) {
    try {
      tope = (await SettingsDB.get(auth.tenantId)).adelantoTopeCajero ?? TOPE_CAJERO_POR_DEFECTO;
    } catch (e) {
      logger.error("[adelantos/entregar] no se pudo leer el tope del cajero", { err: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "Database error" }, { status: 503 });
    }
    if (d.monto > tope) {
      return error(403, "supera_tope_cajero", tope > 0 ? `El cajero entrega hasta ${formatCurrency(tope)}. Para más, pídeselo al dueño.` : "En este negocio el cajero no entrega adelantos.", { tope });
    }
    if (!d.metodoCaja) return error(409, "sin_caja", "El adelanto sale de la caja abierta: elige cómo sale la plata.");
    if (!archivoFirma) return error(400, "firma_obligatoria", "Falta la firma de la persona que recibe la plata.");
  }
  if (archivoHuella && !d.consentimientoHuella) return error(400, "falta_consentimiento", "Para guardar la huella, la persona tiene que aceptar el aviso.");
  if (archivoFirma && !d.firmante) {
    return NextResponse.json({ error: "Datos inválidos", issues: ["Escribe el nombre y el DNI de quien firma."] }, { status: 400 });
  }

  /* Las imágenes, antes de tocar la plata. */
  const imgs = await imagenesDeFirma(leido.archivos);
  if ("error" in imgs) return error(imgs.status, imgs.code, imgs.error);

  const claveAlta = modoCajero ? `${PREFIJO_CLAVE_CAJERO}${d.idempotencyKey}` : d.idempotencyKey;
  let creado: Awaited<ReturnType<typeof AdelantosDB.create>>;
  try {
    creado = await AdelantosDB.create(auth.tenantId, {
      beneficiarioId: d.beneficiarioId,
      montoAdelantado: d.monto,
      moneda: modoCajero ? "PEN" : (d.moneda ?? "PEN"),
      direccion: "DADO",
      modalidad: "CUENTA_CORRIENTE",
      notas: d.notas,
      metodoCaja: d.metodoCaja,
      /* El cajero: su clave con prefijo (tope diario y puerta de «Reintentar
         firma»), sólo personas activas, y el tope sumando lo que ya dio hoy. */
      idempotencyKey: claveAlta,
      exigirCajaAbierta: modoCajero,
      soloActivas: modoCajero,
      ...(modoCajero ? { topeCajero: { tope, desde: new Date(`${limaDateKey()}T00:00:00-05:00`), prefijoClave: PREFIJO_CLAVE_CAJERO } } : {}),
    });
  } catch (e) {
    if (e instanceof SinCajaError) return error(409, "sin_caja", e.message);
    if (e instanceof TopeCajeroError) return error(403, "supera_tope_cajero", e.message, { tope: e.tope, queda: e.queda });
    if (e instanceof IdempotenciaDistintaError) {
      /* Lo que YA quedó con esa clave: la pantalla lo muestra en vez de dejar
         creer que no se guardó nada. */
      const existente: ExistenteConClave | null = await AdelantosDB.resumenPorClave(auth.tenantId, claveAlta).catch((err: unknown) => {
        logger.warn("[adelantos/entregar] no se pudo leer el adelanto de la clave", { error: String(err) });
        return null;
      });
      return error(422, "idempotencia_distinta", e.message, existente ? { existente } : undefined);
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("Supera el límite de crédito")) return error(400, "limite_credito", msg);
    if (msg.startsWith("Esa persona no existe")) return error(400, "persona_inexistente", msg);
    logger.error("[adelantos/entregar] alta error", { err: msg || String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }

  const persona = creado.beneficiario?.nombre ?? "—";
  /* Lo que ya quedó de este mismo intento (reintento): no se anota dos veces. */
  let firma: ImagenGuardada | null = null;
  let huella: ImagenGuardada | null = null;
  try {
    if (creado.repetido) {
      const ya = await AdelantoFirmasDB.porIdempotencia(auth.tenantId, creado.id, [`${d.idempotencyKey}:FIRMA`, `${d.idempotencyKey}:HUELLA`]);
      for (const f of ya) {
        const guardada: ImagenGuardada = { guardada: true, id: f.id, sha256: f.sha256 };
        if (f.tipo === "FIRMA") firma = guardada;
        else huella = guardada;
      }
    }
    let faltan: ImagenAGuardar[] = [];
    if (imgs.firma && !firma) faltan.push({ tipo: "FIRMA", webp: imgs.firma, trazos: d.trazos });
    if (imgs.huella && !huella) faltan.push({ tipo: "HUELLA", webp: imgs.huella, consentimiento: d.consentimientoHuella ?? null });
    /* Un reintento que completa la firma pasa por la MISMA regla que
       `POST …/firmas`: no sobre un anulado; el cajero sólo dentro de 2 h y sin
       vigente de ese tipo; reemplazar una vigente, sólo admin o dueño. */
    if (creado.repetido && faltan.length) {
      const vig = await AdelantoFirmasDB.vigentes(auth.tenantId, creado.id);
      const motivo = (tipo: "FIRMA" | "HUELLA"): string | null => {
        if (creado.status === "CANCELADO") return "Este adelanto está anulado: no se firma.";
        if (modoCajero && Date.now() - Date.parse(creado.createdAt) >= VENTANA_FIRMA_CAJERO_MS) return "Pasaron más de 2 horas: que lo firme el dueño o mande el enlace.";
        const vigente = tipo === "FIRMA" ? vig.firma : vig.huella;
        if (vigente && (modoCajero || soloAdminODueno(auth.role))) return "Este adelanto ya tiene esa firma; reemplazarla es del administrador o el dueño.";
        return null;
      };
      faltan = faltan.filter((img) => {
        const m = motivo(img.tipo);
        if (!m) return true;
        if (img.tipo === "FIRMA") firma = { guardada: false, motivo: m };
        else huella = { guardada: false, motivo: m };
        return false;
      });
    }
    if (faltan.length && d.firmante) {
      const r = await guardarEnRegistro(
        auth.tenantId,
        { id: creado.id, montoAdelantado: creado.montoAdelantado, moneda: creado.moneda, codigoOperacion: creado.codigoOperacion ?? null },
        faltan,
        { firmante: d.firmante, pedidoPor: auth.username, clave: d.idempotencyKey },
      );
      firma = r.firma ?? firma;
      huella = r.huella ?? huella;
    }
  } catch (e) {
    logger.error("[adelantos/entregar] registro de firmas error", { err: e instanceof Error ? e.message : String(e) });
    if (imgs.firma && !firma) firma = { guardada: false, motivo: "No se pudo guardar la firma. Prueba de nuevo." };
    if (imgs.huella && !huella) huella = { guardada: false, motivo: "No se pudo guardar la huella. Prueba de nuevo." };
  }

  if (!creado.repetido) {
    const conQue = [firma?.guardada ? "firma" : null, huella?.guardada ? "huella" : null].filter(Boolean).join(" y ");
    logActivity(
      "Entregar",
      "adelanto",
      `Adelanto ${creado.codigoOperacion ?? creado.id} de ${formatCurrency(creado.montoAdelantado)} entregado${conQue ? ` con ${conQue}` : " sin firma"}${modoCajero ? " (cajero)" : ""}`,
      creado.id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[adelantos/entregar] logActivity failed", { error: String(err) }));
  }

  /* La caja: la de este pedido; en un reintento, la que dejó el 1.º (si pidió
     caja y no hay movimiento, es que se guardó sin caja abierta). */
  let caja: EntregarRespuesta["caja"] = creado.caja ? (creado.caja.sinCaja ? { sinCaja: true } : { movimientoId: creado.caja.movimientoId ?? "" }) : null;
  if (creado.repetido && d.metodoCaja) {
    const mov = await AdelantosDB.movimientoDeCajaDelAlta(auth.tenantId, creado).catch((err: unknown) => {
      logger.warn("[adelantos/entregar] no se pudo leer el movimiento del alta", { error: String(err) });
      return undefined;
    });
    if (mov) caja = { movimientoId: mov.id };
    else if (mov === null) caja = { sinCaja: true };
  }

  /* Respuesta mínima: nada de la ficha (banco, CCI, dirección, documento). */
  const respuesta: EntregarRespuesta = {
    adelanto: {
      id: creado.id,
      codigoOperacion: creado.codigoOperacion ?? null,
      monto: creado.montoAdelantado,
      moneda: creado.moneda,
      persona,
      fechaAdelanto: creado.fechaAdelanto,
    },
    caja,
    firma,
    huella,
    ...(creado.repetido ? { repetido: true as const } : {}),
  };
  return NextResponse.json(respuesta, { status: creado.repetido ? 200 : 201 });
}
