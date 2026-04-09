import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";

// ── Schemas ─────────────────────────────────────────────────────────────────

const TIPOS_CONTRATO = [
  "VENTA", "SERVICIO", "TRABAJO", "PROVEEDOR",
  "DISTRIBUCION", "ALQUILER", "COMPRAVENTA", "SUMINISTRO",
] as const;

const _ESTADOS_CONTRATO = [
  "BORRADOR", "ACTIVO", "VENCIDO", "ANULADO", "RENOVADO",
] as const;

const CreateContratoSchema = z.object({
  tipo: z.enum(TIPOS_CONTRATO),
  clienteNombre: z.string().min(1, "Nombre del cliente requerido").max(200),
  clienteDoc: z.string().min(1, "Documento del cliente requerido").max(20),
  descripcion: z.string().min(1, "Descripcion requerida").max(2000),
  monto: z.number().nonnegative("Monto debe ser positivo"),
  moneda: z.enum(["PEN", "USD"]).default("PEN"),
  fecha: z.string().min(10, "Fecha requerida"),
  fechaVencimiento: z.string().optional(),
  clausulas: z.array(z.string().max(1000)).optional(),
  plantillaId: z.string().optional(),
  condiciones: z.string().max(2000).optional(),
  lugarFirma: z.string().max(200).optional(),
  // Parte 2 (contraparte de la bodega)
  parte2Nombre: z.string().max(200).optional(),
  parte2Doc: z.string().max(20).optional(),
});

// ── Plantillas disponibles (estático) ───────────────────────────────────────

