/**
 * Libro CTP · atribución N:M + invariantes + costeo — REAL DB integration (ADR-134).
 *
 * ── Por qué este archivo existe ───────────────────────────────────────────
 * Estas invariantes son la diferencia entre un libro de operaciones y una
 * planilla: I2 impide consumir dos veces el mismo ingreso, que es el patrón de
 * blanqueo que fiscaliza SERFOR (legitimar madera sin origen contra una guía
 * real). Postgres NO puede garantizarlas — son agregadas y el aislamiento de
 * Buleje es app-level, no RLS. Si `ForestCtpConsumoDB` deja de aplicarlas, no
 * las aplica nadie, y el módulo miente en silencio.
 *
 * ── Por qué DB real y no mocks ────────────────────────────────────────────
 * Mismo criterio que `security/multi-tenant-isolation.test.ts`: un mock prueba
 * que el código llama al where correcto, no que Postgres se comporte como
 * creemos bajo Decimal, transacciones y locks. El test de concurrencia de abajo
 * es la prueba: encontró un TOCTOU real (2026-07-15) que ningún mock habría
 * mostrado — el lock estaba sobre la línea y no sobre el ingreso disputado, y
 * dos corridas paralelas consumían 20 m³ de un ingreso de 10.
 *
 * Todo lo creado lleva prefijo `TEST-CTP-<runId>` y `afterAll` lo borra en
 * orden inverso de FKs.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run \
 *     __tests__/forestal-ctp-consumo.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestCtpConsumoDB, CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";

const TENANT = "main";
const runId = Math.random().toString(36).slice(2, 8);
const P = `TEST-CTP-${runId}`;

const woodIds: string[] = [];
const lineIds: string[] = [];

/**
 * Ingreso validado con costo opcional (sin costo = factura que aún no llegó).
 * `cites` es explícito a propósito: el nombre de la especie NO lo deduce —
 * `speciesCites` es un booleano que marca el operador al registrar la guía.
 */
async function crearIngreso(
  vol: number,
  costoTotal?: number,
  especie = "Tornillo",
  cites = false,
) {
  const w = await WoodEntriesDB.create(TENANT, {
    gtfNumber: `${P}-${woodIds.length}`,
    providerName: `${P} proveedor`,
    speciesCommonName: especie,
    speciesCites: cites,
    volumeM3: vol,
    costoTotal: costoTotal ?? null,
    moneda: "PEN",
    createdBy: P,
  });
  await prisma.woodEntry.update({ where: { id: w.id }, data: { status: "validado" } });
  woodIds.push(w.id);
  return w;
}

/** Línea de producción. `declarado: null` deja I1 fuera de juego (sólo I2 protege). */
async function crearLinea(declarado: number | null, producido = 0, costoProceso?: number) {
  const l = await prisma.forestCtpEntry.create({
    data: {
      tenantId: TENANT,
      section: "produccion",
      lineNo: 90_000 + lineIds.length,
      speciesCommon: "Tornillo",
      productType: `${P}-prod`,
      volumeInputM3: declarado,
      quantity: producido || null,
      unit: producido ? "m3" : null,
      costoProceso: costoProceso ?? null,
      moneda: "PEN",
      status: "registrado",
      createdBy: P,
    },
  });
  lineIds.push(l.id);
  return l;
}

/**
 * Limpieza por PATRÓN, no por los ids de esta corrida.
 *
 * Barre todo lo que matchee `TEST-CTP-`, incluida la basura que haya dejado una
 * corrida ANTERIOR que murió sin poder limpiar. Pasó de verdad (2026-07-15): se
 * cayó el DNS del pooler a mitad de los tests, el `afterAll` explotó con
 * EAI_AGAIN, y quedaron 11 ingresos + 12 líneas de prueba visibles en el módulo
 * real. Limpiar sólo los ids en memoria no cubre ese caso.
 *
 * El patrón es seguro: ningún dato real puede llamarse `TEST-CTP-…`.
 */
