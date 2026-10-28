import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestDistribucionesDB } from "@/lib/db/forest-distribuciones.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestLotePropuestaDB } from "@/lib/db/forest-lote-propuesta.db";
import { ForestJornadaBloqueDB } from "@/lib/db/forest-jornada-bloque.db";
import { ForestAnexosDB } from "@/lib/db/forest-anexos.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import { aprovechableDe, esAserradaDirecta, type BloqueRolliza, type DiaDistribuido, type JornadaEnLibro } from "@/lib/forestal/cubicacion-reparto";
import { trozasDelBloque } from "@/lib/forestal/trozas-para-bloque";
import { planLibroDeBloque, type LoteParaLibro } from "@/lib/forestal/jornadas-de-bloque";
import { paquetesDeGrupos } from "@/lib/forestal/paquetes-de-jornada";
import { anexosDelBloque, derivarRecorrido, faltanDiasListos, jornadasHuerfanas, SIN_ASERRADA, tomadosPorOtros, type LoteDelRecorrido } from "@/lib/forestal/recorrido-estado";
import {
  RecorridoEjecutarBody,
  RecorridoQuery,
  siguientePaso,
  type EstadoRecorrido,
  type PasoDelRecorrido,
  type PasoRecorrido,
} from "@/lib/forestal/recorrido-permiso";

/**
 * /api/admin/forestal/distribuciones/recorrido — el Recorrido del permiso de
 * UN bloque (ADR-519, fase 2).
 *
 * GET: el estado de cada paso, DERIVADO del Libro en cada lectura (nada se
 * guarda aparte): trozas por `elegiblesDe` (T1, recepción), lote por
 * `loteId`, jornadas por las corridas vivas del bloque, anexo y salida por lo
 * guardado del permiso. Ver `lib/forestal/recorrido-estado.ts`.
 *
 * POST: ejecuta los pasos que el servidor sabe hacer (lote, jornadas) desde
 * `siguiente` hasta `hasta`. Cada escritura es su propia transacción: si una
 * falla, las anteriores quedan y el paso vuelve como `con_problema` con su
 * `code` y el motivo en castellano. Cada jornada se escribe en el Libro Y se
 * anota en el bloque en la MISMA transacción (`registrarJornada` con
 * `anotarEn` → `ForestDistribucionesDB.escribirEnBloque`): un pedido cortado
 * no deja un día en el Libro que el bloque no sabe.
 *
 * Antes de cualquier paso, ADOPTA lo huérfano que dejó un pedido cortado (o
 * una versión anterior): el lote vivo armado con las trozas del bloque y las
 * corridas declaradas del lote con la fecha de un día y piezas del bloque.
 *
 * ADR-521: el bloque de un lote YA consumido trae su corrida abierta como
 * jornada «abierta». El paso de jornadas le DECLARA la producción con lo
 * aserrado del día (`declararJornadaAbierta`: no abre corrida ni consume),
 * con la misma anotación en la misma transacción.
 *
 * Guard: requireAdmin → CSRF (POST) → rate limit (balde propio) → spec:forestal:herramientas.
 */

/**
 * Pasado esto no se abre otra jornada y la respuesta dice `continuar: true`.
 * Las rutas de la API cortan a 30 s y una jornada puede tardar hasta el tope
 * de su transacción (20 s): abrir la siguiente a los 10 s deja margen para
 * que termine y responda.
 */
const PRESUPUESTO_MS = 10_000;
/** Registrar una jornada declara producción: lo hace la gerencia (igual que `registrar-jornada`). */
const ROLES_QUE_DECLARAN = ["admin", "owner", "manager"];

type Auth = { tenantId: string; role: string; username?: string | null };

async function guardComun(req: NextRequest, balde: "GENEROUS" | "MODERATE", prefijo: string, csrf: boolean) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return { error: auth };
  if (csrf) {
    const c = assertCsrf(req);
    if (c) return { error: c };
  }
  const rl = await applyRateLimit(req, balde, prefijo);
  if (rl) return { error: rl };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:herramientas"))) {
    return {
      error: NextResponse.json(
        { error: "specialization_disabled", message: "Las Herramientas Forestales no están habilitadas para esta tienda." },
        { status: 403 },
      ),
    };
  }
  return { auth: auth as Auth };
}

/** El lote como lo leen el estado y el plan de jornadas (la misma lectura que la pantalla). */
async function leerLote(tenantId: string, loteId: string | null | undefined) {
  if (!loteId) return undefined;
  const [lote] = await ForestLoteAserrioDB.list(tenantId, { ids: [loteId], limite: 1 });
  return lote ?? null;
}

