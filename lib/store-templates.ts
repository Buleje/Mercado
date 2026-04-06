/**
 * Plantillas de tienda predefinidas.
 * Definen las categorías iniciales que se crean al registrar un tenant nuevo.
 * No incluyen productos — el usuario los carga después.
 */

export type TemplateId = "bodega" | "minimarket" | "farmacia" | "restaurante";

export interface TemplateDef {
  id: TemplateId;
  name: string;
  icon: string; // nombre del icono Lucide
  description: string;
  categories: string[];
}

export const STORE_TEMPLATES: Record<TemplateId, TemplateDef> = {
  bodega: {
    id: "bodega",
    name: "Bodega / Abarrotes",
    icon: "Store",
    description: "Ideal para bodegas familiares y tiendas de abarrotes",
    categories: [
      "Abarrotes",
      "Bebidas",
      "Limpieza",
      "Lácteos",
      "Carnes",
      "Frutas y Verduras",
      "Snacks",
      "Otros",
    ],
  },
  minimarket: {
    id: "minimarket",
    name: "Minimarket",
    icon: "ShoppingCart",
    description: "Para minimarkets con mayor variedad de productos",
    categories: [
      "Abarrotes",
      "Bebidas",
      "Golosinas",
      "Higiene Personal",
      "Limpieza",
      "Congelados",
      "Licores",
      "Otros",
    ],
  },
  farmacia: {
    id: "farmacia",
    name: "Farmacia / Botica",
    icon: "Heart",
    description: "Para farmacias, boticas y tiendas de salud",
    categories: [
      "Medicamentos",
      "Vitaminas",
      "Cuidado Personal",
      "Bebés",
      "Primeros Auxilios",
      "Equipos",
      "Otros",
    ],
  },
  restaurante: {
    id: "restaurante",
    name: "Restaurante / Comida",
    icon: "UtensilsCrossed",
    description: "Para restaurantes, cevicherías y negocios de comida",
    categories: [
      "Platos del día",
      "Sopas",
      "Bebidas",
      "Postres",
      "Combos",
      "Para llevar",
      "Otros",
    ],
  },
};

/** Array ordenado para mostrar en la UI */
export const STORE_TEMPLATES_LIST: TemplateDef[] = Object.values(STORE_TEMPLATES);

/** Retorna las categorías de una plantilla, o [] si no existe */
export function getTemplateCategories(templateId: TemplateId | string | undefined): string[] {
  if (!templateId) return [];
  return STORE_TEMPLATES[templateId as TemplateId]?.categories ?? [];
}
