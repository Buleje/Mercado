export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  unit: string;
  badge?: string;
  description?: string;
  stock?: number;
};

export type Category = {
  id: string;
  label: string;
  emoji: string;
};

export const categories: Category[] = [
  { id: "todos", label: "Todos", emoji: "🛒" },
  { id: "frutas-verduras", label: "Frutas y Verduras", emoji: "🥬" },
  { id: "abarrotes", label: "Abarrotes", emoji: "🏪" },
  { id: "carnes", label: "Carnes", emoji: "🥩" },
  { id: "lacteos", label: "Lácteos", emoji: "🧀" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤" },
  { id: "limpieza", label: "Limpieza", emoji: "🧹" },
];

// Products are now managed in the database — this array is intentionally empty.
// Add products via the Admin panel or POST /api/products.
export const products: Product[] = [];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => slugify(p.name) === slug);
}

export function getProductSlug(product: Product): string {
  return slugify(product.name);
}
