import "server-only";

/**
 * lib/db/asistente-memoria.db.ts — lo que el asistente sabe del negocio
 * (Buleje IA, ADR-528).
 *
 * «El N12 es el camión blanco», «a Don Lucho le decimos el Flaco», «el petróleo
 * lo compramos en el grifo Santa Rosa»: lo que la persona le enseña y que un ERP
 * guardaría en ningún lado. Va a la base (no a la memoria RAM de 30 min de la
 * conversación, `lib/asistente/memoria.ts`): es conocimiento, no charla.
 *
 * ── Buscar sin IA ────────────────────────────────────────────────────────────
 * `palabras` guarda el título y el texto normalizados (sin tildes, minúsculas,
 * 3+ letras, sin repetir). Buscar = contar palabras compartidas con la frase:
 * mismo criterio que `tool-routing` y que las búsquedas de `plata` (palabra
 * completa, nunca substring: «cobre» no es «cobrar»). Sin embeddings ni llamada
 * al modelo: el contexto se arma en cada mensaje y no puede costar una vuelta.
 *
 * ── Sin duplicados ───────────────────────────────────────────────────────────
 * Recordar dos veces lo mismo ACTUALIZA: la clave es el título normalizado. Así
 * «recuerda que el N12 es el camión blanco» dicho otra vez con otro texto corrige
 * lo anterior en vez de dejar dos versiones que se contradicen.
 */

import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";
import { TIPOS_MEMORIA, type MemoriaItem, type TipoMemoria } from "@/lib/ia-proveedores/tipos";

/** Tope por negocio: lo que se lee en cada mensaje tiene que ser barato. */
export const TOPE_MEMORIAS = 500;
const TTL_S = 60;
const claveCache = (tenantId: string) => `asistente-memoria:${tenantId}`;

/** Palabras que no distinguen nada: con ellas toda memoria «comparte» algo. */
const VACIAS = new Set([
  "que", "los", "las", "del", "con", "por", "para", "una", "uno", "unos", "unas", "como", "pero",
  "mas", "sus", "les", "nos", "este", "esta", "esto", "ese", "esa", "eso", "aqui", "alla", "muy",
  "son", "fue", "era", "hay", "tiene", "tengo", "mis", "tus", "mio", "suyo", "cuando", "donde",
  "quien", "cual", "sobre", "entre", "todo", "toda", "todos", "todas", "sin", "segun", "desde",
  "hasta", "the", "and", "recuerda", "acuerdate", "sabes", "dime",
]);

/** Sin tildes, minúsculas, sin puntuación. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Las palabras que cuentan para buscar (3+ letras, sin vacías, sin repetir). */
export function palabrasClave(s: string): string[] {
  return [...new Set(normalizar(s).split(" ").filter((w) => w.length >= 3 && !VACIAS.has(w)))];
}

export function esTipoMemoria(v: unknown): v is TipoMemoria {
  return typeof v === "string" && (TIPOS_MEMORIA as readonly string[]).includes(v);
}