/** Todo lo que el estado necesita, leído del Libro. `null` = la distribución o el bloque no están. */
async function leer(tenantId: string, distribucionId: string, bloqueId: string, usadoM3?: number, porDia?: readonly DiaDistribuido[]) {
  const distribucion = (await ForestDistribucionesDB.list(tenantId)).find((d) => d.id === distribucionId);
  const bloque = distribucion?.bloques.find((b) => b.id === bloqueId);
  if (!distribucion || !bloque) return null;
  const ids = trozasDelBloque(bloque);
  const hoy = hoyEnLima();
  const [leidas, lote, anexos, salidasPendientes] = await Promise.all([
    ids.length
      ? ForestLoteAserrioDB.elegiblesDe(tenantId, ids, { loteId: bloque.loteId, especie: bloque.especie, permiso: bloque.permiso })
      : Promise.resolve({ trozas: [], noEncontradas: [] as string[] }),
    leerLote(tenantId, bloque.loteId),
    ForestAnexosDB.list(tenantId),
    ForestAnexosDB.salidasPorRegistrar(tenantId, hoy),
  ]);
  const trozas = leidas.trozas.map((t) => ({
    id: t.id,
    codigo: t.codigo,
    volumenM3: Number(t.volumenM3) || 0,
    permiso: t.permiso,
    porRecepcionar: Boolean(t.porRecepcionar),
    consumidaEnId: t.consumidaEnId ?? null,
    motivo: t.motivo ?? null,
  }));
  /* El permiso sale de la derivación (el del bloque o el único de sus trozas);
     con él se sabe qué anexos son del recorrido y qué despachos leer. */
  const loteDelRecorrido: LoteDelRecorrido | null | undefined = lote
    ? {
        id: lote.id,
        code: lote.code,
        status: lote.status,
        trozas: lote.trozas.map((t) => ({ id: t.id, consumidaEnId: t.consumidaEnId ?? null })),
        corridas: (lote.corridas ?? []).map((c) => ({
          id: c.id,
          lineNo: c.lineNo,
          viva: c.viva,
          quantity: c.quantity == null ? null : Number(c.quantity),
          volumeInputM3: c.volumeInputM3 == null ? null : Number(c.volumeInputM3),
          unit: c.unit,
        })),
      }
    : lote;
  const datos = {
    distribucionId,
    bloque,
    usadoM3,
    trozas,
    noEncontradas: leidas.noEncontradas,
    lote: loteDelRecorrido,
    anexos,
    despachos: [] as { id: string; gtfNumber: string | null; status: string; entryDate: Date }[],
    hoy,
    salidasPendientes,
    /* Con los días de la pantalla (POST), el paso dice por qué no queda ninguno listo. */
    sinDiasListos: porDia && lote ? faltanDiasListos(planDe(bloque, porDia, lote)) : null,
  };
  const sinSalidas = derivarRecorrido(datos);
  const despachoIds = [...new Set(anexosDelBloque(anexos, sinSalidas.permiso, bloque).flatMap((a) => a.despachoIds ?? []))];
  datos.despachos = despachoIds.length ? await ForestCtpDB.despachosConGuiaPorIds(tenantId, despachoIds) : [];
  return { distribucion, bloque, lote, estado: despachoIds.length ? derivarRecorrido(datos) : sinSalidas };
}

/** El plan del Libro del bloque con los días de la pantalla (el mismo de «Registrar día»). */
function planDe(bloque: BloqueRolliza, porDia: readonly DiaDistribuido[], lote: unknown) {
  return planLibroDeBloque({ bloque, porDia: [...porDia], aprovechablePct: aprovechableDe(bloque) }, (lote ?? null) as LoteParaLibro | null, hoyEnLima());
}

/** Suma días al bloque: `corridaIds` sin repetir y un registro por día (el último manda). */
function anotarJornadas(prev: BloqueRolliza, nuevas: readonly JornadaEnLibro[]): Partial<BloqueRolliza> {
  const dias = new Set(nuevas.map((n) => n.dia));
  return {
    corridaIds: [...new Set([...(prev.corridaIds ?? []), ...nuevas.map((n) => n.corridaId)])],
    jornadasLibro: [...(prev.jornadasLibro ?? []).filter((x) => !dias.has(x.dia)), ...nuevas],
  };
}

const noEncontrado = () =>
  NextResponse.json({ error: "bloque_no_encontrado", message: "La distribución o el bloque ya no están guardados." }, { status: 404 });

