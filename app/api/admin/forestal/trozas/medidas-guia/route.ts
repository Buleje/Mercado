import { NextRequest, NextResponse } from "next/server";
import { estadoGtf } from "@/lib/forestal/serfor-gtf-campos";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { MedidasGuiaDB } from "@/lib/db/forest-medidas-guia.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { esNumeroRegistroValido, normalizarNumeroRegistro, type GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { consultarGtfEnSerfor } from "@/lib/forestal/serfor-gtf-fetch";
import {
  numeroRegistroDesdeTexto,
  planearMedidasDesdeGuia,
  relacionDeGuias,
  relacionPermiteAplicar,
  type RespuestaMedidasGuia,
} from "@/lib/forestal/medidas-desde-guia";

/**
 * /api/admin/forestal/trozas/medidas-guia — «Traer D1/D2 de la guía»
 * (Brandon 05-10, ADR-469). Las reglas viven en `planearMedidasDesdeGuia`.
 *
 * GET `?gtf=A&gtf=B` → `{ guias: [{ gtfNumber, fichaGuardada, numeroRegistro }] }`:
 *   cuáles traen la ficha guardada (la planilla las muestra «automáticas»).
 *
 * POST `{ gtfNumber, numeroRegistro?, enlaceQr?, aplicar? }` → `RespuestaMedidasGuia`.
 *   · La ficha: la guardada en el ingreso (SIN red) o, si no hay —o se pide
 *     otro N° de registro—, SERFOR por el único punto de red
 *     (`consultarGtfEnSerfor`, el mismo de `gtf/serfor`, con su rate limit).
 *   · Sin ficha guardada ni número: `estado: "falta_registro"` (no sale a la red).
 *   · `aplicar: false` (default) = vista previa; `true` = escribe sólo sobre
 *     vacío y si la ficha es de ESTA guía (si no, 422).
 *
 * Roles: los de `PATCH /trozas/medidas` (anotar D1/D2 en planta): admin,
 * almacenero, owner. El dato lo pone SERFOR, no el que aprieta el botón.
 */

const ROLES = ["admin", "almacenero", "owner"] as const;

const schema = z.object({
  gtfNumber: z.string().trim().min(1).max(50),
  numeroRegistro: z.string().trim().max(40).optional(),
  enlaceQr: z.string().trim().max(600).optional(),
  aplicar: z.boolean().optional(),
});

async function guardias(req: NextRequest, mutacion: boolean) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:medidas-guia");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  if (mutacion) {
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
  }
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await guardias(req, false);
  if (auth instanceof Response) return auth;
  const gtfs = req.nextUrl.searchParams.getAll("gtf").map((g) => g.trim()).filter(Boolean);
  const parsed = z.array(z.string().max(50)).max(200).safeParse(gtfs);
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  try {
    return NextResponse.json({ guias: await MedidasGuiaDB.estadoDeGuias(auth.tenantId, parsed.data) });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.medidas-guia.GET", auth.tenantId);
  }
}