const PLANTILLAS_CONTRATO = [
  {
    id: "tpl-compraventa",
    nombre: "Compraventa de Productos",
    tipo: "COMPRAVENTA",
    descripcion: "Contrato estandar de compraventa de mercancias y productos",
    clausulasDefault: [
      "DEL OBJETO: El vendedor se compromete a entregar los productos descritos al comprador.",
      "DEL PRECIO: El precio pactado es el indicado, pagadero segun las condiciones establecidas.",
      "DE LA ENTREGA: Los productos seran entregados en el lugar y fecha acordados.",
      "DE LA GARANTIA: El vendedor garantiza la calidad de los productos por 30 dias.",
      "DE LA RESOLUCION: El contrato podra resolverse por incumplimiento de cualquiera de las partes.",
    ],
  },
  {
    id: "tpl-servicio",
    nombre: "Prestacion de Servicios",
    tipo: "SERVICIO",
    descripcion: "Contrato para prestacion de servicios profesionales o tecnicos",
    clausulasDefault: [
      "DEL OBJETO: El prestador se compromete a brindar los servicios descritos.",
      "DEL PLAZO: El servicio sera prestado en el plazo indicado.",
      "DE LA RETRIBUCION: El monto acordado sera pagado segun las condiciones pactadas.",
      "DE LAS OBLIGACIONES: Ambas partes se comprometen al cumplimiento de lo estipulado.",
      "DE LA CONFIDENCIALIDAD: Las partes mantendran reserva sobre la informacion compartida.",
    ],
  },
  {
    id: "tpl-alquiler",
    nombre: "Alquiler de Local o Espacio",
    tipo: "ALQUILER",
    descripcion: "Contrato de arrendamiento de local comercial o espacio",
    clausulasDefault: [
      "DEL OBJETO: Se arrienda el inmueble/espacio descrito en las condiciones indicadas.",
      "DE LA RENTA: La renta mensual es la indicada, pagadera los primeros 5 dias de cada mes.",
      "DEL PLAZO: El arrendamiento tendra la duracion indicada, renovable por acuerdo.",
      "DEL USO: El arrendatario usara el bien exclusivamente para el fin acordado.",
      "DE LA DEVOLUCION: Al termino, el bien sera devuelto en las mismas condiciones.",
    ],
  },
  {
    id: "tpl-distribucion",
    nombre: "Distribucion de Productos",
    tipo: "DISTRIBUCION",
    descripcion: "Contrato de distribucion exclusiva o no exclusiva de productos",
    clausulasDefault: [
      "DEL OBJETO: El productor otorga derechos de distribucion al distribuidor.",
      "DEL TERRITORIO: La distribucion se limita al territorio acordado.",
      "DE LOS PRECIOS: Los precios de distribucion seran los del catalogo vigente.",
      "DEL INVENTARIO: El distribuidor mantendra un stock minimo acordado.",
      "DE LA VIGENCIA: El contrato tendra la duracion indicada con renovacion automatica.",
    ],
  },
  {
    id: "tpl-trabajo",
    nombre: "Contrato de Trabajo",
    tipo: "TRABAJO",
    descripcion: "Contrato laboral para empleados de la bodega",
    clausulasDefault: [
      "DEL OBJETO: El trabajador prestara servicios en el cargo y funciones indicadas.",
      "DE LA JORNADA: La jornada laboral sera de 8 horas diarias, 48 horas semanales.",
      "DE LA REMUNERACION: El empleador pagara la remuneracion indicada mensualmente.",
      "DE LOS BENEFICIOS: El trabajador gozara de todos los beneficios de ley.",
      "DEL PERIODO DE PRUEBA: Los primeros 3 meses constituyen periodo de prueba.",
    ],
  },
  {
    id: "tpl-proveedor",
    nombre: "Acuerdo con Proveedor",
    tipo: "PROVEEDOR",
    descripcion: "Contrato marco con proveedor para suministro recurrente",
    clausulasDefault: [
      "DEL OBJETO: El proveedor se compromete al suministro regular de los productos indicados.",
      "DE LOS PRECIOS: Los precios se mantendran estables por el periodo acordado.",
      "DE LA ENTREGA: Las entregas se realizaran segun el cronograma establecido.",
      "DE LA CALIDAD: Los productos cumpliran los estandares de calidad acordados.",
      "DE LAS PENALIDADES: El incumplimiento generara penalidades segun lo estipulado.",
    ],
  },
  {
    id: "tpl-suministro",
    nombre: "Suministro Periodico",
    tipo: "SUMINISTRO",
    descripcion: "Contrato de suministro periodico de mercaderias",
    clausulasDefault: [
      "DEL OBJETO: El suministrante se obliga a entregar periodicamente los bienes acordados.",
      "DEL PRECIO: El precio unitario sera el vigente al momento de cada entrega.",
      "DE LA PERIODICIDAD: Las entregas se realizaran con la frecuencia establecida.",
      "DE LA CANTIDAD: Las cantidades podran variar dentro del rango acordado.",
      "DE LA DURACION: El contrato tendra vigencia por el periodo indicado.",
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function generarResumen(data: z.infer<typeof CreateContratoSchema>, numero: string): string {
  const tipoLabel = data.tipo.charAt(0) + data.tipo.slice(1).toLowerCase();
  const monedaSymbol = data.moneda === "USD" ? "US$" : "S/";
  return `Contrato ${numero} de ${tipoLabel} con ${data.clienteNombre} (${data.clienteDoc}) por ${monedaSymbol}${data.monto.toFixed(2)}. ${data.descripcion.substring(0, 100)}${data.descripcion.length > 100 ? "..." : ""}`;
}

async function generarNumeroCorrelativo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CONT-${year}-`;

  // Count existing contracts for this year
  const count = await prisma.note.count({
    where: {
      tenantId,
      title: { startsWith: `CONTRATO:` },
      content: { contains: `"numero":"${prefix}` },
    },
  });

  // Also check the general count as fallback for sequential numbering
  const totalCount = await prisma.note.count({
    where: {
      tenantId,
      title: { startsWith: "CONTRATO:" },
    },
  });

  const nextNum = Math.max(count, totalCount) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// ── GET — List contracts with filters ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = req.nextUrl;
    const tipo = url.searchParams.get("tipo");
    const estado = url.searchParams.get("estado");
    const search = url.searchParams.get("search");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const plantillas = url.searchParams.get("plantillas");

    // Endpoint to list available templates
    if (plantillas === "true") {
      return NextResponse.json({ plantillas: PLANTILLAS_CONTRATO });
    }

    // Build query conditions
    const whereConditions: Record<string, unknown> = {
      tenantId: auth.tenantId,
      title: { startsWith: "CONTRATO:" },
    };

    // Date filters on the Note model's createdAt
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`);
      if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`);
      whereConditions.createdAt = dateFilter;
    }

    // Search filter: title includes the search term
    if (search?.trim()) {
      whereConditions.title = {
        startsWith: "CONTRATO:",
        contains: search.trim(),
      };
    }

    const notas = await prisma.note.findMany({
      where: whereConditions,
      orderBy: { createdAt: "desc" },
    });

    let contratos = notas
      .map((n) => {
        try {
          const data = JSON.parse(n.content);
          return {
            id: n.id,
            ...data,
            createdAt: n.createdAt.toISOString(),
            updatedAt: n.updatedAt.toISOString(),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // In-memory filters for JSON fields
    if (tipo) {
      contratos = contratos.filter(
        (c: Record<string, unknown>) => c.tipo === tipo.toUpperCase()
      );
    }
    if (estado) {
      contratos = contratos.filter(
        (c: Record<string, unknown>) => c.estado === estado.toUpperCase()
      );
    }

    // KPIs
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86_400_000);
    const kpis = {
      total: contratos.length,
      activos: contratos.filter((c: Record<string, unknown>) => c.estado === "ACTIVO").length,
      porVencer: contratos.filter((c: Record<string, unknown>) => {
        if (!c.fechaVencimiento || c.estado !== "ACTIVO") return false;
        const venc = new Date(c.fechaVencimiento as string);
        return venc > now && venc <= thirtyDaysFromNow;
      }).length,
      vencidos: contratos.filter((c: Record<string, unknown>) => c.estado === "VENCIDO").length,
      anulados: contratos.filter((c: Record<string, unknown>) => c.estado === "ANULADO").length,
      montoTotal: contratos
        .filter((c: Record<string, unknown>) => c.estado === "ACTIVO")
        .reduce((sum: number, c: Record<string, unknown>) => sum + (Number(c.monto) || 0), 0),
    };

    return NextResponse.json({ contratos, kpis });
  } catch (e) {
    console.error("[contratos] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// ── POST — Create new contract ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateContratoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    const numero = await generarNumeroCorrelativo(auth.tenantId);
    const resumen = generarResumen(data, numero);

    // If a template was referenced, load its default clauses if none provided
    let clausulas = data.clausulas ?? [];
    if (clausulas.length === 0 && data.plantillaId) {
      const plantilla = PLANTILLAS_CONTRATO.find((p) => p.id === data.plantillaId);
      if (plantilla) {
        clausulas = plantilla.clausulasDefault;
      }
    }

    const contratoData = {
      numero,
      tipo: data.tipo,
      estado: "ACTIVO" as const,
      clienteNombre: data.clienteNombre,
      clienteDoc: data.clienteDoc,
      descripcion: data.descripcion,
      monto: data.monto,
      moneda: data.moneda,
      fecha: data.fecha,
      fechaVencimiento: data.fechaVencimiento || null,
      clausulas,
      condiciones: data.condiciones || "",
      lugarFirma: data.lugarFirma || "Pucallpa",
      parte2Nombre: data.parte2Nombre || "",
      parte2Doc: data.parte2Doc || "",
      plantillaId: data.plantillaId || null,
      resumen,
      creadoPor: auth.username,
    };

    const nota = await prisma.note.create({
      data: {
        tenantId: auth.tenantId,
        title: `CONTRATO: ${numero} — ${data.tipo} — ${data.clienteNombre}`,
        content: JSON.stringify(contratoData),
        color: "blue",
        pinned: false,
      },
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: nota.id,
      detail: `Contrato ${numero} creado (${data.tipo}) para ${data.clienteNombre} por ${data.moneda === "USD" ? "US$" : "S/"}${data.monto.toFixed(2)}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(
      { id: nota.id, ...contratoData, createdAt: nota.createdAt.toISOString() },
      { status: 201 }
    );
  } catch (e) {
    console.error("[contratos] POST error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