async function purgarDatosDePrueba() {
  const wood = { gtfNumber: { startsWith: `TEST-CTP-` } };
  const linea = { tenantId: TENANT, createdBy: { startsWith: `TEST-CTP-` } };
  // Orden inverso de FKs: el RESTRICT de woodEntryId exige borrar consumos antes.
  await prisma.forestCtpConsumo.deleteMany({
    where: { OR: [{ ctpEntry: linea }, { woodEntry: wood }, { createdBy: { startsWith: `TEST-CTP-` } }] },
  });
  await prisma.forestCtpDespachoOrigen.deleteMany({
    where: { OR: [{ despacho: linea }, { produccion: linea }, { createdBy: { startsWith: `TEST-CTP-` } }] },
  });
  await prisma.forestCtpEntry.deleteMany({ where: linea });
  await prisma.woodEntry.deleteMany({ where: wood });
  // Desde ADR-134 cada create/validate/setConsumos deja rastro en ActivityLog.
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: { startsWith: `TEST-CTP-` } } });
}

/**
 * Son tests de INTEGRACIÓN: necesitan la DB accesible. El pre-commit y
 * `vitest --changed` corren SIN `--env-file=.env.local`, así que no hay
 * DATABASE_URL y Prisma se cuelga hasta el timeout del hook. En vez de romper
 * el commit por eso, se saltan — mismo criterio y mismo patrón que
 * `security/multi-tenant-isolation.test.ts`.
 *
 * Ping real en lugar de mirar `process.env.DATABASE_URL`: la var puede estar
 * definida y la red caída igual (pasó el 2026-07-15 con un EAI_AGAIN del pooler).
 */
/**
 * OJO — top-level await, NO `beforeAll`.
 *
 * `describe.skipIf(cond)` evalúa `cond` en tiempo de COLECCIÓN, antes de que
 * corra ningún hook. Si `HAS_DB` se setea en un `beforeAll`, al momento del
 * `skipIf` todavía vale `false` y el suite se saltea SIEMPRE — incluso con la
 * DB arriba. Eso es peor que fallar: parece verde y no prueba nada.
 * (Verificado el 2026-07-15: con esa forma, 17/17 "skipped" teniendo DB.)
 */
const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  // Y la migración ADR-134 tiene que haber corrido en este entorno.
  .then(() => prisma.forestCtpConsumo.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (!HAS_DB) return;
  // Si una corrida anterior murió sin limpiar, su basura se va acá.
  await purgarDatosDePrueba();
}, 30_000);

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    await purgarDatosDePrueba();
  } catch (err) {
    // Si la limpieza falla (red caída, por ejemplo) hay que GRITARLO: el módulo
    // queda con datos de prueba a la vista. Silenciarlo es cómo pasó la primera vez.
    console.error(
      "\n🔴 LA LIMPIEZA DE LOS TESTS FALLÓ — quedan datos TEST-CTP- en la DB.\n" +
        "   Corré de nuevo estos tests (el beforeAll purga) o limpiá a mano.\n",
      err,
    );
    throw err;
  }
}, 30_000);

