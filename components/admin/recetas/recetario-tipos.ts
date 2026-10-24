/** Tipos y listas del recetario web (recetas públicas de la tienda). */
export type Ingrediente = {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  productoId?: number | null;
};

export type RecetaPublica = {
  id: string;
  _noteId?: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: "Fácil" | "Media" | "Dificil";
  categoria: string;
  videoUrl: string | null;
  ingredientes: Ingrediente[];
  totalIngredientes: number;
  pasos: string[];
  activa: boolean;
  createdAt?: string;
};


export type ProductSearch = {
  id: number;
  name: string;
  price: number;
};

export const CATEGORIAS = ["Entradas", "Platos de fondo", "Sopas", "Postres", "Bebidas"];
export const UNIDADES = ["unidad", "kg", "litro", "atado", "botella", "bolsa", "sobre", "lata", "paquete", "pack"];
export const DIFICULTADES: ("Fácil" | "Media" | "Dificil")[] = ["Fácil", "Media", "Dificil"];
