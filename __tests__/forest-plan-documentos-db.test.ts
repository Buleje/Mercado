/**
 * Documentos del plan de manejo (ADR-467) — REAL DB integration.
 *
 * Contra la base porque lo que importa vive en ella: el candado de `preparar`
 * (dos a la vez tienen que dejar UNA raíz), el nombre que guarda el Drive
 * (≤80: la trampa de `createFolderTree`), las etiquetas de máquina, que un
 * `archivo` no deje fila de valor, y que un `folderId` de otro negocio no entre.
 *
 * Tenant `main` (el de QA). Todo lo creado lleva `QA-456-BK-` o el usuario
 * `qa.backend.456` y se purga antes y después. De Blas sólo se LEE un id de
 * plan y uno de carpeta, para los casos multi-tenant. Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forest-plan-documentos-db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import { ForestPlanDocumentosDB, PlanDocumentosError } from "@/lib/db/forest-plan-documentos.db";
import { CamposPersonalizadosDB } from "@/lib/db/campos-personalizados.db";
import { CarpetaAjenaError, CicloDeCarpetasError, DocumentsDB } from "@/lib/db/documents.db";
import { segmentoDeCarpeta } from "@/lib/forestal/documentos-guia";
import { limaDateKey } from "@/lib/utils";
import {
  FORMULARIO_CARPETAS_PLAN,
  ROLES_LECTURA_DOCS_PLAN,
  formularioDeCarpeta,
  tagCampo,
  tagRaizPlan,
  type PlanDocumentosVista,
} from "@/lib/forestal/plan-documentos-tipos";

const TENANT = "main";
const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const USUARIO = "qa.backend.456";
const PREFIJO = "QA-456-BK-";
const P = `${PREFIJO}${Math.random().toString(36).slice(2, 7)}`;
/** 150 letras: el Drive guarda 80. */
const TITULAR = `${P} COMUNIDAD NATIVA DE PRUEBA ${"SANTA ROSA DE CHIVIS ".repeat(6)}`.trim();

/** Ids de todo el subárbol (el Drive no borra en cascada: la FK es SET NULL). */
async function subarbol(ids: string[]): Promise<string[]> {
  const todos = new Set(ids);
  let frente = ids;
  while (frente.length > 0) {
    const hijas = await prisma.documentFolder.findMany({
      where: { tenantId: TENANT, parentId: { in: frente } },
      select: { id: true },
    });
    frente = hijas.map((h) => h.id).filter((id) => !todos.has(id));
    frente.forEach((id) => todos.add(id));
  }
  return [...todos];
}

