/**
 * La GTF real que pasó Brandon el 2026-10-03 (Inversiones Agroforestales Blas):
 * 39 filas (nombre científico + tipo de producto), 2 082 piezas, 31,188 m³.
 * Página 1 = Cachimbo + Ana Caspi (5,633); página 2 = el resto (25,555).
 *
 * La fila de Copal «COMERCIAL» (18 piezas, 0,096 m³ = 0,0053 m³/pieza) tiene el
 * patrón de una TABLA: es el caso que el validador tiene que marcar.
 */

export interface FilaGtfReal {
  comun: string;
  cientifico: string;
  tipo: "COMERCIAL" | "LARGA ANGOSTA" | "CORTA" | "TABLA";
  piezas: number;
  m3: number;
  pagina: 1 | 2;
}

const CACHIMBO = "Allantoma decandra (Ducke) S.A. Mori; Ya Y.Huang & Prance";
const ANA_CASPI = "Apuleia leiocarpa (Vogel) J.F. Macbr.";
const PANGUANA = "Brosimum utile (Kunth) Oken";
const MASHONASTE = "Clarisia racemosa Ruiz & Pav.";
const HUAYRURO = "Ormosia schunkei Rudd";
const CUMALA = "Virola peruviana (A. DC.) Warb.";
const SHIMBILLO = "Inga ruiziana G. Don";
const PASHACO = "Parkia ulei (Harms) Kuhlm.";
const AZUCAR_HUAYO = "Hymenaea reticulata Ducke";
const COPAL = "Protium spruceanum (Benth.) Engl.";
const YACUCHAPANA = "Poulsenia armata (Miq.) Standl.";

const f = (comun: string, cientifico: string, tipo: FilaGtfReal["tipo"], piezas: number, m3: number, pagina: 1 | 2 = 2): FilaGtfReal => ({
  comun, cientifico, tipo, piezas, m3, pagina,
});

export const GTF_REAL: readonly FilaGtfReal[] = [
  f("Cachimbo", CACHIMBO, "COMERCIAL", 61, 3.311, 1),
  f("Cachimbo", CACHIMBO, "LARGA ANGOSTA", 48, 0.428, 1),
  f("Cachimbo", CACHIMBO, "CORTA", 128, 0.624, 1),
  f("Cachimbo", CACHIMBO, "TABLA", 17, 0.09, 1),
  f("Ana Caspi", ANA_CASPI, "LARGA ANGOSTA", 60, 0.553, 1),
  f("Ana Caspi", ANA_CASPI, "CORTA", 140, 0.531, 1),
  f("Ana Caspi", ANA_CASPI, "TABLA", 18, 0.096, 1),
  f("Panguana", PANGUANA, "COMERCIAL", 58, 6.475),
  f("Panguana", PANGUANA, "LARGA ANGOSTA", 36, 0.259),
  f("Panguana", PANGUANA, "CORTA", 104, 0.412),
  f("Panguana", PANGUANA, "TABLA", 19, 0.102),
  f("Mashonaste", MASHONASTE, "LARGA ANGOSTA", 24, 0.139),
  f("Mashonaste", MASHONASTE, "CORTA", 77, 0.195),
  f("Mashonaste", MASHONASTE, "TABLA", 18, 0.098),
  f("Huayruro", HUAYRURO, "LARGA ANGOSTA", 53, 0.437),
  f("Huayruro", HUAYRURO, "CORTA", 123, 0.426),
  f("Huayruro", HUAYRURO, "TABLA", 16, 0.084),
  f("Cumala", CUMALA, "COMERCIAL", 29, 3.057),
  f("Cumala", CUMALA, "LARGA ANGOSTA", 10, 0.03),
  f("Cumala", CUMALA, "CORTA", 44, 0.163),
  f("Cumala", CUMALA, "TABLA", 13, 0.068),
  f("Shimbillo", SHIMBILLO, "COMERCIAL", 20, 0.981),
  f("Shimbillo", SHIMBILLO, "LARGA ANGOSTA", 40, 0.307),
  f("Shimbillo", SHIMBILLO, "CORTA", 110, 0.399),
  f("Shimbillo", SHIMBILLO, "TABLA", 18, 0.094),
  f("Pashaco", PASHACO, "COMERCIAL", 81, 7.869),
  f("Pashaco", PASHACO, "LARGA ANGOSTA", 43, 0.407),
  f("Pashaco", PASHACO, "CORTA", 109, 0.476),
  f("Pashaco", PASHACO, "TABLA", 19, 0.1),
  f("Azucar huayo", AZUCAR_HUAYO, "LARGA ANGOSTA", 34, 0.241),
  f("Azucar huayo", AZUCAR_HUAYO, "CORTA", 94, 0.275),
  f("Azucar huayo", AZUCAR_HUAYO, "TABLA", 18, 0.096),
  f("Copal", COPAL, "COMERCIAL", 18, 0.096),
  f("Copal", COPAL, "LARGA ANGOSTA", 51, 0.44),
  f("Copal", COPAL, "CORTA", 123, 0.438),
  f("Yacuchapana", YACUCHAPANA, "COMERCIAL", 4, 0.302),
  f("Yacuchapana", YACUCHAPANA, "LARGA ANGOSTA", 55, 0.502),
  f("Yacuchapana", YACUCHAPANA, "CORTA", 131, 0.49),
  f("Yacuchapana", YACUCHAPANA, "TABLA", 18, 0.097),
];