export const GET = withApiHandler("forestal-recorrido-permiso", async (req: NextRequest) => {
  const g = await guardComun(req, "GENEROUS", "distribuciones-recorrido", false);
  if (g.error) return g.error;
  const parsed = RecorridoQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const q = parsed.data;
  try {
    const leido = await leer(g.auth.tenantId, q.distribucionId, q.bloqueId, q.usadoM3);
    if (!leido) return noEncontrado();
    return NextResponse.json({ estado: leido.estado });
  } catch (err) {
    logger.error("[forestal.recorrido.GET] no se pudo leer el recorrido", { tenantId: g.auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "server_error", message: "No se pudo leer el recorrido." }, { status: 500 });
  }
});

/** Un paso que falló al ejecutarse: lo que se le cuenta a la pantalla. */
type Falla = { paso: PasoRecorrido; code: string; motivo: string };

const fallaDe = (paso: PasoRecorrido, err: unknown, ctx: Record<string, unknown>): Falla => {
  if (err instanceof CtpInvariantError) return { paso, code: err.code, motivo: err.message };
  logger.error(`[forestal.recorrido.POST] el paso «${paso}» falló`, { ...ctx, error: String(err) });
  return { paso, code: "ERROR", motivo: "No se pudo completar el paso. Lo anterior quedó guardado: vuelve a intentarlo." };
};

/** Pinta la falla sobre el estado releído: lo escrito antes se ve hecho; el paso que falló, con su motivo. */
function conFalla(estado: EstadoRecorrido, falla: Falla | null): EstadoRecorrido {
  if (!falla) return estado;
  const pasos: PasoDelRecorrido[] = estado.pasos.map((p) =>
    p.paso === falla.paso && p.estado !== "hecho" ? { ...p, estado: "con_problema", code: falla.code, motivo: falla.motivo } : p,
  );
  return { ...estado, pasos, siguiente: siguientePaso(pasos) };
}

