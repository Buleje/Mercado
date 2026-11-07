/**
 * Sembrador de la DEMO de aserradero (carril D, noche 04-11).
 *
 * Llena un negocio de prueba con un recorrido completo del panel forestal —
 * permiso con 2 especies, 2 ingresos con GTF y trozas, 2 lotes con consumo y
 * producción, saldo en patio, 1 GTF de despacho, 1 cubicación y un cliente que
 * queda debiendo («Quién te debe»)— para que el prospecto lo vea lleno en el
 * primer minuto. Solo DB classes (regla 1), `tenantId` primero.
 *
 * Criterio de «negocio demo» SIN schema (no hay `isDemo` en `Tenant`): el slug
 * empieza con `demo-` y el script exige `--si-estoy-seguro`. Nunca Blas ni
 * `main`, y nunca un negocio con un ingreso o un lote previo.
 *
 * Idempotente: cada fila lleva `MARCA_DEMO` en sus notas; si ya hay un lote con
 * la marca, sale sin escribir.
 */
import { logger } from "@/lib/logger";
import { TenantsDB } from "@/lib/db/tenants.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestEspeciesDB, EspecieCatalogoError } from "@/lib/db/forest-especies.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { ForestCubicacionesDB } from "@/lib/db/forest-cubicaciones.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import {
  CLIENTE_DEMO,
  MARCA_DEMO,
  PLAN_DEMO,
  PROVEEDOR_DEMO,
  TENANTS_PROHIBIDOS,
  USUARIO_DEMO,
  esTenantDemo,
  planDemoAserradero,
  verificarCuadre,
  type PlanDemo,
} from "./demo-aserradero-datos";

export class DemoAserraderoError extends Error {
  constructor(
    message: string,
    readonly codigo: "TENANT_PROHIBIDO" | "TENANT_NO_EXISTE" | "NO_ES_DEMO" | "CON_DATOS" | "NO_CUADRA" | "PATIO_INCOMPLETO",
  ) {
    super(message);
    this.name = "DemoAserraderoError";
  }
}

export interface ResumenDemo {
  yaSembrado: boolean;
  filas: Record<
    "especies" | "partes" | "planes" | "ingresos" | "trozas" | "lotes" | "corridas" | "despachos" | "cubicaciones" | "movimientos",
    number
  >;
  plan: PlanDemo;
}

const filasEnCero = (): ResumenDemo["filas"] => ({
  especies: 0, partes: 0, planes: 0, ingresos: 0, trozas: 0, lotes: 0, corridas: 0, despachos: 0, cubicaciones: 0, movimientos: 0,
});

const fechaTexto = (d: Date) => d.toISOString().slice(0, 10);

