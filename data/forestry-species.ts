/**
 * Catálogo de especies forestales maderables peruanas (ADR-124).
 *
 * Fuente: SERFOR + CITES + experiencia comercial amazonía peruana.
 * Subset común — el LOE-CTP SERFOR soporta ~300 especies. Acá las
 * top más comerciales de Loreto, Ucayali, Madre de Dios.
 *
 * cites: true → especie en apéndices CITES, requiere CITES permit
 *               para exportación. Buleje debe alertar en UI.
 *
 * protectionLevel:
 *   - sin_restriccion: tala y comercio libre
 *   - controlada: requiere plan de manejo aprobado
 *   - prohibida: tala prohibida (vedada)
 */

export interface ForestrySpecies {
  /** Nombre comercial común (slug-stable, lowercase) */
  slug: string;
  /** Nombre comercial principal (mostrado en UI) */
  commonName: string;
  /** Nombres alternativos / sinónimos comerciales */
  altNames?: string[];
  /** Nombre científico binominal */
  scientificName: string;
  /** Familia botánica */
  family?: string;
  /** Densidad básica kg/m³ (peso seco) — útil para cálculos comerciales */
  densityKgM3?: number;
  /** Está en lista CITES (especie protegida internacional) */
  cites: boolean;
  /** Apéndice CITES (I, II, III) si aplica */
  citesAppendix?: "I" | "II" | "III";
  /** Nivel de protección según ley peruana */
  protectionLevel: "sin_restriccion" | "controlada" | "prohibida";
  /** Regiones principales donde crece */
  regions: string[];
  /** Uso comercial principal */
  uses?: string[];
}

export const FORESTRY_SPECIES: ForestrySpecies[] = [
  {
    slug: "tornillo",
    commonName: "Tornillo",
    scientificName: "Cedrelinga cateniformis",
    family: "Fabaceae",
    densityKgM3: 510,
    cites: false,
    protectionLevel: "controlada",
    regions: ["Loreto", "Ucayali", "Madre de Dios", "San Martín"],
    uses: ["Construcción", "Carpintería", "Mueblería"],
  },
  {
    slug: "capirona",
    commonName: "Capirona",
    scientificName: "Calycophyllum spruceanum",
    family: "Rubiaceae",
    densityKgM3: 750,
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: ["Loreto", "Ucayali", "Madre de Dios"],
    uses: ["Pisos", "Postes", "Carpintería pesada"],
  },
  {
    slug: "shihuahuaco",
    commonName: "Shihuahuaco",
    altNames: ["Estoraque", "Cumarú"],
    scientificName: "Dipteryx micrantha",
    family: "Fabaceae",
    densityKgM3: 1100,
    cites: true,
    citesAppendix: "II",
    protectionLevel: "controlada",
    regions: ["Madre de Dios", "Ucayali", "Loreto"],
    uses: ["Pisos premium", "Exportación", "Estructuras pesadas"],
  },
  {
    slug: "caoba",
    commonName: "Caoba",
    scientificName: "Swietenia macrophylla",
    family: "Meliaceae",
    densityKgM3: 545,
    cites: true,
    citesAppendix: "II",
    protectionLevel: "controlada",
    regions: ["Madre de Dios", "Loreto", "Ucayali"],
    uses: ["Mueblería fina", "Exportación", "Instrumentos musicales"],
  },
  {
    slug: "cedro",
    commonName: "Cedro",
    altNames: ["Cedro de altura", "Cedro rojo"],
    scientificName: "Cedrela odorata",
    family: "Meliaceae",
    densityKgM3: 440,
    cites: true,
    citesAppendix: "III",
    protectionLevel: "controlada",
    regions: ["Loreto", "Ucayali", "San Martín", "Madre de Dios"],
    uses: ["Mueblería", "Carpintería fina", "Cajones puro"],
  },
  {
    slug: "ishpingo",
    commonName: "Ishpingo",
    scientificName: "Amburana cearensis",
    family: "Fabaceae",
    densityKgM3: 590,
    cites: false,
    protectionLevel: "controlada",
    regions: ["Loreto", "Ucayali"],
    uses: ["Mueblería", "Carpintería decorativa"],
  },
  {
    slug: "lupuna",
    commonName: "Lupuna",
    altNames: ["Huimba"],
    scientificName: "Ceiba pentandra",
    family: "Malvaceae",
    densityKgM3: 270,
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: ["Loreto", "Ucayali", "Madre de Dios"],
    uses: ["Triplay", "Cajonería liviana", "Embalaje"],
  },
  {
    slug: "moena",
    commonName: "Moena",
    altNames: ["Moena amarilla", "Moena negra"],
    scientificName: "Aniba spp.",
    family: "Lauraceae",
    densityKgM3: 580,
    cites: false,
    protectionLevel: "controlada",
    regions: ["Loreto", "Ucayali"],
    uses: ["Carpintería general", "Pisos"],
  },
  {
    slug: "cumala",
    commonName: "Cumala",
    scientificName: "Virola spp.",
    family: "Myristicaceae",
    densityKgM3: 480,
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: ["Loreto", "Ucayali"],
    uses: ["Triplay", "Carpintería liviana"],
  },
  {
    slug: "huayruro",
    commonName: "Huayruro",
    scientificName: "Ormosia spp.",
    family: "Fabaceae",
    densityKgM3: 800,
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: ["Loreto", "Ucayali", "Madre de Dios"],
    uses: ["Artesanía", "Mueblería"],
  },
  {
    slug: "estoraque",
    commonName: "Estoraque",
    scientificName: "Myroxylon balsamum",
    family: "Fabaceae",
    densityKgM3: 1000,
    cites: false,
    protectionLevel: "controlada",
    regions: ["Loreto", "Ucayali"],
    uses: ["Pisos", "Estructuras pesadas"],
  },
  {
    slug: "pumaquiro",
    commonName: "Pumaquiro",
    scientificName: "Aspidosperma macrocarpon",
    family: "Apocynaceae",
    densityKgM3: 780,
    cites: false,
    protectionLevel: "controlada",
    regions: ["Loreto", "Ucayali", "Madre de Dios"],
    uses: ["Construcción", "Pisos"],
  },
  {
    slug: "bolaina",
    commonName: "Bolaina",
    scientificName: "Guazuma crinita",
    family: "Malvaceae",
    densityKgM3: 380,
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: ["Ucayali", "Madre de Dios"],
    uses: ["Mueblería económica", "Encofrado"],
  },
  {
    slug: "marupa",
    commonName: "Marupa",
    altNames: ["Pino blanco peruano"],
    scientificName: "Simarouba amara",
    family: "Simaroubaceae",
    densityKgM3: 380,
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: ["Loreto", "Ucayali"],
    uses: ["Carpintería liviana", "Tarimas"],
  },
  {
    slug: "otro",
    commonName: "Otra especie (especificar)",
    scientificName: "—",
    cites: false,
    protectionLevel: "sin_restriccion",
    regions: [],
    uses: [],
  },
];