interface FilaMemoria {
  id: string;
  tipo: string;
  titulo: string;
  texto: string;
  palabras: string;
  entidadTipo: string | null;
  entidadId: string | null;
  fuente: string;
  creadoPor: string;
  usos: number;
  ultimoUso: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lo que se cachea: la fila con sus fechas en ISO (la caché puede serializar). */
type MemoriaConPalabras = MemoriaItem & { palabras: string };

function aItem(f: FilaMemoria): MemoriaConPalabras {
  return {
    id: f.id,
    tipo: esTipoMemoria(f.tipo) ? f.tipo : "dato",
    titulo: f.titulo,
    texto: f.texto,
    entidadTipo: f.entidadTipo,
    entidadId: f.entidadId,
    fuente: f.fuente,
    creadoPor: f.creadoPor,
    usos: f.usos,
    ultimoUso: f.ultimoUso ? f.ultimoUso.toISOString() : null,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    palabras: f.palabras,
  };
}

function sinPalabras({ palabras: _p, ...item }: MemoriaConPalabras): MemoriaItem {
  return item;
}

export interface DatosMemoria {
  tipo: TipoMemoria;
  titulo: string;
  texto: string;
  entidadTipo?: string | null;
  entidadId?: string | null;
  fuente?: string;
  creadoPor?: string;
}

export interface ResultadoRecordar {
  item: MemoriaItem;
  /** true = ya había una con ese título y se actualizó. */
  actualizada: boolean;
}

export interface CambiosMemoria {
  tipo?: TipoMemoria;
  titulo?: string;
  texto?: string;
  entidadTipo?: string | null;
  entidadId?: string | null;
}

/** Ya hay otra memoria con ese título (al renombrar). */
export class MemoriaDuplicadaError extends Error {
  constructor(readonly titulo: string) {
    super(`Ya hay una memoria titulada «${titulo}»`);
    this.name = "MemoriaDuplicadaError";
  }
}

/** Se llegó al tope de memorias del negocio. */
export class TopeMemoriasError extends Error {
  constructor() {
    super(`El negocio ya tiene ${TOPE_MEMORIAS} memorias: olvida alguna antes de agregar otra`);
    this.name = "TopeMemoriasError";
  }
}

const palabrasDe = (titulo: string, texto: string) => palabrasClave(`${titulo} ${texto}`).join(" ");

async function todas(tenantId: string): Promise<MemoriaConPalabras[]> {
  return getOrSet(claveCache(tenantId), TTL_S, async () => {
    const filas = await prisma.asistenteMemoria.findMany({
      where: { tenantId },
      orderBy: [{ usos: "desc" }, { updatedAt: "desc" }],
      take: TOPE_MEMORIAS,
    });
    return filas.map(aItem);
  });
}

/** Cuántas palabras de la frase tiene la memoria (el título vale doble). */
function puntaje(m: MemoriaConPalabras, buscadas: readonly string[]): number {
  if (buscadas.length === 0) return 0;
  const suyas = new Set(m.palabras.split(" "));
  const delTitulo = new Set(palabrasClave(m.titulo));
  let p = 0;
  for (const w of buscadas) {
    if (suyas.has(w)) p += delTitulo.has(w) ? 2 : 1;
  }
  return p;
}

export const AsistenteMemoriaDB = {
  /** Todas, las más usadas primero. */
  async listar(tenantId: string): Promise<MemoriaItem[]> {
    return (await todas(tenantId)).map(sinPalabras);
  },

  /**
   * Las que comparten palabras con la frase, de más a menos coincidencias.
   * Sin palabras útiles en la frase no devuelve nada (no «todas»).
   */
  async buscar(tenantId: string, frase: string, limite = 8): Promise<MemoriaItem[]> {
    const buscadas = palabrasClave(frase);
    if (buscadas.length === 0) return [];
    return (await todas(tenantId))
      .map((m) => ({ m, p: puntaje(m, buscadas) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || b.m.usos - a.m.usos)
      .slice(0, limite)
      .map((x) => sinPalabras(x.m));
  },

  /** Las N más usadas (las que valen para cualquier mensaje). */
  async masUsadas(tenantId: string, n = 3): Promise<MemoriaItem[]> {
    return (await todas(tenantId)).filter((m) => m.usos > 0).slice(0, n).map(sinPalabras);
  },

  async obtener(tenantId: string, id: string): Promise<MemoriaItem | null> {
    const f = await prisma.asistenteMemoria.findFirst({ where: { id, tenantId } });
    return f ? sinPalabras(aItem(f)) : null;
  },

  /** La que tiene ese título (normalizado), si hay. */
  async porTitulo(tenantId: string, titulo: string): Promise<MemoriaItem | null> {
    const clave = normalizar(titulo);
    const hit = (await todas(tenantId)).find((m) => normalizar(m.titulo) === clave);
    return hit ? sinPalabras(hit) : null;
  },

  /**
   * Guarda lo aprendido. Mismo título (normalizado) = actualiza esa memoria.
   * La búsqueda del duplicado va contra la base, no contra la caché: dos
   * «recuerda…» seguidos no pueden crear dos filas por leer la lista vieja.
   */
  async recordar(tenantId: string, datos: DatosMemoria): Promise<ResultadoRecordar> {
    const titulo = datos.titulo.trim();
    const texto = datos.texto.trim();
    const clave = normalizar(titulo);
    const candidatas = await prisma.asistenteMemoria.findMany({
      where: { tenantId },
      select: { id: true, titulo: true },
      take: TOPE_MEMORIAS + 1,
    });
    const existente = candidatas.find((c) => normalizar(c.titulo) === clave);

    if (existente) {
      await prisma.asistenteMemoria.updateMany({
        where: { id: existente.id, tenantId },
        data: {
          tipo: datos.tipo,
          titulo,
          texto,
          palabras: palabrasDe(titulo, texto),
          ...(datos.entidadTipo !== undefined && { entidadTipo: datos.entidadTipo }),
          ...(datos.entidadId !== undefined && { entidadId: datos.entidadId }),
        },
      });
      invalidate(claveCache(tenantId));
      const item = await this.obtener(tenantId, existente.id);
      if (!item) throw new Error("La memoria desapareció al actualizarla");
      return { item, actualizada: true };
    }

    if (candidatas.length >= TOPE_MEMORIAS) throw new TopeMemoriasError();

    const f = await prisma.asistenteMemoria.create({
      data: {
        tenantId,
        tipo: datos.tipo,
        titulo,
        texto,
        palabras: palabrasDe(titulo, texto),
        entidadTipo: datos.entidadTipo ?? null,
        entidadId: datos.entidadId ?? null,
        fuente: datos.fuente ?? "app",
        creadoPor: datos.creadoPor ?? "",
      },
    });
    invalidate(claveCache(tenantId));
    return { item: sinPalabras(aItem(f)), actualizada: false };
  },

  /** Editar a mano (pantalla Memoria). null = no existe en este negocio. */
  async actualizar(tenantId: string, id: string, cambios: CambiosMemoria): Promise<MemoriaItem | null> {
    const actual = await prisma.asistenteMemoria.findFirst({ where: { id, tenantId } });
    if (!actual) return null;
    const titulo = cambios.titulo?.trim() ?? actual.titulo;
    const texto = cambios.texto?.trim() ?? actual.texto;
    if (cambios.titulo !== undefined && normalizar(titulo) !== normalizar(actual.titulo)) {
      const otra = await this.porTituloEnBase(tenantId, titulo);
      if (otra && otra !== id) throw new MemoriaDuplicadaError(titulo);
    }
    const r = await prisma.asistenteMemoria.updateMany({
      where: { id, tenantId },
      data: {
        ...(cambios.tipo !== undefined && { tipo: cambios.tipo }),
        titulo,
        texto,
        palabras: palabrasDe(titulo, texto),
        ...(cambios.entidadTipo !== undefined && { entidadTipo: cambios.entidadTipo }),
        ...(cambios.entidadId !== undefined && { entidadId: cambios.entidadId }),
      },
    });
    invalidate(claveCache(tenantId));
    return r.count > 0 ? this.obtener(tenantId, id) : null;
  },

  /** Olvidar. Ownership en el WHERE: una memoria ajena no se borra (count 0). */
  async olvidar(tenantId: string, id: string): Promise<boolean> {
    const r = await prisma.asistenteMemoria.deleteMany({ where: { id, tenantId } });
    invalidate(claveCache(tenantId));
    return r.count > 0;
  },

  /**
   * +1 uso a las que viajaron al modelo. No invalida la caché a propósito: el
   * orden por usos puede ir un minuto atrasado, y borrarla en cada mensaje
   * haría que cada mensaje relea la tabla.
   */
  async marcarUsos(tenantId: string, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const r = await prisma.asistenteMemoria.updateMany({
      where: { tenantId, id: { in: [...ids] } },
      data: { usos: { increment: 1 }, ultimoUso: new Date() },
    });
    return r.count;
  },

  async porTituloEnBase(tenantId: string, titulo: string): Promise<string | null> {
    const clave = normalizar(titulo);
    const filas = await prisma.asistenteMemoria.findMany({
      where: { tenantId },
      select: { id: true, titulo: true },
      take: TOPE_MEMORIAS + 1,
    });
    return filas.find((f) => normalizar(f.titulo) === clave)?.id ?? null;
  },
};
