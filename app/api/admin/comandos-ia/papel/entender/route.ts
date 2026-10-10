/**
 * POST /api/admin/comandos-ia/papel/entender — «Lee un papel» (Comandos IA).
 *
 * Recibe el TEXTO de un papel (lo leyó el OCR del navegador o la persona lo
 * pegó) y devuelve qué es y qué haría la IA con él. Sólo LEE: guardar pasa por
 * la vista previa del panel y los endpoints de siempre (compras, fiados, drive).
 *
 * Reglas primero (`lib/admin/comandos-ia/papel.ts`); la IA de texto (`llamarIa`
 * cheap) sólo si las reglas no deciden o no encuentran los ítems, con el tope
 * del plan (`aiCostGuard`). Al LLM nunca van celulares, DNI ni RUC (Ley 29733)
 * y el texto no se guarda.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { estimadoIaUsd, llamarIa } from "@/lib/admin/comandos-ia/ia-llamada";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { estadoLectorIA } from "@/lib/ai/vision-extract";
import { ProductsDB } from "@/lib/db/products.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { FiadosDB } from "@/lib/db/fiados.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { logger } from "@/lib/logger";
import {
  camposConReglas,
  camposDesdeIA,
  candidatosDeCobro,
  detectarTipo,
  emparejar,
  faltaIA,
  INSTRUCCION_IA,
  jsonDeRespuesta,
  puedeGuardar,
  PUNTAJE_SEGURO,
  quitarDatosPersonales,
  RespuestaIASchema,
  type CamposFactura,
  type CamposLista,
  type CamposPorTipo,
  type CamposYape,
  type FichaPagador,
  type ProductoSugerido,
  type PropuestaPapel,
  type RespuestaEntender,
  type TipoPapel,
} from "@/lib/admin/comandos-ia/papel";

const MAX_TOKENS_RESPUESTA = 900;
const MAX_TEXTO_A_LA_IA = 6000;

const BodySchema = z.object({
  texto: z.string().trim().min(3, "El papel no trae texto.").max(12_000, "El texto pasa de 12 000 caracteres."),
  nombreArchivo: z.string().trim().max(200).optional(),
});

type Catalogo = Array<{ id: number; nombre: string; stock: number | null; costo: number | null; unidad: string }>;

function sugerido(p: Catalogo[number], puntaje: number): ProductoSugerido {
  return { id: p.id, nombre: p.nombre, stock: p.stock, costo: p.costo, unidad: p.unidad, puntaje };
}

function emparejarProducto(nombre: string, catalogo: Catalogo) {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const top = emparejar(nombre, catalogo, 4).map((c) => sugerido(porId.get(c.id)!, c.puntaje));
  const producto = top[0] && top[0].puntaje >= PUNTAJE_SEGURO ? top[0] : null;
  return { producto, alternativas: top };
}

async function catalogo(tenantId: string): Promise<Catalogo> {
  const productos = await ProductsDB.getAll(tenantId);
  return productos
    .filter((p) => p.active !== false)
    .map((p) => ({ id: p.id, nombre: p.name, stock: p.stock ?? null, costo: p.costPrice ?? null, unidad: p.unit ?? "" }));
}

async function propuestaCompra(tenantId: string, c: CamposFactura): Promise<PropuestaPapel> {
  const [productos, proveedores] = await Promise.all([catalogo(tenantId), SuppliersDB.getAll(tenantId)]);
  const ruc = c.proveedor.ruc;
  const porRuc = ruc ? proveedores.find((s) => s.ruc === ruc || s.documento === ruc) : undefined;
  const porNombre = !porRuc && c.proveedor.nombre
    ? emparejar(c.proveedor.nombre, proveedores.map((s) => ({ id: s.id, nombre: s.name })), 1).find((s) => s.puntaje >= 0.6)
    : undefined;
  const elegido = porRuc ?? (porNombre ? proveedores.find((s) => s.id === porNombre.id) : undefined);
  return {
    destino: "compra",
    proveedor: { supplierId: elegido?.id ?? null, nombre: elegido?.name ?? c.proveedor.nombre ?? "", ruc },
    filas: c.items.map((i) => ({ ...i, ...emparejarProducto(i.nombre, productos) })),
  };
}

/** Quién pagó: sólo para quien cobra fiados (el resto recibe la lista vacía, como en GET /api/fiados). */
async function propuestaCobro(tenantId: string, c: CamposYape): Promise<PropuestaPapel> {
  const [activos, vencidos, clientes] = await Promise.all([
    FiadosDB.list(tenantId, { status: "ACTIVO" }),
    FiadosDB.list(tenantId, { status: "VENCIDO" }),
    CustomersDB.getAll(tenantId),
  ]);
  const deuda = new Map<string, { nombre: string; saldo: number }>();
  for (const f of [...activos, ...vencidos]) {
    const prev = deuda.get(f.customerId);
    deuda.set(f.customerId, { nombre: prev?.nombre ?? f.customerName ?? f.customerId, saldo: (prev?.saldo ?? 0) + f.saldo });
  }
  const nombres = new Map(clientes.map((cl) => [cl.phone, cl.name]));
  const fichas: FichaPagador[] = [...new Set([...deuda.keys(), ...nombres.keys()])].map((tel) => ({
    telefono: tel,
    nombre: nombres.get(tel) || deuda.get(tel)?.nombre || "",
    saldo: deuda.get(tel)?.saldo ?? 0,
    conDeuda: deuda.has(tel),
  }));
  return { destino: "cobro", candidatos: candidatosDeCobro(c, fichas) };
}

