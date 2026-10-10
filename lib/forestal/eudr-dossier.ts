import "server-only";
import { prisma } from "@/lib/prisma";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { ForestOrigenGeoDB } from "@/lib/db/forest-origen-geo.db";
import { evaluarRiesgoEudr, origenGeolocalizado, type DdsData, type DdsPlot } from "@/lib/forestal/eudr-types";

/**
 * eudr-dossier — arma la Declaración de Diligencia Debida (DDS) de un despacho
 * (ADR-140), caminando la cadena de custodia que YA existe:
 *
 *   despacho → ForestCtpDespachoDB.trazabilidadCompleta → corridas → GTF de
 *   ingreso → WoodEntry(origen) → ForestOrigenGeoDB(geolocalización).
 *
 * El riesgo EUDR es "negligible" solo si la traza está completa, todos los
 * orígenes están geolocalizados y todos atestan sin-deforestación (post-2020).
 * Es el mismo espíritu que `trazabilidadCompleta` gatea el certificado: el
 * dossier no se puede afirmar "negligible" con huecos.
 */
export async function buildDdsForDespacho(tenantId: string, despachoId: string): Promise<DdsData | null> {
  if (!tenantId) throw new Error("tenantId is required");

  const despacho = await prisma.forestCtpEntry.findFirst({
    where: { id: despachoId, tenantId, section: "despacho", deletedAt: null },
    select: { id: true, productType: true, speciesCommon: true, quantity: true, unit: true, destino: true, gtfNumber: true, cites: true },
  });
  if (!despacho) return null;

  const traza = await ForestCtpDespachoDB.trazabilidadCompleta(tenantId, despachoId);
  const gtfs = [...new Set(traza.corridas.flatMap((c) => c.guias).filter((g): g is string => !!g))];

  const woods = gtfs.length
    ? await prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, gtfNumber: { in: gtfs } },
        select: { gtfNumber: true, originType: true, originCode: true, originRegion: true, speciesCommonName: true, speciesCites: true },
      })
    : [];

  const geoMap = await ForestOrigenGeoDB.getMap(tenantId);

  type Agg = { originType: string; region: string | null; gtfs: Set<string>; especies: Set<string>; cites: boolean };
  const byOrigin = new Map<string, Agg>();
  for (const w of woods) {
    const code = (w.originCode ?? "").trim() || "(sin código de origen)";
    let a = byOrigin.get(code);
    if (!a) { a = { originType: w.originType ?? "otro", region: w.originRegion ?? null, gtfs: new Set(), especies: new Set(), cites: false }; byOrigin.set(code, a); }
    if (w.gtfNumber) a.gtfs.add(w.gtfNumber);
    if (w.speciesCommonName) a.especies.add(w.speciesCommonName);
    if (w.speciesCites) a.cites = true;
  }

  const plots: DdsPlot[] = [...byOrigin.entries()].map(([code, a]) => {
    const geo = code.startsWith("(sin") ? null : geoMap[code];
    return {
      originCode: code,
      originType: geo?.originType || a.originType,
      region: geo?.region ?? a.region,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      hasPolygon: !!geo?.polygonJson,
      polygonJson: geo?.polygonJson ?? null,
      pais: geo?.pais || "PE",
      deforestationFree: geo?.deforestationFree === true,
      gtfs: [...a.gtfs].sort(),
      especies: [...a.especies].sort(),
      cites: a.cites,
      sinGeo: !origenGeolocalizado(geo),
    };
  });

  const { riesgo, geoCompleta, deforestationFreeTotal, gaps } = evaluarRiesgoEudr(plots, traza.completa);

  return {
    despachoId: despacho.id,
    producto: despacho.productType ?? "—",
    especie: despacho.speciesCommon ?? "—",
    cantidad: despacho.quantity != null ? Number(despacho.quantity) : 0,
    unidad: despacho.unit ?? "",
    destino: despacho.destino ?? null,
    gtfSalida: despacho.gtfNumber ?? null,
    pais: "PE",
    plots,
    trazabilidadCompleta: traza.completa,
    geoCompleta,
    deforestationFreeTotal,
    cites: despacho.cites || plots.some((p) => p.cites),
    riesgo,
    gaps,
    generadoAt: new Date().toISOString(),
  };
}