async function purgar() {
  const planes = await prisma.forestPlan.findMany({
    where: { tenantId: TENANT, createdBy: USUARIO },
    select: { id: true },
  });
  const raices = planes.length
    ? await prisma.documentFolder.findMany({
        where: { tenantId: TENANT, OR: planes.map((p) => ({ tags: { has: tagRaizPlan(p.id) } })) },
        select: { id: true },
      })
    : [];
  const titulares = await prisma.documentFolder.findMany({
    where: { tenantId: TENANT, name: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const carpetas = await subarbol([...raices, ...titulares].map((f) => f.id));
  const docs = await prisma.document.findMany({
    where: { tenantId: TENANT, OR: [{ folderId: { in: carpetas } }, { name: { startsWith: PREFIJO } }] },
    select: { id: true },
  });
  const docIds = docs.map((d) => d.id);
  if (docIds.length) {
    await prisma.documentAuditLog.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.document.deleteMany({ where: { tenantId: TENANT, id: { in: docIds } } });
  }
  if (carpetas.length) await prisma.documentFolder.deleteMany({ where: { tenantId: TENANT, id: { in: carpetas } } });

  const campos = await prisma.campoPersonalizado.findMany({
    where: { tenantId: TENANT, createdBy: USUARIO },
    select: { id: true },
  });
  if (campos.length) {
    await prisma.campoPersonalizadoValor.deleteMany({ where: { tenantId: TENANT, campoId: { in: campos.map((c) => c.id) } } });
    await prisma.campoPersonalizado.deleteMany({ where: { tenantId: TENANT, id: { in: campos.map((c) => c.id) } } });
  }
  await prisma.activityLog.deleteMany({ where: { tenantId: TENANT, user: USUARIO } });
  await prisma.forestPlan.deleteMany({ where: { tenantId: TENANT, createdBy: USUARIO } });

  /* `Libro TH` sólo si quedó VACÍA, y bajo el mismo candado que `preparar`:
     otro agente puede estar usándola en `main`. */
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-documentos:${TENANT}`}))`;
    const libros = await tx.documentFolder.findMany({
      where: { tenantId: TENANT, parentId: null, name: "Libro TH" },
      select: { id: true, _count: { select: { children: true, documents: true } } },
    });
    const vacias = libros.filter((l) => l._count.children === 0 && l._count.documents === 0).map((l) => l.id);
    if (vacias.length) await tx.documentFolder.deleteMany({ where: { tenantId: TENANT, id: { in: vacias } } });
  });
}

/* Top-level await (NO beforeAll): `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => prisma.forestPlan.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

const planes: { p0: string; p1: string; p2: string; p3: string } = { p0: "", p1: "", p2: "", p3: "" };
let blasPlanId = "";
let blasFolderId = "";

async function nuevoPlan(planNumber: string, titularName = TITULAR): Promise<string> {
  const p = await prisma.forestPlan.create({
    data: { tenantId: TENANT, planType: "PLANTACION", planNumber, titularName, createdBy: USUARIO },
    select: { id: true },
  });
  return p.id;
}

async function raizDe(planId: string) {
  return prisma.documentFolder.findMany({
    where: { tenantId: TENANT, tags: { has: tagRaizPlan(planId) } },
    select: { id: true, parentId: true, name: true },
  });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await purgar();
  // p0: OTRO titular. Se prepara primero, solo, para que la semilla y «Libro TH»
  // ya existan cuando corren los tres a la vez: si no, el índice único de la
  // semilla pone las transacciones en fila y la carrera no se ve (medido con el
  // mutante sin candado: pasaba igual).
  planes.p0 = await nuevoPlan(`${P}/REG-PLT-0`, `${P} OTRO TITULAR`);
  planes.p1 = await nuevoPlan(`${P}/REG-PLT-1`);
  planes.p2 = await nuevoPlan(`${P}/REG-PLT-2`);
  // Mismo titular Y mismo N° que p1: tiene que quedar en otra carpeta.
  planes.p3 = await nuevoPlan(`${P}/REG-PLT-1`);
  // Sólo lectura de Blas: los ids para los casos de «otro negocio».
  blasPlanId = (await prisma.forestPlan.findFirst({ where: { tenantId: BLAS }, select: { id: true } }))?.id ?? "";
  blasFolderId = (await prisma.documentFolder.findFirst({ where: { tenantId: BLAS }, select: { id: true } }))?.id ?? "";
}, 120_000);

afterAll(async () => {
  if (!HAS_DB) return;
  await purgar();
  const quedan = await prisma.forestPlan.count({ where: { tenantId: TENANT, createdBy: USUARIO } });
  const carpetas = await prisma.documentFolder.count({ where: { tenantId: TENANT, name: { startsWith: PREFIJO } } });
  const campos = await prisma.campoPersonalizado.count({ where: { tenantId: TENANT, createdBy: USUARIO } });
  expect({ quedan, carpetas, campos }).toEqual({ quedan: 0, carpetas: 0, campos: 0 });
}, 120_000);

describe.skipIf(!HAS_DB)("ForestPlanDocumentosDB (base real, tenant main)", () => {
  let v1: PlanDocumentosVista;

  it("preparar el mismo plan dos veces A LA VEZ (y otro del mismo titular) deja UNA raíz por plan", async () => {
    await ForestPlanDocumentosDB.preparar(TENANT, planes.p0, USUARIO);
    const [a, b] = await Promise.all([
      ForestPlanDocumentosDB.preparar(TENANT, planes.p1, USUARIO),
      ForestPlanDocumentosDB.preparar(TENANT, planes.p1, USUARIO),
      ForestPlanDocumentosDB.preparar(TENANT, planes.p2, USUARIO),
    ]);
    expect(a.carpetaRaizId).toBe(b.carpetaRaizId);
    expect(await raizDe(planes.p1)).toHaveLength(1);
    expect(await raizDe(planes.p2)).toHaveLength(1);
    v1 = a;
    expect(v1.preparada).toBe(true);

    // Una subcarpeta por carpeta de la plantilla, ninguna repetida.
    const hijas = await prisma.documentFolder.findMany({
      where: { tenantId: TENANT, parentId: v1.carpetaRaizId },
      select: { tags: true, allowedRoles: true },
    });
    const claves = hijas.flatMap((h) => h.tags.filter((t) => t.startsWith("plan-carpeta:")));
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves).toEqual(expect.arrayContaining(["plan-carpeta:resolucion", "plan-carpeta:jefe", "plan-carpeta:titulos", "plan-carpeta:otros"]));
    // El Drive restringe por la carpeta DIRECTA: cada subcarpeta lleva los roles.
    for (const h of hijas) expect([...h.allowedRoles].sort()).toEqual([...ROLES_LECTURA_DOCS_PLAN].sort());
  }, 120_000);

  it("dos planes del mismo titular comparten UNA carpeta de titular y UN «Libro TH»", async () => {
    const [r1] = await raizDe(planes.p1);
    const [r2] = await raizDe(planes.p2);
    expect(r1.parentId).toBe(r2.parentId);
    const titular = await prisma.documentFolder.findFirst({
      where: { tenantId: TENANT, id: r1.parentId ?? "" },
      select: { name: true, parentId: true },
    });
    const libros = await prisma.documentFolder.count({ where: { tenantId: TENANT, parentId: null, name: "Libro TH" } });
    expect(libros).toBe(1);
    expect(v1.rutaRaiz).toBe(`Libro TH/${titular?.name}/${r1.name}`);
    expect(r1.name).toBe(`${P}-REG-PLT-1`); // la `/` del N° no abrió otra carpeta
  }, 60_000);

  it("titular de 150 letras: la carpeta se llama con 80 y NO se duplica al volver a preparar", async () => {
    const nombre = segmentoDeCarpeta(TITULAR);
    expect(nombre.length).toBeLessThanOrEqual(80);
    const antes = await prisma.documentFolder.count({ where: { tenantId: TENANT, name: { startsWith: P } } });
    // Alguien le borró la etiqueta a la raíz: se reconoce por el camino y se re-etiqueta.
    const [r1] = await raizDe(planes.p1);
    await prisma.documentFolder.update({ where: { id: r1.id }, data: { tags: [] } });
    const v = await ForestPlanDocumentosDB.preparar(TENANT, planes.p1, USUARIO);
    expect(v.carpetaRaizId).toBe(r1.id);
    const despues = await prisma.documentFolder.count({ where: { tenantId: TENANT, name: { startsWith: P } } });
    expect(despues).toBe(antes);
    expect(await prisma.documentFolder.count({ where: { tenantId: TENANT, name: nombre } })).toBe(1);
  }, 120_000);

  it("otro plan con el mismo titular y el mismo N° no se mete en la carpeta del primero", async () => {
    const v3 = await ForestPlanDocumentosDB.preparar(TENANT, planes.p3, USUARIO);
    const [r1] = await raizDe(planes.p1);
    expect(v3.carpetaRaizId).not.toBe(r1.id);
    expect(v3.rutaRaiz.endsWith(planes.p3.slice(-6))).toBe(true);
  }, 120_000);

  it("la plantilla se sembró UNA vez para el negocio", async () => {
    const jefe = await prisma.campoPersonalizado.count({
      where: { tenantId: TENANT, formulario: FORMULARIO_CARPETAS_PLAN, clave: "jefe", deletedAt: null, soloParaRegistroId: null },
    });
    expect(jefe).toBe(1);
  }, 60_000);

  describe("lo que falta, con vencimientos", () => {
    const hoy = limaDateKey();
    const masDias = (n: number) =>
      new Date(Date.parse(`${hoy}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const ids: { dni: string; poder: string; acta: string; carpetaJefe: string; suelto: string } = {
      dni: "",
      poder: "",
      acta: "",
      carpetaJefe: "",
      suelto: "",
    };

    it("un casillero por vencer, uno vencido y uno que falta; el resumen los cuenta", async () => {
      // Casilleros PROPIOS (temporales de p1): no dependen de lo que otro agente haga con la semilla.
      const crear = (nombre: string) =>
        CamposPersonalizadosDB.crear(
          TENANT,
          { formulario: formularioDeCarpeta("jefe"), nombre: `${P} ${nombre}`, tipo: "archivo", soloParaRegistroId: planes.p1 },
          USUARIO,
        );
      ids.dni = (await crear("DNI")).id;
      ids.poder = (await crear("Poder")).id;
      ids.acta = (await crear("Acta")).id;
      const v = (await ForestPlanDocumentosDB.vista(TENANT, planes.p1)) as PlanDocumentosVista;
      ids.carpetaJefe = v.carpetas.find((c) => c.clave === "jefe")?.folderId ?? "";
      expect(ids.carpetaJefe).not.toBe("");

      const doc = (nombre: string, tags: string[], vence: string | null) =>
        prisma.document.create({
          data: {
            tenantId: TENANT,
            folderId: ids.carpetaJefe,
            name: `${P}-${nombre}.pdf`,
            originalName: `${nombre}.pdf`,
            mimeType: "application/pdf",
            size: 1234,
            storagePath: "qa-test/sin-archivo",
            tags,
            expiresAt: vence ? new Date(`${vence}T00:00:00.000Z`) : null,
            uploadedById: USUARIO,
          },
          select: { id: true },
        });
      await doc("dni", [tagCampo(ids.dni)], masDias(10));
      await doc("poder", [tagCampo(ids.poder)], masDias(-1));
      ids.suelto = (await doc("suelto", ["pdf"], null)).id;

      const vista = (await ForestPlanDocumentosDB.vista(TENANT, planes.p1)) as PlanDocumentosVista;
      const casillero = (id: string) => vista.carpetas.flatMap((c) => c.casilleros).find((x) => x.campo.id === id);
      expect(casillero(ids.dni)).toMatchObject({ estado: "vence_pronto", campo: { tipo: "archivo" } });
      expect(casillero(ids.dni)?.venceEl?.slice(0, 10)).toBe(masDias(10));
      expect(casillero(ids.poder)?.estado).toBe("vencido");
      expect(casillero(ids.acta)).toMatchObject({ estado: "falta", archivos: [] });
      expect(vista.carpetas.find((c) => c.clave === "jefe")?.sueltos.map((s) => s.documentId)).toContain(ids.suelto);

      // El resumen es la cuenta de los casilleros, no un número aparte.
      const todos = vista.carpetas.flatMap((c) => c.casilleros);
      expect(vista.resumen).toEqual({
        esperados: todos.length,
        cargados: todos.filter((c) => c.estado !== "falta").length,
        faltan: todos.filter((c) => c.estado === "falta").length,
        vencenPronto: todos.filter((c) => c.estado === "vence_pronto").length,
        vencidos: todos.filter((c) => c.estado === "vencido").length,
      });
      expect(vista.resumen.vencenPronto).toBeGreaterThanOrEqual(1);
      expect(vista.resumen.vencidos).toBeGreaterThanOrEqual(1);

      // Los temporales de p1 no aparecen en p2.
      const v2 = (await ForestPlanDocumentosDB.vista(TENANT, planes.p2)) as PlanDocumentosVista;
      expect(v2.carpetas.flatMap((c) => c.casilleros).some((c) => c.campo.id === ids.dni)).toBe(false);

      // `expiresAt` es el dato del Drive: entra solo a «Por vencer» (ADR-119).
      const porVencer = await DocumentsDB.listExpiring(TENANT, 30);
      expect(porVencer.map((d) => d.name)).toEqual(expect.arrayContaining([`${P}-dni.pdf`, `${P}-poder.pdf`]));
    }, 120_000);

    it("vincular mete el suelto en su casillero; con null lo saca", async () => {
      const dentro = await ForestPlanDocumentosDB.vincularArchivo(
        TENANT,
        { planId: planes.p1, documentId: ids.suelto, campoId: ids.acta },
        USUARIO,
      );
      const acta = dentro.carpetas.flatMap((c) => c.casilleros).find((c) => c.campo.id === ids.acta);
      expect(acta?.estado).toBe("cargado");
      expect(acta?.archivos.map((a) => a.documentId)).toEqual([ids.suelto]);

      const fuera = await ForestPlanDocumentosDB.vincularArchivo(
        TENANT,
        { planId: planes.p1, documentId: ids.suelto, campoId: null },
        USUARIO,
      );
      expect(fuera.carpetas.flatMap((c) => c.casilleros).find((c) => c.campo.id === ids.acta)?.estado).toBe("falta");
      const doc = await prisma.document.findFirst({ where: { id: ids.suelto }, select: { tags: true } });
      expect(doc?.tags.some((t) => t.startsWith("campo:"))).toBe(false);
    }, 120_000);

    it("un casillero `archivo` NUNCA se guarda como texto y el formulario lo devuelve con su tipo", async () => {
      const r = await CamposPersonalizadosDB.guardarValores(
        TENANT,
        planes.p1,
        [{ campoId: ids.dni, valor: "41234567" }],
        USUARIO,
      );
      expect(r).toMatchObject({ guardados: 0, ignorados: 1 });
      expect(await prisma.campoPersonalizadoValor.count({ where: { tenantId: TENANT, campoId: ids.dni } })).toBe(0);

      const campos = await CamposPersonalizadosDB.listar(TENANT, formularioDeCarpeta("jefe"), planes.p1);
      expect(campos.find((c) => c.id === ids.dni)?.tipo).toBe("archivo");
    }, 60_000);
  });

  it("una carpeta sólo de este plan: aparece acá, no en el otro, y repetida da 409", async () => {
    const nombre = `${P} Fotos del predio`;
    const v = await ForestPlanDocumentosDB.crearCarpeta(
      TENANT,
      { planId: planes.p1, nombre, paraTodosLosPlanes: false },
      USUARIO,
    );
    const nueva = v.carpetas.find((c) => c.nombre === nombre);
    expect(nueva).toMatchObject({ soloEstePlan: true });
    expect(nueva?.folderId).toBeTruthy();
    const v2 = (await ForestPlanDocumentosDB.vista(TENANT, planes.p2)) as PlanDocumentosVista;
    expect(v2.carpetas.some((c) => c.nombre === nombre)).toBe(false);
    await expect(
      ForestPlanDocumentosDB.crearCarpeta(TENANT, { planId: planes.p1, nombre, paraTodosLosPlanes: false }, USUARIO),
    ).rejects.toMatchObject({ codigo: "carpeta_repetida", status: 409 });
  }, 120_000);

  it("otro negocio: su plan no existe acá (vista null, preparar 404) y su documento tampoco", async () => {
    expect(blasPlanId).not.toBe("");
    expect(await ForestPlanDocumentosDB.vista(TENANT, blasPlanId)).toBeNull();
    const err = await ForestPlanDocumentosDB.preparar(TENANT, blasPlanId, USUARIO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanDocumentosError);
    expect(err).toMatchObject({ status: 404, codigo: "plan_no_encontrado" });
    expect(await raizDe(blasPlanId)).toHaveLength(0); // y no dejó carpetas en main
  }, 60_000);

  it("IDOR: un documento de main no se crea ni se mueve a una carpeta de Blas", async () => {
    expect(blasFolderId).not.toBe("");
    const antes = await prisma.document.count({ where: { folderId: blasFolderId } });
    await expect(
      DocumentsDB.create(TENANT, {
        folderId: blasFolderId,
        name: `${P}-idor.pdf`,
        originalName: "idor.pdf",
        mimeType: "application/pdf",
        size: 1,
        storagePath: "pending",
        uploadedById: USUARIO,
      }),
    ).rejects.toBeInstanceOf(CarpetaAjenaError);
    expect(await prisma.document.count({ where: { tenantId: TENANT, name: `${P}-idor.pdf` } })).toBe(0);

    // Con una carpeta propia sí entra; moverlo a la de Blas no.
    const propia = await DocumentsDB.create(TENANT, {
      folderId: v1.carpetaRaizId,
      name: `${P}-propio.pdf`,
      originalName: "propio.pdf",
      mimeType: "application/pdf",
      size: 1,
      storagePath: "pending",
      uploadedById: USUARIO,
    });
    expect(await DocumentsDB.update(TENANT, propia.id, { folderId: blasFolderId })).toBeNull();
    expect(await DocumentsDB.bulkMove(TENANT, [propia.id], blasFolderId)).toBe(0);
    expect((await prisma.document.findFirst({ where: { id: propia.id }, select: { folderId: true } }))?.folderId).toBe(
      v1.carpetaRaizId,
    );
    expect(await prisma.document.count({ where: { folderId: blasFolderId } })).toBe(antes);
  }, 60_000);

  it("IDOR de carpetas: ni crear ni mover bajo una carpeta de Blas; y sin ciclos (el CTE contra Postgres)", async () => {
    const raiz = v1.carpetaRaizId ?? "";
    const hija = v1.carpetas.find((c) => c.clave === "jefe")?.folderId ?? "";
    expect(raiz && hija).toBeTruthy();
    const hijasDeBlas = await prisma.documentFolder.count({ where: { parentId: blasFolderId } });

    await expect(DocumentsDB.createFolder(TENANT, { name: `${P}-colada`, parentId: blasFolderId })).rejects.toBeInstanceOf(
      CarpetaAjenaError,
    );
    expect(await prisma.documentFolder.count({ where: { name: `${P}-colada` } })).toBe(0);

    const nieta = await DocumentsDB.createFolder(TENANT, { name: `${P}-nieta`, parentId: hija });
    await expect(DocumentsDB.updateFolder(TENANT, raiz, { parentId: blasFolderId })).rejects.toBeInstanceOf(CarpetaAjenaError);
    // La raíz del plan adentro de su propia nieta: raíz → jefe → nieta.
    await expect(DocumentsDB.updateFolder(TENANT, raiz, { parentId: nieta.id })).rejects.toBeInstanceOf(CicloDeCarpetasError);
    const [sigue] = await raizDe(planes.p1);
    expect(sigue.parentId).not.toBe(nieta.id);

    // Un movimiento legítimo pasa por el mismo candado y el mismo CTE.
    const movida = await DocumentsDB.updateFolder(TENANT, nieta.id, { parentId: raiz });
    expect(movida?.parentId).toBe(raiz);
    expect(await prisma.documentFolder.count({ where: { parentId: blasFolderId } })).toBe(hijasDeBlas);
  }, 60_000);
});