async function propuestaPrecios(tenantId: string, c: CamposLista): Promise<PropuestaPapel> {
  const productos = await catalogo(tenantId);
  return { destino: "precios", filas: c.filas.map((f) => ({ ...f, producto: emparejarProducto(f.nombre, productos).producto })) };
}

const AVISO_SIN_IA: Record<"sin-clave" | "tardo" | "fallo", string> = {
  "sin-clave": "No hay IA conectada: lo leí solo con reglas, revisa a mano.",
  tardo: "La IA tardó demasiado: lo leí solo con reglas, revisa a mano.",
  fallo: "La IA no respondió: lo leí solo con reglas, revisa a mano.",
};

/**
 * La IA de texto, con tope del plan y tope de espera (`llamarIa`, 25 s: lo mismo
 * que Mensajes). Devuelve `ia: null` si no entra (sin tope, sin clave, tardó, JSON inválido).
 */
async function preguntarIA(tenantId: string, texto: string): Promise<{ ia: z.infer<typeof RespuestaIASchema> | null; costo: number; aviso: string | null }> {
  const contenido = quitarDatosPersonales(texto).slice(0, MAX_TEXTO_A_LA_IA);
  const estimado = estimadoIaUsd("cheap", Math.ceil(contenido.length / 3), MAX_TOKENS_RESPUESTA);
  if (!(await aiCostGuard.canSpend(tenantId, estimado))) {
    return { ia: null, costo: 0, aviso: "Se acabó el tope de IA de este mes: lo leí solo con reglas." };
  }
  const r = await llamarIa(tenantId, "cheap", {
    messages: [
      { role: "system", content: INSTRUCCION_IA },
      { role: "user", content: contenido },
    ],
    temperature: 0,
    maxTokens: MAX_TOKENS_RESPUESTA,
    label: "comandos-ia:papel",
  }, "comandos-ia/papel");
  if (!r.ok) return { ia: null, costo: 0, aviso: AVISO_SIN_IA[r.motivo] };
  const costo = Math.round(r.costoIaUsd * 1_000_000) / 1_000_000;
  const parsed = r.res.content ? RespuestaIASchema.safeParse(jsonDeRespuesta(r.res.content)) : null;
  if (!parsed?.success) return { ia: null, costo, aviso: "La IA no devolvió algo legible: revisa a mano." };
  return { ia: parsed.data, costo, aviso: null };
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comandos-ia-papel");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const raw: unknown = await req.json().catch(() => null);
  const body = BodySchema.safeParse(raw);
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { texto } = body.data;

  try {
    const decision = detectarTipo(texto);
    let tipo: TipoPapel = decision.tipo ?? "otro";
    let confianza = decision.confianza;
    let campos: CamposPorTipo[TipoPapel] = camposConReglas(tipo, texto);
    let costoIaUsd = 0;
    let aviso: string | null = null;

    if (decision.tipo === null || faltaIA(tipo, campos)) {
      const r = await preguntarIA(tenantId, texto);
      costoIaUsd = r.costo;
      aviso = r.aviso;
      if (r.ia) {
        if (decision.tipo === null) {
          tipo = r.ia.tipo;
          confianza = tipo === "otro" ? 0.4 : 0.6;
          campos = camposDesdeIA(tipo, r.ia, tipo === "otro" ? null : camposConReglas(tipo, texto));
        } else {
          campos = camposDesdeIA(tipo, r.ia, campos);
        }
      } else if (decision.tipo === null) {
        confianza = 0.2;
      }
    }

    let propuesta: PropuestaPapel;
    if (tipo === "factura") propuesta = await propuestaCompra(tenantId, campos as CamposFactura);
    else if (tipo === "yape") {
      propuesta = puedeGuardar(auth.role, "cobro")
        ? await propuestaCobro(tenantId, campos as CamposYape)
        : { destino: "cobro", candidatos: [] };
    }
    else if (tipo === "lista-precios") propuesta = await propuestaPrecios(tenantId, campos as CamposLista);
    else propuesta = { destino: "documento", nombreSugerido: body.data.nombreArchivo || (campos as { titulo: string | null }).titulo || "Papel leído" };

    const respuesta: RespuestaEntender = {
      tipo,
      confianza,
      campos,
      propuesta,
      costoIaUsd,
      visionDisponible: estadoLectorIA().activo,
      aviso,
    };
    return NextResponse.json(respuesta);
  } catch (err) {
    logger.error("[comandos-ia/papel] entender falló", { tenantId, err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "No pude leer el papel. Intenta de nuevo." }, { status: 500 });
  }
}