export async function POST(req: NextRequest) {
  const auth = await guardias(req, true);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const { gtfNumber, aplicar = false } = parsed.data;

  /* El N° de registro: tipeado o sacado del enlace del QR. */
  const texto = parsed.data.numeroRegistro || parsed.data.enlaceQr || "";
  const numero = texto ? numeroRegistroDesdeTexto(texto) : null;
  if (texto && !numero) {
    return NextResponse.json(
      { error: "enlace_sin_registro", message: "Ese enlace no trae el N° de registro de la guía (nuRegistroGuia)." },
      { status: 400 },
    );
  }
  if (numero && !esNumeroRegistroValido(numero)) {
    return NextResponse.json(
      { error: "numero_invalido", message: "El N° de registro va con sus guiones, como lo imprime la guía. Ejemplo: 1-19-0313629." },
      { status: 400 },
    );
  }

  try {
    const guia = await MedidasGuiaDB.leerGuia(auth.tenantId, gtfNumber);
    const base: RespuestaMedidasGuia = {
      estado: "falta_registro",
      gtfNumber: guia.gtfNumber,
      fuente: null,
      numeroRegistro: numero ?? guia.ficha?.numeroRegistro ?? null,
      guiaSerfor: null,
      relacionGuia: null,
      estadoSerfor: null,
      mensaje: null,
      trozasLibro: guia.trozas.length,
      trozasGuia: 0,
      plan: null,
    };

    /* La ficha: la guardada si es la misma (o no se pidió otra); si no, SERFOR. */
    let ficha: GtfSerfor | null = null;
    let fuente: RespuestaMedidasGuia["fuente"] = null;
    const mismaGuardada =
      guia.ficha && (!numero || normalizarNumeroRegistro(guia.ficha.numeroRegistro ?? "") === numero);
    if (guia.ficha && mismaGuardada) {
      ficha = guia.ficha.gtf;
      fuente = "guardada";
    } else if (numero) {
      /* Mismo presupuesto que `GET /gtf/serfor`: el servicio es de un tercero. */
      const rl = await applyRateLimit(req, "DRIVE_IA", "forestal:gtf-serfor");
      if (rl) return rl;
      const consulta = await consultarGtfEnSerfor(numero);
      if (!consulta.ok) return NextResponse.json({ ...base, estado: "sin_respuesta", mensaje: consulta.mensaje });
      if (consulta.resultado.estado !== "encontrada" || !consulta.resultado.gtf) {
        return NextResponse.json({
          ...base,
          estado: consulta.resultado.estado === "sin_respuesta" ? "sin_respuesta" : "no_encontrada",
          mensaje: consulta.resultado.mensaje ?? "SERFOR no encontró esa guía.",
        });
      }
      ficha = consulta.resultado.gtf;
      fuente = "serfor";
    } else {
      return NextResponse.json(base);
    }

    const relacion = relacionDeGuias(guia.gtfNumber, ficha.gtfNumber);
    const respuesta: RespuestaMedidasGuia = {
      ...base,
      estado: "lista",
      fuente,
      numeroRegistro: numero ?? guia.ficha?.numeroRegistro ?? ficha.numeroRegistro ?? null,
      guiaSerfor: ficha.gtfNumber,
      relacionGuia: relacion,
      estadoSerfor: ficha.estado,
      trozasGuia: ficha.trozas?.length ?? 0,
      plan: planearMedidasDesdeGuia(guia.trozas, ficha.trozas ?? []),
    };
    if (!aplicar) return NextResponse.json(respuesta);

    /* Revisión 05-10: una guía ANULADA en SERFOR no ampara la carga; sus medidas no entran al libro. */
    if (estadoGtf({ estado: ficha.estado ?? null }).anulada) {
      return NextResponse.json(
        { error: "guia_anulada", message: `SERFOR muestra la guía ${ficha.gtfNumber ?? guia.gtfNumber} como «${ficha.estado}»: no se toman sus medidas.` },
        { status: 422 },
      );
    }
    if (!relacionPermiteAplicar(relacion)) {
      return NextResponse.json(
        {
          error: "guia_distinta",
          message: `La ficha de SERFOR es de la guía ${ficha.gtfNumber ?? "(sin número)"}, no de la ${guia.gtfNumber}. Revisa el N° de registro.`,
        },
        { status: 422 },
      );
    }
    const r = await MedidasGuiaDB.aplicar(
      auth.tenantId,
      { gtfNumber: guia.gtfNumber, numeroRegistro: respuesta.numeroRegistro, ficha, guardarFicha: fuente === "serfor" },
      auth.username ?? "unknown",
    );
    return NextResponse.json({
      ...respuesta,
      plan: r.plan,
      aplicado: { escritas: r.escritas, omitidas: r.omitidas, fichaGuardadaEn: r.fichaGuardadaEn },
    } satisfies RespuestaMedidasGuia);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.medidas-guia.POST", auth.tenantId);
  }
}
