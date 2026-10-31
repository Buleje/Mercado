import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { VinculosCarpetaDB } from "@/lib/db/vinculos-carpeta.db";
import { logger } from "@/lib/logger";
import {
  TIPOS_TERCERO, claveVinculo, leerVinculo, nombreDeOtro, vinculosDeCarpeta,
  type NombreTercero, type TipoTercero,
} from "@/lib/documentos/terceros-vinculo";

/**
 * GET /api/admin/documents/terceros — lo que la pestaña «Terceros» del Archivo
 * no puede saber sola (las carpetas y los papeles ya los trae el Archivo).
 *
 * - Sin `buscar`: `{ nombres, uso }`. `nombres` = el nombre de cada tercero
 *   vinculado a una carpeta que el rol ve (la etiqueta guarda sólo el id).
 *   `uso` = aperturas de los últimos 90 días por carpeta («lo más usado»).
 *   Cada nombre trae su `alias` si el negocio le puso uno («Vínculos con el
 *   sistema…»). `solo=nombres` no calcula `uso` (las marcas del árbol).
 * - Con `buscar` (+ `tipo`): candidatos para «Vínculos con el sistema…». Sólo
 *   dueño/admin: son los que pueden etiquetar carpetas (`folders/bulk`).
 *
 * Vincular y desvincular NO pasan por acá: son etiquetas de la carpeta y van
 * por `folders/bulk` (addTags/removeTags), que ya valida rol, CSRF y tope.
 */

const Query = z.object({
  buscar: z.string().trim().max(80).optional(),
  tipo: z.enum(TIPOS_TERCERO).optional(),
  solo: z.literal("nombres").optional(),
});

const TOPE_NOMBRES = 150;
const TOPE_CANDIDATOS = 20;

/** Los que ven DNI/RUC/teléfono del tercero (como en sus fichas). */
const ROLES_VEN_DETALLE = new Set(["admin", "owner", "manager"]);
const NOMBRES_A_LA_VEZ = 5;

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

interface Candidato extends NombreTercero {
  tipo: TipoTercero;
  id: string;
  clave: string;
}

async function nombreDe(tenantId: string, tipo: TipoTercero, id: string): Promise<NombreTercero | null> {
  switch (tipo) {
    case "persona": {
      const b = await AdelantosDB.getBeneficiario(tenantId, id);
      return b ? { nombre: b.nombre, detalle: b.documento ?? null } : null;
    }
    case "proveedor": {
      const s = await SuppliersDB.getById(tenantId, id);
      return s ? { nombre: s.name, detalle: s.ruc ? `RUC ${s.ruc}` : null } : null;
    }
    case "cliente": {
      const c = await CustomersDB.getByPhone(id, tenantId);
      return c ? { nombre: c.name || id, detalle: c.phone } : null;
    }
    case "colaborador": {
      const c = await ColaboradoresDB.obtener(tenantId, id);
      return c ? { nombre: c.nombre, detalle: c.documento ?? null } : null;
    }
    case "comunidad": {
      const p = await ForestDirectorioDB.getParte(tenantId, id);
      return p ? { nombre: p.nombre, detalle: p.docNumero ? `${p.docTipo ?? "Doc."} ${p.docNumero}` : null } : null;
    }
    case "otro":
      return { nombre: nombreDeOtro(id), detalle: null };
  }
}