/**
 * Busca una especie por slug. Útil para validar y obtener metadata
 * en server actions / API antes de persistir el WoodEntry.
 */
export function findSpeciesBySlug(slug: string): ForestrySpecies | undefined {
  return FORESTRY_SPECIES.find((s) => s.slug === slug);
}

/**
 * Busca por nombre común (case-insensitive, también revisa altNames).
 */
export function findSpeciesByCommonName(name: string): ForestrySpecies | undefined {
  const q = name.trim().toLowerCase();
  return FORESTRY_SPECIES.find((s) => {
    if (s.commonName.toLowerCase() === q) return true;
    if (s.altNames?.some((a) => a.toLowerCase() === q)) return true;
    return false;
  });
}

/**
 * Lista especies disponibles ordenadas alfabéticamente.
 * Excluye "otro" del top (la pone al final si includeOther=true).
 */
export function listSpecies(opts: { includeOther?: boolean } = {}): ForestrySpecies[] {
  const all = FORESTRY_SPECIES.filter((s) => s.slug !== "otro");
  const sorted = [...all].sort((a, b) => a.commonName.localeCompare(b.commonName, "es"));
  if (opts.includeOther !== false) {
    const other = FORESTRY_SPECIES.find((s) => s.slug === "otro");
    if (other) sorted.push(other);
  }
  return sorted;
}

/**
 * Especies CITES (requieren atención especial al exportar).
 */
export function listCitesSpecies(): ForestrySpecies[] {
  return FORESTRY_SPECIES.filter((s) => s.cites);
}

/**
 * Verifica si una especie está en lista controlada (requiere plan de manejo).
 */
export function isControlledSpecies(slug: string): boolean {
  const s = findSpeciesBySlug(slug);
  return s?.protectionLevel === "controlada" || s?.protectionLevel === "prohibida";
}