describe.skipIf(!HAS_DB)("I2 · sobre-consumo de un ingreso (patrón de blanqueo)", () => {
  it("rechaza consumir más m³ de los que el ingreso tiene", async () => {
    const ing = await crearIngreso(8.45);
    const linea = await crearLinea(null); // sin declarado ⇒ I1 no aplica

    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 999_999 }], P),
    ).rejects.toMatchObject({ code: "I2_SOBRE_CONSUMO" });
  }, 30_000);

  it("cuenta lo que YA consumen otras líneas: un ingreso no se consume dos veces", async () => {
    const ing = await crearIngreso(10);
    const a = await crearLinea(null);
    const b = await crearLinea(null);

    await ForestCtpConsumoDB.setConsumos(TENANT, a.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);
    // La guía ya está agotada por la línea A.
    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, b.id, [{ woodEntryId: ing.id, volumeM3: 1 }], P),
    ).rejects.toMatchObject({ code: "I2_SOBRE_CONSUMO" });
  }, 30_000);

  /**
   * REGRESIÓN — bug real encontrado el 2026-07-15.
   * `setConsumos` lockeaba la ForestCtpEntry pero no el WoodEntry. Dos líneas
   * distintas sobre la misma guía lockeaban filas distintas, no se bloqueaban,
   * y bajo READ COMMITTED ambas leían el mismo "disponible" ⇒ 20 m³ consumidos
   * de un ingreso de 10. El fix lockea los ingresos (ordenados por id).
   * Si alguien saca ese `FOR UPDATE`, este test vuelve a rojo.
   */
  it("aguanta concurrencia: dos líneas en paralelo sobre la misma guía", async () => {
    const ing = await crearIngreso(10);
    const a = await crearLinea(null);
    const b = await crearLinea(null);

    const res = await Promise.allSettled([
      ForestCtpConsumoDB.setConsumos(TENANT, a.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P),
      ForestCtpConsumoDB.setConsumos(TENANT, b.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P),
    ]);

    // Exactamente una gana; la otra se rechaza. Nunca las dos.
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const total = await prisma.forestCtpConsumo.aggregate({
      where: { tenantId: TENANT, woodEntryId: ing.id },
      _sum: { volumeM3: true },
    });
    expect(Number(total._sum.volumeM3 ?? 0)).toBeLessThanOrEqual(10);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("Una línea muerta no secuestra su materia prima", () => {
  /**
   * REGRESIÓN — bug real encontrado el 2026-07-15 al planear ADR-135.
   * El soft-delete NO dispara el `onDelete: Cascade` del FK, y los agregados de
   * I2/`availableSource` sumaban sobre ForestCtpConsumo sin mirar el estado de
   * la línea padre. Resultado: `saldos()` decía "5.2 m³ libres" y el picker
   * decía "no queda nada", del MISMO ingreso y en el mismo momento. Anular una
   * corrida secuestraba su materia prima para siempre, invisible.
   */
  it("anular la corrida devuelve el ingreso al disponible (I2 deja de contarlo)", async () => {
    const ing = await crearIngreso(10);
    const a = await crearLinea(10);
    await ForestCtpConsumoDB.setConsumos(TENANT, a.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);

    // Con la corrida viva, el ingreso está agotado.
    const b = await crearLinea(10);
    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, b.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P),
    ).rejects.toMatchObject({ code: "I2_SOBRE_CONSUMO" });

    // Se anula la corrida A → su consumo deja de contar.
    await ForestCtpDB.annul(TENANT, a.id, "error de carga", P);

    // Ahora los 10 m³ vuelven a estar disponibles para otra corrida.
    const res = await ForestCtpConsumoDB.setConsumos(TENANT, b.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);
    expect(res).toHaveLength(1);
  }, 30_000);

  it("una corrida borrada tampoco aparece consumiendo en el picker", async () => {
    const ing = await crearIngreso(7);
    const a = await crearLinea(7);
    await ForestCtpConsumoDB.setConsumos(TENANT, a.id, [{ woodEntryId: ing.id, volumeM3: 7 }], P);

    await ForestCtpDB.softDelete(TENANT, a.id, P);

    const items = await ForestCtpDB.availableSource(TENANT, "produccion");
    // `availableSource` devuelve una unión (ingreso | producto); el filtro por
    // `kind` la estrecha para que `disponible` exista.
    const guia = items
      .filter((i): i is Extract<typeof i, { kind: "ingreso" }> => i.kind === "ingreso")
      .find((i) => i.id === ing.id);
    // Vuelve a ofrecerse con su volumen entero.
    expect(guia?.disponible).toBe(7);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("I1 · sobre-atribución vs. el acta", () => {
  it("rechaza atribuir más de lo que la línea declara consumido", async () => {
    const ing = await crearIngreso(50);
    const linea = await crearLinea(8.45);

    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 9 }], P),
    ).rejects.toMatchObject({ code: "I1_SOBRE_ATRIBUCION" });
  }, 30_000);

  it("acepta atribución PARCIAL y la reporta como sinAtribuir", async () => {
    // I1 es `≤`, no `==`: exigir el 100% obligaría a inventar un origen para
    // poder guardar — la regla fabricaría el fraude que previene.
    const ing = await crearIngreso(10);
    const linea = await crearLinea(8, 5);

    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 3 }], P);
    const costo = await ForestCtpConsumoDB.costoDeLinea(TENANT, linea.id);

    expect(costo.atribuidoM3).toBe(3);
    expect(costo.sinAtribuirM3).toBe(5);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("Guards de tenant y payload", () => {
  it("rechaza un ingreso que no existe o es de otro tenant", async () => {
    const linea = await crearLinea(null);
    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: `${P}-inexistente`, volumeM3: 1 }], P),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
  }, 30_000);

  it("rechaza el mismo ingreso dos veces en el payload", async () => {
    const ing = await crearIngreso(10);
    const linea = await crearLinea(null);
    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [
        { woodEntryId: ing.id, volumeM3: 1 },
        { woodEntryId: ing.id, volumeM3: 1 },
      ], P),
    ).rejects.toBeInstanceOf(CtpInvariantError);
  }, 30_000);

  it("rechaza un consumo de 0 m³", async () => {
    const ing = await crearIngreso(10);
    const linea = await crearLinea(null);
    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 0 }], P),
    ).rejects.toBeInstanceOf(CtpInvariantError);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("Costeo ponderado (ADR-134 D6)", () => {
  it("promedia POR VOLUMEN al mezclar guías de distinto precio", async () => {
    // La razón de ser del modelo N:M: con FK escalar este número no se puede expresar.
    const a = await crearIngreso(3, 1260); // S/420/m³
    const b = await crearIngreso(5.45, 2725); // S/500/m³
    const linea = await crearLinea(8.45, 6.2, 300);

    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [
      { woodEntryId: a.id, volumeM3: 3 },
      { woodEntryId: b.id, volumeM3: 5.45 },
    ], P);

    const c = await ForestCtpConsumoDB.costoDeLinea(TENANT, linea.id);
    expect(c.costoMateriaPrima).toBe(3985); // 3×420 + 5.45×500 — ni 420 ni 500
    expect(c.costoTotal).toBe(4285); // + proceso
    expect(c.costoUnitario).toBe(691.13); // 4285 / 6.2
    expect(c.motivo).toBe("ok");
  }, 30_000);

  it("sin factura → costo null, NUNCA 0 (un 0 fingiría margen 100%)", async () => {
    const ing = await crearIngreso(10); // sin costoTotal
    const linea = await crearLinea(10, 8);

    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);
    const c = await ForestCtpConsumoDB.costoDeLinea(TENANT, linea.id);

    expect(c.costoMateriaPrima).toBeNull();
    expect(c.motivo).toBe("falta_factura");
  }, 30_000);

  it("una sola guía sin factura envenena el costo de toda la línea", async () => {
    const conFactura = await crearIngreso(5, 2000);
    const sinFactura = await crearIngreso(5);
    const linea = await crearLinea(10, 8);

    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [
      { woodEntryId: conFactura.id, volumeM3: 5 },
      { woodEntryId: sinFactura.id, volumeM3: 5 },
    ], P);

    const c = await ForestCtpConsumoDB.costoDeLinea(TENANT, linea.id);
    expect(c.costoMateriaPrima).toBeNull(); // no se suma lo que no se sabe
    expect(c.motivo).toBe("falta_factura");
  }, 30_000);
});