export async function sembrarDemoAserradero(
  tenantId: string,
  opciones: { hoy?: Date; usuario?: string } = {},
): Promise<ResumenDemo> {
  const usuario = opciones.usuario ?? USUARIO_DEMO;
  const plan = planDemoAserradero(opciones.hoy);
  const filas = filasEnCero();

  // ── Guardas duras, ANTES de cualquier escritura ──────────────────────────
  if (!tenantId || TENANTS_PROHIBIDOS.includes(tenantId)) {
    throw new DemoAserraderoError(`El negocio «${tenantId}» nunca recibe datos de demo.`, "TENANT_PROHIBIDO");
  }
  const tenant = await TenantsDB.getBasicById(tenantId);
  if (!tenant) throw new DemoAserraderoError(`No existe un negocio con id «${tenantId}».`, "TENANT_NO_EXISTE");
  if (!esTenantDemo(tenant)) {
    throw new DemoAserraderoError(`«${tenant.slug}» no es un negocio demo (el slug tiene que empezar con «demo-»).`, "NO_ES_DEMO");
  }
  const errores = verificarCuadre(plan);
  if (errores.length > 0) throw new DemoAserraderoError(`Las cifras de la demo no cuadran: ${errores.join("; ")}`, "NO_CUADRA");

  const lotesPrevios = await ForestLoteAserrioDB.list(tenantId, { limite: 50 });
  const conMarca = lotesPrevios.some((l) => String((l as { notes?: unknown }).notes ?? "").includes(MARCA_DEMO));
  if (conMarca) return { yaSembrado: true, filas, plan };
  const { total: ingresosPrevios } = await WoodEntriesDB.listPorGuia(tenantId, { limit: 1 });
  if (ingresosPrevios > 0 || lotesPrevios.length > 0) {
    throw new DemoAserraderoError(
      `«${tenant.slug}» ya tiene ${ingresosPrevios} guía(s) de ingreso y ${lotesPrevios.length} lote(s): la demo solo se siembra en un negocio vacío.`,
      "CON_DATOS",
    );
  }

  // ── Catálogo, directorio y permiso ───────────────────────────────────────
  for (const e of plan.especies) {
    try {
      await ForestEspeciesDB.agregar(tenantId, { nombre: e.nombre, cientifico: e.cientifico }, usuario);
      filas.especies++;
    } catch (err) {
      if (!(err instanceof EspecieCatalogoError)) throw err; // ya estaba en el catálogo: sirve igual
    }
  }
  await ForestDirectorioDB.guardarParte(
    tenantId,
    { roles: ["proveedor"], nombre: PROVEEDOR_DEMO.nombre, docTipo: "RUC", docNumero: PROVEEDOR_DEMO.ruc, region: PLAN_DEMO.region },
    usuario,
  );
  const cliente = await ForestDirectorioDB.guardarParte(
    tenantId,
    { roles: ["cliente", "destinatario"], nombre: CLIENTE_DEMO.nombre, docTipo: "RUC", docNumero: CLIENTE_DEMO.ruc, direccion: CLIENTE_DEMO.direccion },
    usuario,
  );
  filas.partes += 2;

  await ForestPlanDB.crearPlanConEspecies(
    tenantId,
    {
      planNumber: PLAN_DEMO.planNumber,
      tituloHabilitante: PLAN_DEMO.tituloHabilitante,
      resolucionNumber: PLAN_DEMO.resolucionNumber,
      titularName: PROVEEDOR_DEMO.nombre,
      parcelaCorta: PLAN_DEMO.parcelaCorta,
      areaHa: PLAN_DEMO.areaHa,
      region: PLAN_DEMO.region,
      notes: MARCA_DEMO,
      createdBy: usuario,
    },
    plan.especies.map((e) => ({ speciesCommon: e.nombre, speciesScientific: e.cientifico, volumenAutorizadoM3: e.volumenAutorizadoM3 })),
  );
  filas.planes++;

  // ── Ingresos con GTF y trozas ────────────────────────────────────────────
  const ingresoDe = new Map<string, string>();
  for (const e of plan.especies) {
    const entry = await WoodEntriesDB.create(tenantId, {
      entryDate: plan.fechas.ingreso,
      fechaRecepcion: plan.fechas.ingreso,
      gtfNumber: e.gtfIngreso,
      gtfDate: plan.fechas.ingreso,
      docType: "GTF",
      providerName: PROVEEDOR_DEMO.nombre,
      providerDocument: PROVEEDOR_DEMO.ruc,
      originCode: PLAN_DEMO.planNumber,
      originRegion: PLAN_DEMO.region,
      speciesCommonName: e.nombre,
      speciesScientificName: e.cientifico,
      volumeM3: e.ingresoM3,
      pieces: e.trozasCalc.length,
      notes: MARCA_DEMO,
      createdBy: usuario,
      trozas: e.trozasCalc.map((t) => ({
        orden: t.orden,
        codificacion: t.codigo,
        especieComun: e.nombre,
        especieCientifica: e.cientifico,
        dimensiones: `Ø ${t.diametroCm} cm × ${t.largoM} m`,
        largoM: t.largoM,
        diametroCm: t.diametroCm,
        d1Cm: t.diametroCm,
        d2Cm: t.diametroCm,
        cantidad: 1,
        volumenM3: t.volumenM3,
        fechaRecepcion: plan.fechas.ingreso,
      })),
    });
    ingresoDe.set(e.nombre, entry.id);
    filas.ingresos++;
    filas.trozas += e.trozasCalc.length;
  }

  // ── Lotes: consumo en patio + producción declarada ───────────────────────
  const patio = await WoodEntriesDB.trozasDelPatio(tenantId, { limite: 500 });
  const corridaDe = new Map<string, string>();
  for (const e of plan.especies) {
    const entryId = ingresoDe.get(e.nombre);
    const trozaIds = patio
      .filter((t) => t.woodEntryId === entryId && t.orden <= e.trozasConsumidas)
      .map((t) => t.id);
    if (trozaIds.length !== e.trozasConsumidas) {
      throw new DemoAserraderoError(
        `${e.nombre}: el patio devolvió ${trozaIds.length} de ${e.trozasConsumidas} trozas a consumir.`,
        "PATIO_INCOMPLETO",
      );
    }
    const lote = await ForestLoteAserrioDB.create(tenantId, {
      speciesCommon: e.nombre,
      speciesScientific: e.cientifico,
      permiso: PLAN_DEMO.planNumber,
      inicioProceso: plan.fechas.consumo,
      notes: MARCA_DEMO,
      createdBy: usuario,
    });
    filas.lotes++;
    const consumo = await ForestLoteAserrioDB.consumirEnPatio(tenantId, {
      loteId: lote.id,
      trozaIds,
      fecha: plan.fechas.consumo,
      observaciones: MARCA_DEMO,
      user: usuario,
      exigirTodas: true,
    });
    if (Math.abs(consumo.volumenM3 - e.consumoM3) > 0.001) {
      logger.warn("[demo-aserradero] el consumo registrado difiere del plan", { especie: e.nombre, plan: e.consumoM3, real: consumo.volumenM3 });
    }
    await ForestCtpDB.declararProduccion(
      tenantId,
      consumo.corrida.id,
      {
        quantity: e.producidoM3,
        unit: "m3",
        pieces: e.piezas,
        codigoProducto: e.paquetesCalc[0]?.codigo ?? null,
        observations: MARCA_DEMO,
        paquetes: e.paquetesCalc.map((p) => ({
          codigo: p.codigo,
          cantidad: p.cantidad,
          volumenM3: p.m3,
          espesorCm: Math.round(p.espesorPulg * 2.54 * 100) / 100,
          anchoCm: Math.round(p.anchoPulg * 2.54 * 100) / 100,
          largoM: Math.round(p.largoPies * 0.3048 * 100) / 100,
        })),
      },
      usuario,
    );
    corridaDe.set(e.nombre, consumo.corrida.id);
    filas.corridas++;
  }

  // ── GTF de despacho, cubicación y cuenta del cliente ─────────────────────
  const d = plan.despacho;
  const corridaId = corridaDe.get(d.especie);
  if (!corridaId) throw new DemoAserraderoError(`No hay corrida de ${d.especie} para despachar.`, "NO_CUADRA");
  const despacho = await ForestCtpDB.create(tenantId, {
    section: "despacho",
    entryDate: plan.fechas.despacho,
    speciesCommon: d.especie,
    speciesScientific: d.cientifico,
    quantity: d.m3,
    unit: "m3",
    pieces: d.piezas,
    gtfNumber: d.gtfNumber,
    docType: "GTF",
    destino: CLIENTE_DEMO.direccion,
    valorVenta: d.montoVenta,
    moneda: "PEN",
    observations: MARCA_DEMO,
    origenes: [{ produccionEntryId: corridaId, quantity: d.m3 }],
    createdBy: usuario,
  });
  filas.despachos++;

  await ForestCubicacionesDB.save(
    tenantId,
    {
      nombre: `Cubicación ${d.gtfNumber} · ${CLIENTE_DEMO.nombre}`,
      fecha: fechaTexto(plan.fechas.despacho),
      especie: d.especie,
      precioPt: d.precioPt,
      piezas: [{ cantidad: d.piezas, espesor: d.paquete.espesorPulg, ancho: d.paquete.anchoPulg, largo: d.paquete.largoPies }],
      ctpEntryId: despacho.id,
    },
    usuario,
  );
  filas.cubicaciones++;

  const mov = { parteId: cliente.id, parteNombre: CLIENTE_DEMO.nombre, moneda: "PEN", referencia: `GTF ${d.gtfNumber}`, notas: MARCA_DEMO };
  await ForestCuentaDB.guardar(tenantId, { ...mov, fecha: fechaTexto(plan.fechas.despacho), tipo: "cargo", concepto: "venta", monto: d.montoVenta }, usuario);
  await ForestCuentaDB.guardar(tenantId, { ...mov, fecha: fechaTexto(plan.fechas.despacho), tipo: "abono", concepto: "pago", monto: d.abono }, usuario);
  filas.movimientos += 2;

  logger.info("[demo-aserradero] demo sembrada", { tenantId, filas });
  return { yaSembrado: false, filas, plan };
}

/*
 * Cómo correrlo (decide Brandon; la base es compartida con producción):
 *   1. Crear un negocio forestal de prueba con slug `demo-<algo>` (superadmin).
 *   2. Ensayo, sin escribir:  npx tsx scripts/demo/sembrar-demo-aserradero.mts --tenant=<id>
 *   3. De verdad:             scripts/dev-helpers/tsx-servidor.sh scripts/demo/sembrar-demo-aserradero.mts --tenant=<id> --si-estoy-seguro
 *   Borrar: todas las filas llevan «[demo-aserradero v1]» en sus notas (purga del CTP o borrar el negocio demo).
 */
