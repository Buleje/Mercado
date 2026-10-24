import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimitWithTenant, getClientIp } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { puedePasarT6ConMotivo } from "@/lib/forestal/loth-t6";
import { lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { pedidoImportarSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import { cobrarConsultasSerfor, resolverFuentes } from "@/lib/forestal/loth-importar-guia-fuentes";
import { consultasSerforDe } from "@/lib/forestal/loth-importar-guia-esquemas";
import { fechaIsoDeSerfor, ordenDeImportacion } from "@/lib/forestal/loth-importar-guia";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";
import { ForestLothImportarDirectorioDB } from "@/lib/db/forest-loth-importar-directorio.db";
import type { RespuestaImportar, ResultadoImportarGuia } from "@/lib/forestal/loth-importar-guia-tipos";

/**
 * POST /api/admin/forestal/loth/importar-guia — importa al Libro TH guías que
 * YA se despacharon (ADR-461). Cuerpo `{ items: [{ fuente, planDestino, crearTala }] }`
 * (`PedidoImportar`, hasta `IMPORTAR_GUIAS_POR_PEDIDO`).
 *
 * Cada guía en su propia transacción (`ForestLothImportarDB.importarGuia`): una
 * rechazada no tumba a las demás. Se importan por FECHA —el árbol que viene en
 * dos guías arma su tala con la primera y la amplía con la segunda— y la
 * respuesta sale en el orden pedido: `importada` / `ya_estaba` / `rechazada`
 * con su motivo.
 *
 * La ficha de una fuente `serfor` o `ctp` la lee el SERVIDOR (SNIFFS o el
 * ingreso del CTP); la de `ficha` (foto/PDF) queda anotada como no verificada.
 *
 * Guard: requireAdmin → sólo admin o dueño (un encargado no crea permisos ni
 * asienta guías ajenas) → rate limit por IP y por NEGOCIO → spec:forestal:loth-libro
 * → cada N° de registro cobrado al límite de la consulta suelta a SERFOR.
 *
 * T9 (04-10): si la guía deja una especie sobre lo AUTORIZADO, el ítem trae
 * `motivoSobreCupo` (lo pide la vista previa); sin él la guía vuelve
 * `rechazada` con `T9_CUPO_ESPECIE`. Con él, la tala se escribe con su nota y
 * el evento `loth_tala_sobre_cupo`, en la misma transacción.
 *
 * T6 (ADR-468): una guía que SERFOR ya emitió y despacha más de lo AUTORIZADO
 * entra con el MISMO `motivoSobreCupo` sólo si la ficha la resolvió el servidor
 * (`verificada` de `resolverFuentes`: SNIFFS o ficha guardada en el CTP; nunca
 * del cuerpo) y el rol es admin o dueño (`puedePasarT6ConMotivo`, del JWT).
 * Además: el ítem trae `confirmaDespacho` (la vista mostró el exceso), el
 * título de la guía es el del permiso elegido y las trozas que ya estaban en
 * el Trozado miden lo que dice la guía (`porQueNoAplicaExcepcionT6`). Queda
 * `loth_despacho_sobre_autorizado` (con IP y navegador) en su transacción.
 * Si falta algo: `T6_EXCESO_AUTORIZADO` como siempre, con el porqué.
 *
 * Directorio (02-10 noche): si el ítem trae `directorio` (qué agregar o
 * completar) y la guía ENTRÓ, después de su transacción se guardan las partes,
 * el vehículo y el permiso marcados (`ForestLothImportarDirectorioDB.guardar`).
 * Fuera de la transacción a propósito: una ficha que no se pudo guardar no
 * deshace la guía; cada una vuelve con su resultado en `directorio`.
 *
 * Una importación por negocio a la vez (`tomarTurnoDeImportacion`): si otra está
 * en curso y ninguna guía de este pedido pudo entrar, 409 `importacion_en_curso`.
 *
 * `maxDuration` 300 s (también en `vercel.json`, que manda sobre `app/api/**`):
 * hasta 10 guías en serie, cada una su transacción.
 */
/**
 * T9: pasar lo AUTORIZADO de una especie lo firma el titular — admin o dueño,
 * como en el alta (`/api/admin/forestal/loth`). Sale del JWT, nunca del cuerpo
 * (el schema ni acepta el campo). Hoy la ruta entera ya es de esos dos roles;
 * se decide igual acá para que abrirla a otro rol no abra también el cupo.
 */
const PUEDEN_EXCEDER_CUPO: readonly string[] = ["admin", "owner"];

export const maxDuration = 300;
export const POST = withApiHandler("forestal-loth-importar-guia-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "importar guías al Libro TH");
  if (prohibido) return prohibido;
  /* La pantalla manda UNA guía por pedido: 60 cada 15 min por IP, 150 por hora por negocio. */
  const rl = applyRateLimitWithTenant(req, "DRIVE_BULK", auth.tenantId, "loth-importar-guia", { maxReqs: 150, windowSec: 60 * 60 });
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro de Títulos Habilitantes no está habilitado para este negocio." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El pedido no es un JSON válido." }, { status: 400 });
  }
  const parsed = pedidoImportarSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);

  const items = parsed.data.items;
  const cobro = cobrarConsultasSerfor(req, consultasSerforDe(items.map((x) => x.fuente)));
  if (cobro) return cobro;
  const user = auth.username ?? "unknown";
  /* IP y navegador para los eventos sobre-cupo y sobre-autorizado (OSINFOR). */
  const sesion = { ipAddress: getClientIp(req), userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null };
  /* Primero las fichas (la red de SERFOR, fuera de toda transacción, de a 3 a
     la vez), después las guías por fecha, una transacción cada una. */
  const resueltas = await resolverFuentes(auth.tenantId, items.map((x) => x.fuente));
  const orden = ordenDeImportacion(
    resueltas,
    (x) => (x.ficha ? fechaIsoDeSerfor(x.ficha.fechaExpedicion) : null),
    (x) => x.ficha?.gtfNumber ?? null,
  );

  const resultados: ResultadoImportarGuia[] = new Array(items.length);
  let intentadas = 0;
  for (const i of orden) {
    const x = resueltas[i];
    const vacio = { codigo: null, gtfId: null, gtfNumber: null, planId: null, planCreado: false, lineas: null, volumenM3: null };
    if (!x.ficha || x.falla) {
      resultados[i] = { clave: x.clave, estado: "rechazada", mensaje: x.falla?.mensaje ?? "No hay ficha de la guía.", ...vacio, codigo: x.falla?.estado ?? "no_encontrada" };
      continue;
    }
    try {
      const r = await ForestLothImportarDB.importarGuia(auth.tenantId, {
        ficha: x.ficha,
        verificada: x.verificada,
        planDestino: items[i].planDestino,
        crearTala: items[i].crearTala,
        createdBy: user,
        /* T9: el motivo viene de la pantalla; QUIÉN puede pasar lo autorizado, de la sesión. */
        motivoSobreCupo: items[i].motivoSobreCupo ?? null,
        puedeExcederCupo: PUEDEN_EXCEDER_CUPO.includes(auth.role),
        /* T6 (ADR-468): la verificación es la del servidor (`x.verificada`), el rol de la sesión. */
        puedeExcederDespacho: puedePasarT6ConMotivo(auth.role),
        /* …y la persona vio el exceso en la vista previa (consentimiento, no permiso). */
        confirmaDespacho: items[i].confirmaDespacho === true,
        /* ADR-474: los renombres que la persona confirmó; el servidor revisa de nuevo cuáles hay. */
        confirmaRenombres: items[i].confirmaRenombres ?? [],
        sesion,
        /* La 1.ª no espera (otra importación en curso → rechazo); las que siguen esperan su turno. */
        esperarTurno: intentadas++ > 0,
      });
      resultados[i] = { clave: x.clave, ...r };
    } catch (err) {
      logger.error("[loth-importar-guia.POST] guía falló", {
        error: String(err),
        tenantId: auth.tenantId,
        gtfNumber: x.ficha.gtfNumber,
        numeroRegistro: x.ficha.numeroRegistro,
      });
      resultados[i] = {
        clave: x.clave,
        estado: "rechazada",
        mensaje: "No se pudo anotar esta guía por un error del servidor. No quedó nada a medias: vuelve a intentarlo.",
        ...vacio,
        codigo: "error_interno",
        gtfNumber: x.ficha.gtfNumber,
      };
    }
    /* La guía ya quedó (o no entró): lo del directorio va aparte y nunca la deshace. */
    const pedido = items[i].directorio;
    const hecho = resultados[i];
    if (hecho.estado === "importada" && pedido && (pedido.partes.length > 0 || pedido.vehiculo || pedido.permiso)) {
      try {
        hecho.directorio = await ForestLothImportarDirectorioDB.guardar(auth.tenantId, {
          ficha: x.ficha,
          pedido,
          planId: hecho.planId,
          planCreado: hecho.planCreado === true,
          verificada: x.verificada === true,
          gtfNumber: hecho.gtfNumber ?? x.ficha.gtfNumber ?? "",
          registro: x.ficha.numeroRegistro ?? "",
          createdBy: user,
        });
      } catch (err) {
        logger.error("[loth-importar-guia.POST] directorio falló", { error: String(err), tenantId: auth.tenantId, gtfNumber: hecho.gtfNumber });
      }
    }
  }

  /* Nada entró porque otra importación del negocio tenía el turno: 409, no un 200 con todo rechazado. */
  if (resultados.length > 0 && resultados.every((r) => r.codigo === "importacion_en_curso")) {
    return NextResponse.json({ error: "importacion_en_curso", message: resultados[0].mensaje }, { status: 409 });
  }

  const respuesta: RespuestaImportar = {
    resultados,
    importadas: resultados.filter((r) => r.estado === "importada").length,
    yaEstaban: resultados.filter((r) => r.estado === "ya_estaba").length,
    rechazadas: resultados.filter((r) => r.estado === "rechazada").length,
  };
  return NextResponse.json(respuesta, { status: respuesta.importadas > 0 ? 201 : 200 });
});