async function candidatos(tenantId: string, tipo: TipoTercero, q: string): Promise<Candidato[]> {
  const aguja = sinTildes(q);
  const coincide = (...campos: (string | null | undefined)[]) => !aguja || sinTildes(campos.filter(Boolean).join(" ")).includes(aguja);
  const armar = (id: string, nombre: string, detalle: string | null): Candidato => ({ tipo, id, nombre, detalle, clave: claveVinculo(tipo, id) });
  switch (tipo) {
    case "persona":
      return (await AdelantosDB.listBeneficiarios(tenantId))
        .filter((b) => coincide(b.nombre, b.documento, b.telefono))
        .slice(0, TOPE_CANDIDATOS)
        .map((b) => armar(b.id, b.nombre, b.documento ?? null));
    case "proveedor":
      return (await SuppliersDB.getAll(tenantId))
        .filter((s) => coincide(s.name, s.ruc))
        .slice(0, TOPE_CANDIDATOS)
        .map((s) => armar(s.id, s.name, s.ruc ? `RUC ${s.ruc}` : null));
    case "cliente":
      return (await CustomersDB.getAll(tenantId, 2000))
        .filter((c) => coincide(c.name, c.phone))
        .slice(0, TOPE_CANDIDATOS)
        .map((c) => armar(c.phone, c.name || c.phone, c.phone));
    case "colaborador":
      return (await ColaboradoresDB.listar(tenantId, { q: q || undefined }))
        .slice(0, TOPE_CANDIDATOS)
        .map((c) => armar(c.id, c.nombre, c.documento ?? null));
    case "comunidad":
      return (await ForestDirectorioDB.listarPartes(tenantId, { q: q || undefined }))
        .slice(0, TOPE_CANDIDATOS)
        .map((p) => armar(p.id, p.nombre, p.docNumero ? `${p.docTipo ?? "Doc."} ${p.docNumero}` : null));
    case "otro":
      return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "documents:terceros");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;

    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({ buscar: sp.get("buscar") ?? undefined, tipo: sp.get("tipo") ?? undefined, solo: sp.get("solo") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const { buscar, tipo, solo } = parsed.data;

    if (buscar !== undefined) {
      const auth = await requireAdmin(req, ["admin", "owner"]);
      if (auth instanceof NextResponse) return auth;
      if (!tipo) return NextResponse.json({ error: "Elige el tipo de tercero." }, { status: 400 });
      return NextResponse.json({ candidatos: await candidatos(auth.tenantId, tipo, buscar) });
    }

    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    // Sólo las carpetas que el rol ve: de una carpeta escondida no se dice ni a quién está vinculada.
    const [carpetas, uso] = await Promise.all([
      DocumentsDB.listFolders(auth.tenantId, auth.role),
      solo === "nombres" ? Promise.resolve({}) : DocumentsDB.vistasPorCarpeta(auth.tenantId, 90, auth.role),
    ]);
    const claves = [...new Set(carpetas.flatMap((c) => vinculosDeCarpeta(c)))].slice(0, TOPE_NOMBRES);
    const alias = await VinculosCarpetaDB.aliasDe(auth.tenantId, claves);
    // DNI, RUC o teléfono sólo para quien gestiona: el cajero ve la carpeta, no el documento del colaborador.
    const veDetalle = ROLES_VEN_DETALLE.has(auth.role);
    const leerUno = async (clave: string) => {
      const v = leerVinculo(clave);
      if (!v) return null;
      try {
        const n = await nombreDe(auth.tenantId, v.tipo, v.id);
        // Sin ficha pero con alias: el negocio igual lo reconoce por su nombre.
        if (!n) return alias[clave] ? ([clave, { nombre: "", detalle: null, alias: alias[clave] }] as const) : null;
        const conAlias: NombreTercero = { ...n, alias: alias[clave] ?? null };
        return [clave, veDetalle ? conAlias : { ...conAlias, detalle: null }] as const;
      } catch (err) {
        // Un tercero que no carga no tumba la pestaña: sale «sin ficha».
        logger.warn("[documents.terceros] no pude leer un nombre", { clave, err: String(err) });
        return null;
      }
    };
    // De a pocos: hasta 150 nombres a la vez pedían 150 conexiones (los de cliente abren transacción).
    const pares: Awaited<ReturnType<typeof leerUno>>[] = [];
    for (let i = 0; i < claves.length; i += NOMBRES_A_LA_VEZ) {
      pares.push(...(await Promise.all(claves.slice(i, i + NOMBRES_A_LA_VEZ).map(leerUno))));
    }
    const nombres: Record<string, NombreTercero> = {};
    for (const p of pares) if (p) nombres[p[0]] = p[1];
    return NextResponse.json({ nombres, uso });
  } catch (e) {
    logger.error("[documents.terceros] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
