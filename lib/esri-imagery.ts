/**
 * esri-imagery — lo que Esri publica HOY como fuente de su foto satelital
 * (World Imagery): el `copyrightText` de `World_Imagery/MapServer?f=json`,
 * leído el 29-09-2026. Maxar pasó a llamarse Vantor: los mapas del panel que
 * decían «Tiles © Esri, Maxar» atribuían con el nombre viejo.
 *
 * Una sola fuente para todos los mapas con la foto de Esri (Libro TH, CTP,
 * plantaciones, cacao) y para lo impreso.
 */

export const FUENTE_ESRI_IMAGERY = "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community";

/** Para el control de atribución de Leaflet. */
export const ATRIBUCION_ESRI_IMAGERY = `Tiles © Esri — ${FUENTE_ESRI_IMAGERY}`;