export const POST = withApiHandler("forestal-recorrido-permiso-ejecutar", async (req: NextRequest) => {
  const g = await guardComun(req, "MODERATE", "distribuciones-recorrido-ejecutar", true);
  if (g.error) return g.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = RecorridoEjecutarBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const { distribucionId, bloqueId, hasta = "jornadas", usadoM3 } = parsed.data;
  const porDia = parsed.data.porDia as DiaDistribuido[] | undefined;
  const { tenantId, role } = g.auth;
  const user = g.auth.username ?? "unknown";
  const inicio = Date.now();
  const ejecutados: { paso: PasoRecorrido; detalle: string }[] = [];
  let falla: Falla | null = null;
  /* Quedan días por registrar y se acabó el tiempo: la pantalla vuelve a pedir. */
  let continuar = false;

  try {
    let leido = await leer(tenantId, distribucionId, bloqueId, usadoM3, porDia);
    if (!leido) return noEncontrado();

    /* Lo que ya anotó OTRO bloque, en todas las distribuciones del negocio
       (2.ª revisión): eso no se adopta nunca, y se dice de quién es. */
    const tomados = tomadosPorOtros(await ForestDistribucionesDB.list(tenantId), distribucionId, bloqueId);

    /* ── Adoptar el lote huérfano: se creó y el pedido se cortó antes de anotarlo. ── */
    if (!leido.bloque.loteId && !esAserradaDirecta(leido.bloque)) {
      const huerfano = await ForestLoteAserrioDB.loteVivoDeTrozas(tenantId, trozasDelBloque(leido.bloque));
      const deOtro = huerfano ? tomados.lotes.get(huerfano.id) : undefined;
      if (huerfano && deOtro) {
        falla = {
          paso: "lote",
          code: "LOTE_DE_OTRO_BLOQUE",
          motivo: `Estas trozas ya están en el lote ${huerfano.code}, que es del ${deOtro}: no se adopta para no amparar la misma producción dos veces.`,
        };
      } else if (huerfano) {
        await ForestDistribucionesDB.anotarBloque(tenantId, distribucionId, bloqueId, () => ({ loteId: huerfano.id }), user);
        ejecutados.push({ paso: "lote", detalle: `Lote ${huerfano.code} (ya estaba creado)` });
        auditCtp({
          tenantId,
          action: "ctp_recorrido_paso",
          entity: "ForestDistribucion",
          entityId: distribucionId,
          detail: `Recorrido del permiso · bloque ${leido.bloque.etiqueta}: adoptó el lote ${huerfano.code} (creado por un pedido que se cortó)`,
          user,
        });
        leido = (await leer(tenantId, distribucionId, bloqueId, usadoM3, porDia)) ?? leido;
      }
    }

    /* ── Adoptar las jornadas huérfanas: ya están en el Libro y el bloque no lo sabe. ── */
    if (!falla && porDia && porDia.length > 0 && leido.lote) {
      const dias = porDia.map((d) => d.dia);
      const huerfanas = jornadasHuerfanas(leido.bloque, dias, leido.lote, hoyEnLima(), new Set(tomados.corridas.keys()));
      const deOtro = jornadasHuerfanas(leido.bloque, dias, leido.lote, hoyEnLima()).find((j) => tomados.corridas.has(j.corridaId));
      if (deOtro) {
        falla = {
          paso: "jornadas",
          code: "CORRIDA_DE_OTRO_BLOQUE",
          motivo: `La corrida N° ${deOtro.lineNo} del día ${deOtro.dia} ya es del ${tomados.corridas.get(deOtro.corridaId)}: no se adopta dos veces.`,
        };
      }
      if (huerfanas.length > 0) {
        await ForestDistribucionesDB.anotarBloque(tenantId, distribucionId, bloqueId, (prev) => anotarJornadas(prev, huerfanas), user);
        for (const h of huerfanas) ejecutados.push({ paso: "jornadas", detalle: `Día ${h.dia} · corrida N° ${h.lineNo} (ya estaba en el Libro)` });
        auditCtp({
          tenantId,
          action: "ctp_recorrido_paso",
          entity: "ForestDistribucion",
          entityId: distribucionId,
          detail: `Recorrido del permiso · bloque ${leido.bloque.etiqueta}: adoptó ${huerfanas.map((h) => `el día ${h.dia} (corrida N° ${h.lineNo})`).join(", ")}`,
          user,
        });
        leido = (await leer(tenantId, distribucionId, bloqueId, usadoM3, porDia)) ?? leido;
      }
    }

    /* ── Lote: el del bloque, con sus trozas elegidas. ── */
    if (!falla && leido.estado.siguiente === "lote") {
      const b = leido.bloque;
      try {
        const r = await ForestLotePropuestaDB.crearPorBloques(
          tenantId,
          [{ bloqueId, etiqueta: b.etiqueta, trozaIds: trozasDelBloque(b) }],
          user,
        );
        const creado = r.creados[0];
        if (!creado) {
          falla = { paso: "lote", code: "LOTE_NO_CREADO", motivo: r.noCreados[0]?.motivo ?? "No se pudo crear el lote del bloque." };
        } else {
          await ForestDistribucionesDB.anotarBloque(tenantId, distribucionId, bloqueId, () => ({ loteId: creado.loteId }), user);
          ejecutados.push({ paso: "lote", detalle: `Lote ${creado.code}` });
          auditCtp({
            tenantId,
            action: "ctp_recorrido_paso",
            entity: "ForestDistribucion",
            entityId: distribucionId,
            detail: `Recorrido del permiso · bloque ${b.etiqueta}: creó el lote ${creado.code}`,
            user,
          });
        }
      } catch (err) {
        falla = fallaDe("lote", err, { tenantId, distribucionId, bloqueId });
      }
      leido = (await leer(tenantId, distribucionId, bloqueId, usadoM3, porDia)) ?? leido;
    }

    /* ── Jornadas: una transacción por día, en orden, hasta que falle una. ── */
    if (!falla && hasta === "jornadas" && leido.estado.siguiente === "jornadas") {
      if (!ROLES_QUE_DECLARAN.includes(role)) {
        falla = {
          paso: "jornadas",
          code: "SIN_ROL",
          motivo: "Registrar la jornada declara su producción en el Libro: lo hace el dueño o un administrador.",
        };
      } else if (porDia && porDia.length === 0) {
        falla = { paso: "jornadas", code: "SIN_DIAS_LISTOS", motivo: SIN_ASERRADA };
      } else if (!porDia) {
        falla = {
          paso: "jornadas",
          code: "FALTA_REPARTO",
          motivo: "Faltan los días del bloque: abre la distribución en el cubicador para repartirlos (la cubicación no se guarda en el servidor).",
        };
      } else {
        const existentes = await ForestCtpDB.codigosDePaquete(tenantId);
        const reservados: string[] = [];
        let bloque: BloqueRolliza = leido.bloque;
        let lote = leido.lote;
        /* Se recalcula el plan tras cada día: el Libro se llena en orden y el
           siguiente día recién queda «lista» cuando el anterior entró. */
        for (let vuelta = 0; vuelta < porDia.length; vuelta++) {
          const plan = planDe(bloque, porDia, lote);
          const j = plan.jornadas.find((x) => x.estado === "lista" || (x.estado === "abierta" && x.declarable));
          if (!j) {
            /* Ningún día listo: se dice por qué (antes cortaba en silencio y el
               botón no hacía nada). Si este pedido ya registró o adoptó días,
               es el final normal. */
            const porque = faltanDiasListos(plan);
            if (porque && ejecutados.every((e) => e.paso !== "jornadas")) falla = { paso: "jornadas", ...porque };
            break;
          }
          if (Date.now() - inicio > PRESUPUESTO_MS) {
            continuar = true;
            break;
          }
          /* ADR-521: la corrida abierta que el bloque adoptó. Es UN día (una
             troza no se parte entre dos corridas) y nunca la de otro bloque. */
          if (j.estado === "abierta" && j.corridaId) {
            const deOtro = tomados.corridas.get(j.corridaId);
            if (deOtro) {
              falla = {
                paso: "jornadas",
                code: "CORRIDA_DE_OTRO_BLOQUE",
                motivo: `La corrida N° ${j.lineNo} ya es del ${deOtro}: se declara desde ese bloque, no dos veces.`,
              };
              break;
            }
            if (porDia.filter((d) => d.piezas > 0 && d.grupos.length > 0).length > 1) {
              falla = {
                paso: "jornadas",
                code: "UN_SOLO_DIA",
                motivo: `La corrida N° ${j.lineNo} es un día: junta los días del bloque en uno.`,
              };
              break;
            }
          }
          try {
            const paquetes = paquetesDeGrupos(j.grupos, j.fecha, existentes, reservados);
            /* B5: la nota nombra el bloque, como la del Libro de bloques. */
            const nota = `Jornada ${j.dia} de ${porDia.length} · bloque ${bloque.etiqueta || "sin etiqueta"} · recorrido del permiso`;
            const produccion = {
              quantity: j.m3,
              unit: "m3",
              observations: nota,
              lineaProduccion: "LP",
              pieces: j.piezas,
              productType: paquetes[0]?.productType ?? null,
              presentacion: paquetes[0]?.presentacion ?? null,
              codigoProducto: paquetes[0]?.codigo ?? null,
              paquetes,
            };
            /* A1: la corrida y la anotación del día, en la misma transacción. */
            const anotarEn = {
              distribucionId,
              bloqueId,
              parche: (prev: BloqueRolliza, corrida: { id: string; lineNo: number }) =>
                anotarJornadas(prev, [{ dia: j.dia, corridaId: corrida.id, lineNo: corrida.lineNo, estado: "declarada", fecha: j.fecha }]),
            };
            const hecho =
              j.estado === "abierta" && j.corridaId
                ? await ForestJornadaBloqueDB.declararJornadaAbierta(
                    tenantId,
                    { corridaId: j.corridaId, trozaIds: j.trozaIds, produccion, user },
                    anotarEn,
                  )
                : await ForestJornadaBloqueDB.registrarJornada(
                    tenantId,
                    {
                      loteId: lote?.id ?? "",
                      trozaIds: j.trozaIds,
                      fecha: new Date(`${j.fecha}T12:00:00.000Z`),
                      observaciones: nota,
                      produccion,
                      user,
                    },
                    anotarEn,
                  );
            const declarada = j.estado === "abierta" ? " declarada" : "";
            bloque = hecho.bloque ?? bloque;
            ejecutados.push({ paso: "jornadas", detalle: `Día ${j.dia} · corrida N° ${hecho.corrida.lineNo}${declarada}${hecho.yaEstaba ? " (ya estaba)" : ""}` });
            auditCtp({
              tenantId,
              action: "ctp_recorrido_paso",
              entity: "ForestDistribucion",
              entityId: distribucionId,
              detail: `Recorrido del permiso · bloque ${bloque.etiqueta}: día ${j.dia} en la corrida N° ${hecho.corrida.lineNo}${declarada ? " (declaró la corrida abierta del lote)" : ""}${hecho.yaEstaba ? " (reintento: ya estaba)" : ""}`,
              user,
            });
            lote = await leerLote(tenantId, bloque.loteId);
          } catch (err) {
            falla = fallaDe("jornadas", err, { tenantId, distribucionId, bloqueId, dia: j.dia });
            break;
          }
        }
      }
    }

    const final = (await leer(tenantId, distribucionId, bloqueId, usadoM3, porDia)) ?? leido;
    return NextResponse.json({ estado: conFalla(final.estado, falla), ejecutados, continuar });
  } catch (err) {
    logger.error("[forestal.recorrido.POST] no se pudo ejecutar el recorrido", { tenantId, distribucionId, bloqueId, error: String(err) });
    return NextResponse.json({ error: "server_error", message: "No se pudo ejecutar el recorrido." }, { status: 500 });
  }
});