describe.skipIf(!HAS_DB)("Corrida real: mezcla de N guías", () => {
  /**
   * REGRESIÓN — el caso que rompía (2026-07-15).
   * La UI resume las N guías en `gtfIngreso` ("001-0000120, 001-0000131, …"),
   * pero el zod del POST tenía `max(60)`, dimensionado para UN código: con 5
   * guías el resumen daba 63 chars ⇒ 400, y mezclar guías es la razón de ser
   * del modelo N:M. La columna es TEXT; el límite era sólo del schema.
   */
  it("5 guías: atribuye, resume el acta y pondera el costo entre las 5", async () => {
    const guias = await Promise.all([
      crearIngreso(2, 800), // S/400/m³
      crearIngreso(2, 900), // S/450/m³
      crearIngreso(2, 1000), // S/500/m³
      crearIngreso(2, 1100), // S/550/m³
      crearIngreso(2, 1200), // S/600/m³
    ]);
    const linea = await crearLinea(10, 7); // 10 m³ consumidos → 7 producidos

    await ForestCtpConsumoDB.setConsumos(
      TENANT,
      linea.id,
      guias.map((g) => ({ woodEntryId: g.id, volumeM3: 2 })),
      P,
    );

    const c = await ForestCtpConsumoDB.costoDeLinea(TENANT, linea.id);
    // 2×(400+450+500+550+600) = 5000. Ningún precio individual da eso.
    expect(c.costoMateriaPrima).toBe(5000);
    expect(c.atribuidoM3).toBe(10);
    expect(c.motivo).toBe("ok");

    // El acta resumida supera de largo los 60 chars del límite viejo.
    const resumen = guias.map((g) => g.gtfNumber).join(", ");
    expect(resumen.length).toBeGreaterThan(60);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("I3 · sobre-despacho (no se despacha lo que no se produjo)", () => {
  /** Producto único por corrida: el stock se agrupa por tipo+especie. */
  const prodTipo = `${P}-tablon`;

  async function producir(cantidad: number, tipo = prodTipo) {
    const l = await prisma.forestCtpEntry.create({
      data: {
        tenantId: TENANT, section: "produccion", lineNo: 91_000 + lineIds.length,
        speciesCommon: "Tornillo", productType: tipo, quantity: cantidad, unit: "m3",
        status: "registrado", createdBy: P,
      },
    });
    lineIds.push(l.id);
    return l;
  }
  const despachar = (cantidad: number, tipo = prodTipo) =>
    ForestCtpDB.create(TENANT, {
      section: "despacho", speciesCommon: "Tornillo", productType: tipo,
      quantity: cantidad, unit: "m3", gtfNumber: `${P}-salida`, createdBy: P,
    });

  it("rechaza despachar un producto que nunca se produjo", async () => {
    await expect(despachar(5, `${P}-fantasma`)).rejects.toMatchObject({ code: "I3_SOBRE_DESPACHO" });
  }, 30_000);

  it("rechaza despachar más de lo producido", async () => {
    await producir(10);
    await expect(despachar(11)).rejects.toMatchObject({ code: "I3_SOBRE_DESPACHO" });
  }, 30_000);

  it("permite despachos parciales hasta agotar el stock, y ni uno más", async () => {
    const tipo = `${P}-parcial`;
    await producir(10, tipo);

    const d1 = await despachar(6, tipo);
    lineIds.push(d1.id);
    const d2 = await despachar(4, tipo); // justo hasta 10
    lineIds.push(d2.id);

    // El stock quedó en 0: el siguiente no pasa.
    await expect(despachar(0.5, tipo)).rejects.toMatchObject({ code: "I3_SOBRE_DESPACHO" });
  }, 30_000);

  it("agrupa por tipo+especie SIN importar mayúsculas ni espacios", async () => {
    // Antes el stock se llaveaba sin normalizar: "Tablones" y "tablones " eran
    // productos distintos ⇒ se podía despachar el doble cambiando el tipeo.
    const tipo = `${P}-Norm`;
    await producir(5, tipo);
    await expect(despachar(8, `  ${tipo.toUpperCase()}  `)).rejects.toMatchObject({
      code: "I3_SOBRE_DESPACHO",
    });
  }, 30_000);

  /** Misma lección que I2: sin lock, dos despachos concurrentes leen el mismo stock. */
  it("aguanta concurrencia: dos despachos en paralelo del mismo producto", async () => {
    const tipo = `${P}-race`;
    await producir(10, tipo);

    const res = await Promise.allSettled([despachar(10, tipo), despachar(10, tipo)]);
    for (const r of res) if (r.status === "fulfilled") lineIds.push(r.value.id);

    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("I4/I5 · cadena de custodia del despacho (ADR-135)", () => {
  const tipo = () => `${P}-cad-${Math.random().toString(36).slice(2, 6)}`;

  async function corrida(cantidad: number, t: string) {
    const l = await prisma.forestCtpEntry.create({
      data: {
        tenantId: TENANT, section: "produccion", lineNo: 92_000 + lineIds.length,
        speciesCommon: "Tornillo", productType: t, quantity: cantidad, unit: "m3",
        status: "registrado", createdBy: P,
      },
    });
    lineIds.push(l.id);
    return l;
  }
  async function despacho(cantidad: number, t: string) {
    const l = await prisma.forestCtpEntry.create({
      data: {
        tenantId: TENANT, section: "despacho", lineNo: 93_000 + lineIds.length,
        speciesCommon: "Tornillo", productType: t, quantity: cantidad, unit: "m3",
        gtfNumber: `${P}-out`, status: "registrado", createdBy: P,
      },
    });
    lineIds.push(l.id);
    return l;
  }

  it("I4 rechaza atribuir a corridas más de lo que el despacho declara", async () => {
    const t = tipo();
    const c = await corrida(50, t);
    const d = await despacho(5, t);
    await expect(
      ForestCtpDespachoDB.setOrigenes(TENANT, d.id, [{ produccionEntryId: c.id, quantity: 6 }], P),
    ).rejects.toMatchObject({ code: "I4_SOBRE_ATRIBUCION_DESPACHO" });
  }, 30_000);

  /**
   * ESCENARIO B del ADR-135 — la razón de ser de I5.
   * El agregado de I3 CUADRA (producido 16.2 − despachado 16.2 = 0) mientras
   * una corrida de 6.2 sostiene 16.2. I3 no puede verlo porque suma por
   * producto; I5 lo ve porque razona fila por fila. Es la pregunta de EUDR.
   */
  it("I5 atrapa la corrida drenada dos veces — lo que I3 no puede ver", async () => {
    const t = tipo();
    const c1 = await corrida(6.2, t);
    await corrida(10, t); // el agregado por producto cuadra gracias a ésta
    const d1 = await despacho(6.2, t);
    const d2 = await despacho(10, t);

    await ForestCtpDespachoDB.setOrigenes(TENANT, d1.id, [{ produccionEntryId: c1.id, quantity: 6.2 }], P);
    // d2 también cita c1: I3 y I4 lo dejan pasar, I5 no.
    await expect(
      ForestCtpDespachoDB.setOrigenes(TENANT, d2.id, [{ produccionEntryId: c1.id, quantity: 10 }], P),
    ).rejects.toMatchObject({ code: "I5_SOBRE_SALIDA_PRODUCCION" });
  }, 30_000);

  it("rechaza citar otro despacho como origen (orientación)", async () => {
    const t = tipo();
    await corrida(10, t);
    const d1 = await despacho(5, t);
    const d2 = await despacho(5, t);
    await expect(
      ForestCtpDespachoDB.setOrigenes(TENANT, d1.id, [{ produccionEntryId: d2.id, quantity: 5 }], P),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
  }, 30_000);

  it("rechaza mezclar productos distintos (tablones no salen de un despacho de leña)", async () => {
    const t1 = tipo();
    const c = await corrida(10, t1);
    const d = await despacho(5, tipo()); // otro producto
    await expect(
      ForestCtpDespachoDB.setOrigenes(TENANT, d.id, [{ produccionEntryId: c.id, quantity: 5 }], P),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
  }, 30_000);

  it("aguanta concurrencia: dos despachos en paralelo sobre la misma corrida", async () => {
    const t = tipo();
    const c = await corrida(10, t);
    const d1 = await despacho(10, t);
    const d2 = await despacho(10, t);

    const res = await Promise.allSettled([
      ForestCtpDespachoDB.setOrigenes(TENANT, d1.id, [{ produccionEntryId: c.id, quantity: 10 }], P),
      ForestCtpDespachoDB.setOrigenes(TENANT, d2.id, [{ produccionEntryId: c.id, quantity: 10 }], P),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  }, 30_000);

  it("trazabilidadCompleta: el libro admite huecos, el certificado no", async () => {
    const t = tipo();
    const ing = await crearIngreso(10);
    const c = await corrida(8, t);
    const d = await despacho(8, t);

    // Atribución PARCIAL → el libro la acepta…
    await ForestCtpDespachoDB.setOrigenes(TENANT, d.id, [{ produccionEntryId: c.id, quantity: 5 }], P);
    let tz = await ForestCtpDespachoDB.trazabilidadCompleta(TENANT, d.id);
    expect(tz.completa).toBe(false);
    expect(tz.motivo).toBe("atribucion_parcial");
    expect(tz.sinAtribuir).toBe(3);

    // …atribuido al 100%, pero la corrida no sabe de qué ingreso salió:
    // la cadena se corta un eslabón más atrás y el certificado mentiría igual.
    await ForestCtpDespachoDB.setOrigenes(TENANT, d.id, [{ produccionEntryId: c.id, quantity: 8 }], P);
    tz = await ForestCtpDespachoDB.trazabilidadCompleta(TENANT, d.id);
    expect(tz.completa).toBe(false);
    expect(tz.motivo).toBe("corrida_sin_origen");

    // Recién con la cadena entera (ingreso → corrida → despacho) queda completa.
    await ForestCtpConsumoDB.setConsumos(TENANT, c.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);
    tz = await ForestCtpDespachoDB.trazabilidadCompleta(TENANT, d.id);
    expect(tz.completa).toBe(true);
    expect(tz.corridas[0].guias).toContain(ing.gtfNumber);
  }, 30_000);
});

describe.skipIf(!HAS_DB)("Auditoría — quién hizo qué (Ley 29733 + SERFOR)", () => {
  /**
   * Hasta 2026-07-15 el módulo no escribía NI UNA entrada de auditoría: se podía
   * validar un ingreso o reatribuir el origen de una corrida sin dejar autor.
   * A diferencia de casi todo lo demás, esto no se puede reconstruir después.
   */
  it("registra validar, reatribuir y congelar, con autor y detalle legible", async () => {
    const user = `${P}-auditor`;
    const ing = await crearIngreso(6, 3000, "Shihuahuaco", true); // CITES marcado
    const linea = await crearLinea(6, 4);

    await WoodEntriesDB.validate(TENANT, ing.id, user);
    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 6 }], user);
    await ForestCtpConsumoDB.congelarCosto(TENANT, linea.id, user);

    // `auditCtp` es fire-and-forget a propósito (no debe frenar el write).
    await new Promise((r) => setTimeout(r, 1500));

    const logs = await prisma.activityLog.findMany({
      where: { tenantId: TENANT, user },
      select: { action: true, entity: true, detail: true },
    });
    const acciones = logs.map((l) => l.action);

    expect(acciones).toContain("ctp_ingreso_validate");
    expect(acciones).toContain("ctp_consumos_set");
    expect(acciones).toContain("ctp_costo_congelar");

    // El detalle tiene que servirle a un humano, no ser "entidad actualizada".
    const validado = logs.find((l) => l.action === "ctp_ingreso_validate");
    expect(validado?.detail).toContain(ing.gtfNumber);
    expect(validado?.detail).toContain("CITES"); // Shihuahuaco está en CITES

    // La reatribución debe decir DE QUÉ A QUÉ, no sólo "cambió".
    const atribucion = logs.find((l) => l.action === "ctp_consumos_set");
    expect(atribucion?.detail).toContain("→");
    expect(atribucion?.detail).toContain(ing.gtfNumber);

    await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user } });
  }, 30_000);

  it("un ingreso registrado tarde queda marcado como FUERA DE PLAZO en el log", async () => {
    const user = `${P}-tarde`;
    const hace60dias = new Date(Date.now() - 60 * 86_400_000);
    const w = await WoodEntriesDB.create(TENANT, {
      entryDate: hace60dias, // la operación fue hace 60 días; se registra recién ahora
      gtfNumber: `${P}-tarde`,
      providerName: `${P} proveedor`,
      speciesCommonName: "Tornillo",
      volumeM3: 1,
      createdBy: user,
    });
    woodIds.push(w.id);
    await new Promise((r) => setTimeout(r, 1500));

    const log = await prisma.activityLog.findFirst({
      where: { tenantId: TENANT, user, action: "ctp_ingreso_create" },
      select: { detail: true },
    });
    expect(log?.detail).toContain("FUERA DE PLAZO");

    await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user } });
  }, 30_000);
});

describe.skipIf(!HAS_DB)("Congelado al cierre de período (ADR-134 D8)", () => {
  it("no congela un costo que no se sabe", async () => {
    const ing = await crearIngreso(10); // sin factura
    const linea = await crearLinea(10, 8);
    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);

    await expect(ForestCtpConsumoDB.congelarCosto(TENANT, linea.id, P)).rejects.toMatchObject({
      code: "CONGELADO",
    });
  }, 30_000);

  it("congela snap + fecha juntos, y la línea queda inmutable", async () => {
    const ing = await crearIngreso(10, 4200); // S/420/m³
    const linea = await crearLinea(10, 8);
    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);

    const frozen = await ForestCtpConsumoDB.congelarCosto(TENANT, linea.id, P);
    expect(frozen.every((f) => f.costoUnitarioSnap != null && f.congeladoAt != null)).toBe(true);

    // Congelado ⇒ la atribución ya no se toca (el período ya se reportó).
    await expect(
      ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 5 }], P),
    ).rejects.toMatchObject({ code: "CONGELADO" });
  }, 30_000);

  it("el snap congelado gana sobre la factura viva (una nota de crédito no reescribe el pasado)", async () => {
    const ing = await crearIngreso(10, 4200); // S/420/m³
    const linea = await crearLinea(10, 10);
    await ForestCtpConsumoDB.setConsumos(TENANT, linea.id, [{ woodEntryId: ing.id, volumeM3: 10 }], P);
    await ForestCtpConsumoDB.congelarCosto(TENANT, linea.id, P);

    // El proveedor corrige la factura DESPUÉS del cierre.
    await prisma.woodEntry.update({ where: { id: ing.id }, data: { costoTotal: 9999 } });

    const c = await ForestCtpConsumoDB.costoDeLinea(TENANT, linea.id);
    expect(c.costoMateriaPrima).toBe(4200); // el costo con el que se reportó, no el nuevo
    expect(c.congelado).toBe(true);
  }, 30_000);
});
