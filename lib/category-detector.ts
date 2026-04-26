/**
 * lib/category-detector.ts
 *
 * Detector heurístico de categoría a partir del nombre del producto.
 *
 * Es un clasificador determinista basado en keywords — sin LLM ni embeddings.
 * La gracia es que el dueño del negocio escribe "Arroz Extra 5kg" y la UI
 * sugiere `abarrotes` antes de que apriete guardar. Si el dueño puso una
 * categoría manual distinta, mostramos un chip de "sugerencia" al costado
 * con un botón "Aplicar".
 *
 * No es perfecto — productos ambiguos (ej. "Yogurt con frutas") pueden
 * caer en `lacteos` o `frutas-verduras` según orden de match. Para el caso
 * del 80%, alcanza. Si en el futuro se necesita más precisión, se puede
 * envolver en un endpoint que use un modelo entrenado.
 */

export type CategoryId =
  | "frutas-verduras"
  | "abarrotes"
  | "carnes"
  | "lacteos"
  | "bebidas"
  | "limpieza";

interface CategoryRule {
  id: CategoryId;
  label: string;
  // Keywords que sugieren esta categoría (sin tildes, lowercase).
  keywords: string[];
}

/**
 * Reglas ordenadas por especificidad. La primera que matchea gana.
 * Ordenamos las más específicas primero (limpieza tiene "lavandina"
 * que también está en "limpieza domestica" — limpieza primero).
 */
const RULES: CategoryRule[] = [
  {
    id: "carnes",
    label: "Carnes",
    keywords: [
      "pollo", "carne", "res", "chancho", "cerdo", "cordero", "pavo",
      "chorizo", "salchicha", "jamon", "bistec", "lomo", "pierna",
      "pechuga", "muslo", "filete", "milanesa", "molida", "pescado",
      "atun", "salmon", "trucha", "merluza", "tilapia", "anchoveta",
      "paiche", "boquichico", "carachama", "camaron", "langostino",
    ],
  },
  {
    id: "frutas-verduras",
    label: "Frutas y Verduras",
    keywords: [
      "manzana", "platano", "banana", "naranja", "limon", "fresa",
      "uva", "pera", "pina", "papaya", "sandia", "melon", "kiwi",
      "mango", "palta", "aguacate", "tomate", "papa", "papas",
      "cebolla", "zanahoria", "lechuga", "espinaca", "brocoli",
      "coliflor", "pepino", "pimiento", "rocoto", "aji", "ajo",
      "apio", "yuca", "camote", "choclo", "vainita", "habas",
      "frutas", "verduras", "verdura", "fruta", "ensalada",
      "platanito", "uvilla", "cocona", "carambola",
    ],
  },
  {
    id: "lacteos",
    label: "Lácteos",
    keywords: [
      "leche", "yogur", "yogurt", "queso", "mantequilla", "mantequilla",
      "manjar", "margarina", "crema", "lacteo", "lactea", "lacteos",
      "huevo", "huevos",
      "evaporada", "condensada",
    ],
  },
  {
    id: "limpieza",
    label: "Limpieza",
    keywords: [
      "detergente", "lejia", "lavavajilla", "lavavajillas", "ace",
      "ariel", "bolivar", "magia blanca", "patito", "sapolio",
      "desinfectante", "limpiador", "pinolina", "pinol", "ayudin",
      "limpia", "limpieza", "jabon", "shampoo", "champu", "pasta",
      "papel higienico", "papel toalla", "servilleta", "servilletas",
      "desodorante", "ambientador", "lavandina", "escoba", "trapeador",
      "esponja", "guantes", "bolsa", "bolsas",
    ],
  },
  {
    id: "bebidas",
    label: "Bebidas",
    keywords: [
      "agua", "gaseosa", "cola", "inca kola", "coca cola", "sprite",
      "fanta", "pepsi", "guarana", "jugo", "jugos", "refresco",
      "cerveza", "pilsen", "cristal", "cusquena", "corona", "heineken",
      "vino", "ron", "pisco", "whisky", "vodka", "trago",
      "te", "cafe", "anis", "infusion", "energizante", "isotonica",
      "cola real", "frugos", "tampico", "san luis", "cielo",
    ],
  },
  {
    id: "abarrotes",
    label: "Abarrotes",
    keywords: [
      "arroz", "azucar", "sal", "fideo", "fideos", "espagueti",
      "tallarin", "spaghetti", "harina", "aceite", "aceitera",
      "vinagre", "salsa", "ketchup", "mayonesa", "mostaza",
      "atun lata", "sardina", "conserva", "conservas", "lentejas",
      "frijol", "frejol", "garbanzo", "haba", "alverja", "arveja",
      "avena", "quinua", "kiwicha", "chia", "menestras",
      "galleta", "galletas", "chocolate", "panettone", "mermelada",
      "miel", "azucarera", "endulzante", "edulcorante", "stevia",
      "sopa", "caldo", "consome", "ramen", "instantanea",
      "cereales", "cereal", "barra",
      "snack", "papitas", "doritos", "chizitos", "lays",
      "panqueque", "pan", "pan de molde", "bimbo", "tostadas",
    ],
  },
];

/**
 * Normaliza texto: lowercase + sin tildes + sin caracteres especiales.
 */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecta la categoría más probable a partir del nombre del producto.
 * Si ninguna keyword matchea, devuelve `null` (admin debe elegir manual).
 */
export function detectCategoryFromName(name: string): {
  id: CategoryId;
  label: string;
  matchedKeyword: string;
} | null {
  if (!name || name.trim().length < 2) return null;
  const normalized = normalize(name);
  if (!normalized) return null;

  // Buscamos la keyword más específica (la más larga gana en empate).
  let best: { rule: CategoryRule; keyword: string } | null = null;

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const norm = normalize(kw);
      if (!norm) continue;
      // Match por palabra completa (delimitada por espacios o bordes).
      const re = new RegExp(`(^|\\s)${norm}(\\s|$)`);
      if (re.test(normalized)) {
        if (!best || norm.length > best.keyword.length) {
          best = { rule, keyword: norm };
        }
      }
    }
  }

  if (!best) return null;
  return { id: best.rule.id, label: best.rule.label, matchedKeyword: best.keyword };
}
