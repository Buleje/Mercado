/**
 * AdminRecetarioDB — acceso canónico a recetas del recetario admin.
 * Audit project-wide 2026-05-19: migración desde prisma directo en
 * app/api/admin/recetario/route.ts.
 *
 * NOTA: Este módulo usa el modelo `Note` (title="__RECETARIO__") como
 * almacén de recetas de cocina editables por el admin. Es distinto de
 * RecetasDB (lib/db/recetas.db.ts) que opera sobre el modelo `Receta`
 * del schema ERP (vinculado a producción e inventario).
 */
import "server-only";
import { prisma } from "@/lib/prisma";

// Tipo de ingrediente dentro del JSON serializado en Note.content
export type RecetarioIngrediente = {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  productoId: number | null;
  imagen: null;
  stock: number;
};

// Tipo de receta deserializada (data + metadata de la Note)
export type RecetarioItem = {
  id: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: "Facil" | "Media" | "Dificil";
  categoria: string;
  videoUrl: string | null;
  ingredientes: RecetarioIngrediente[];
  totalIngredientes: number;
  pasos: string[];
  activa: boolean;
  _noteId: string;
  createdAt: Date;
  updatedAt: Date;
};

// Tipo para crear una nueva receta — nota interna generada antes de persist
export type RecetarioCreateInput = {
  id: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: "Facil" | "Media" | "Dificil";
  categoria: string;
  videoUrl: string | null;
  ingredientes: RecetarioIngrediente[];
  totalIngredientes: number;
  pasos: string[];
  activa: boolean;
};

export const AdminRecetarioDB = {
  /**
   * Lista todas las recetas del recetario del tenant (notes con title __RECETARIO__).
   * JSON inválidos se descartan silenciosamente.
   */
  async list(tenantId: string): Promise<RecetarioItem[]> {
    const notes = await prisma.note.findMany({
      where: { tenantId, title: "__RECETARIO__" },
      orderBy: { createdAt: "desc" },
    });

    return notes
      .map((n) => {
        try {
          const data = JSON.parse(n.content);
          return {
            ...data,
            _noteId: n.id,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          } as RecetarioItem;
        } catch {
          return null;
        }
      })
      .filter((r): r is RecetarioItem => r !== null);
  },

  /**
   * Persiste una nueva receta como Note con title __RECETARIO__.
   * Retorna la Note creada con el id asignado.
   */
  async create(
    tenantId: string,
    recetaData: RecetarioCreateInput,
  ): Promise<{ noteId: string; createdAt: Date; updatedAt: Date }> {
    const note = await prisma.note.create({
      data: {
        tenantId,
        title: "__RECETARIO__",
        content: JSON.stringify(recetaData),
        color: "green",
        pinned: false,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    return { noteId: note.id, createdAt: note.createdAt, updatedAt: note.updatedAt };
  },
};
