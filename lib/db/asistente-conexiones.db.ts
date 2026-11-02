import "server-only";

/**
 * lib/db/asistente-conexiones.db.ts — Buleje IA (ADR-528), carril 4.
 *
 * Las conexiones MCP con que ChatGPT, Claude, Gemini o Cursor operan el negocio
 * con la IA de cada uno. Cada conexión actúa como UN usuario del panel (el que
 * la creó) y su rol se vuelve a leer en cada llamada (`lib/mcp-servidor`).
 *
 * El token jamás se guarda: solo su SHA-256 (`tokenHash`, único) y los primeros
 * 12 caracteres para reconocerlo. `crear()` lo devuelve UNA vez.
 *
 * Sin caché a propósito: revocar tiene que cortar en la llamada siguiente, en
 * todas las instancias. Son dos lecturas por índice por llamada MCP.
 */

import { prisma } from "@/lib/prisma";
import type { ConexionMcp } from "@/lib/ia-proveedores/tipos";
import {
  formatoTokenValido,
  generarTokenMcp,
  hashesIguales,
  hashTokenMcp,
  prefijoVisible,
} from "@/lib/mcp-servidor/token";

/** Tope de conexiones vivas por negocio: más que esto es un descuido, no un uso. */
export const MAX_CONEXIONES_POR_NEGOCIO = 20;

/** Hash fijo para comparar cuando el token no existe (mismo trabajo, misma demora). */
const HASH_SENUELO = "0".repeat(64);

interface FilaConexion {
  id: string;
  tenantId: string;
  nombre: string;
  tokenPrefijo: string;
  tokenHash: string;
  usuario: string;
  rol: string;
  permiteEscribir: boolean;
  activo: boolean;
  ultimoUso: Date | null;
  usos: number;
  creadoPor: string;
  createdAt: Date;
  revocadoAt: Date | null;
}

/** Lo que sabe el servidor MCP de la conexión que llama. Sin el hash. */
export interface ConexionAutenticada {
  id: string;
  tenantId: string;
  nombre: string;
  usuario: string;
  rol: string;
  permiteEscribir: boolean;
}

const SELECT_PUBLICO = {
  id: true,
  nombre: true,
  tokenPrefijo: true,
  usuario: true,
  rol: true,
  permiteEscribir: true,
  activo: true,
  ultimoUso: true,
  usos: true,
  createdAt: true,
} as const;

type FilaPublica = Pick<
  FilaConexion,
  "id" | "nombre" | "tokenPrefijo" | "usuario" | "rol" | "permiteEscribir" | "activo" | "ultimoUso" | "usos" | "createdAt"
>;

function aConexion(f: FilaPublica): ConexionMcp {
  return {
    id: f.id,
    nombre: f.nombre,
    tokenPrefijo: f.tokenPrefijo,
    usuario: f.usuario,
    rol: f.rol,
    permiteEscribir: f.permiteEscribir,
    activo: f.activo,
    ultimoUso: f.ultimoUso ? f.ultimoUso.toISOString() : null,
    usos: f.usos,
    createdAt: f.createdAt.toISOString(),
  };
}

export const AsistenteConexionesDB = {
  /** Las conexiones no revocadas del negocio, la más nueva primero. */
  async listar(tenantId: string): Promise<ConexionMcp[]> {
    const filas = (await prisma.asistenteConexion.findMany({
      where: { tenantId, revocadoAt: null },
      orderBy: { createdAt: "desc" },
      select: SELECT_PUBLICO,
    })) as FilaPublica[];
    return filas.map(aConexion);
  },

  async contarVivas(tenantId: string): Promise<number> {
    return prisma.asistenteConexion.count({ where: { tenantId, revocadoAt: null } });
  },

  /**
   * Crea la conexión y devuelve el token ENTERO una sola vez. Lo que queda en la
   * base no alcanza para reconstruirlo.
   */
  async crear(
    tenantId: string,
    datos: { nombre: string; usuario: string; rol: string; permiteEscribir: boolean; creadoPor: string },
  ): Promise<{ conexion: ConexionMcp; token: string }> {
    const token = generarTokenMcp();
    const fila = (await prisma.asistenteConexion.create({
      data: {
        tenantId,
        nombre: datos.nombre,
        tokenPrefijo: prefijoVisible(token),
        tokenHash: hashTokenMcp(token),
        usuario: datos.usuario,
        rol: datos.rol,
        permiteEscribir: datos.permiteEscribir,
        creadoPor: datos.creadoPor,
      },
      select: SELECT_PUBLICO,
    })) as FilaPublica;
    return { conexion: aConexion(fila), token };
  },

  /**
   * Cambia nombre, permiso de anotar o pausa. El `tenantId` va en el WHERE (no
   * un `if` después): una conexión de otro negocio da `null` = 404. Una
   * revocada no se resucita.
   */
  async actualizar(
    tenantId: string,
    id: string,
    patch: { nombre?: string; permiteEscribir?: boolean; activo?: boolean },
  ): Promise<ConexionMcp | null> {
    const data: Record<string, unknown> = {};
    if (patch.nombre !== undefined) data.nombre = patch.nombre;
    if (patch.permiteEscribir !== undefined) data.permiteEscribir = patch.permiteEscribir;
    if (patch.activo !== undefined) data.activo = patch.activo;
    if (Object.keys(data).length > 0) {
      const r = await prisma.asistenteConexion.updateMany({ where: { id, tenantId, revocadoAt: null }, data });
      if (r.count === 0) return null;
    }
    const fila = (await prisma.asistenteConexion.findFirst({
      where: { id, tenantId, revocadoAt: null },
      select: SELECT_PUBLICO,
    })) as FilaPublica | null;
    return fila ? aConexion(fila) : null;
  },

  /** Revoca para siempre. `false` si no existe, es de otro negocio o ya estaba revocada. */
  async revocar(tenantId: string, id: string): Promise<boolean> {
    const r = await prisma.asistenteConexion.updateMany({
      where: { id, tenantId, revocadoAt: null },
      data: { activo: false, revocadoAt: new Date() },
    });
    return r.count > 0;
  },

  /**
   * De qué conexión es este token. Sin `tenantId` porque el negocio SALE del
   * token (como `TelegramDB.tenantDeChat`): es la única forma legítima de
   * buscar cruzando negocios.
   *
   * Se busca por el hash (índice único) y se vuelve a comparar en tiempo
   * constante; si no hay fila se compara contra un señuelo para que «no existe»
   * y «existe pero no coincide» tarden lo mismo. Pausada o revocada = `null`.
   */
  async autenticar(token: string): Promise<ConexionAutenticada | null> {
    if (!formatoTokenValido(token)) return null;
    const hash = hashTokenMcp(token);
    const fila = (await prisma.asistenteConexion.findUnique({
      where: { tokenHash: hash },
    })) as FilaConexion | null;
    const coincide = hashesIguales(fila?.tokenHash ?? HASH_SENUELO, hash);
    if (!fila || !coincide || !fila.activo || fila.revocadoAt) return null;
    return {
      id: fila.id,
      tenantId: fila.tenantId,
      nombre: fila.nombre,
      usuario: fila.usuario,
      rol: fila.rol,
      permiteEscribir: fila.permiteEscribir,
    };
  },

  /** Suma un uso y la hora. Fire-and-forget desde el servidor MCP. */
  async marcarUso(tenantId: string, id: string): Promise<void> {
    await prisma.asistenteConexion.updateMany({
      where: { id, tenantId },
      data: { usos: { increment: 1 }, ultimoUso: new Date() },
    });
  },
};
