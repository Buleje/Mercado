/**
 * Continuidad de período, historial y duplicados cruzados entre relaciones
 * "Relación de guías de transporte forestal emitidas" (ADR-364 ronda 4).
 */
import { describe, expect, it } from "vitest";
import { construirTramite, type TramiteRegistro } from "@/lib/forestal/tramites-registro";
import {
  avisoPlazoRelacion,
  gtfDuplicadaEntreRelaciones,
  nuevaFilaGuia,
  periodoDesdeSugerido,
  relacionesDelFormato,
  serializeGuiasInforme,
  type FilaGuiaInforme,
} from "@/lib/forestal/tramites-relacion-guias";

const F = "relacion-guias-serfor";

/** Una relación guardada, con período y opcionalmente guías. */
function relacion(over: {
  id: string;
  estado?: "borrador" | "presentado" | "observado" | "resuelto" | "desistido";
  periodoDesde?: string;
  periodoHasta?: string;
  numeroDocumento?: string | null;
  guias?: Partial<FilaGuiaInforme>[];
}): TramiteRegistro {
  const guiasJson = over.guias
    ? serializeGuiasInforme(over.guias.map((g, i) => ({ ...nuevaFilaGuia(`f-${i}`), ...g })))
    : "";
  const t = construirTramite({
    id: over.id,
    formatoId: F,
    autoridad: "serfor",
    estado: over.estado ?? "presentado",
    ahora: "2026-08-20T00:00:00.000Z",
    datos: { periodoDesde: over.periodoDesde ?? "", periodoHasta: over.periodoHasta ?? "", guiasJson },
  });
  // El correlativo real lo asigna `ForestTramitesDB.save`; para el fixture se
  // fuerza directo (simula "ya presentada con N° asignado hace tiempo").
  return { ...t, numeroDocumento: over.numeroDocumento ?? t.numeroDocumento };
}

describe("relacionesDelFormato", () => {
  it("filtra por formato y ordena por período-hasta descendente", () => {
    const lista = [
      relacion({ id: "a", periodoHasta: "2026-07-15" }),
      relacion({ id: "b", periodoHasta: "2026-08-15" }),
      relacion({ id: "c", periodoHasta: "2026-06-15" }),
      construirTramite({ id: "otro", formatoId: "visado-talonario-gtf", autoridad: "arffs", ahora: "2026-08-20T00:00:00.000Z" }),
    ];
    const r = relacionesDelFormato(lista, F);
    expect(r.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });
});

describe("periodoDesdeSugerido", () => {
  it("sugiere el día siguiente al 'hasta' de la última presentada", () => {
    const lista = [relacion({ id: "a", estado: "presentado", periodoHasta: "2026-08-15" })];
    expect(periodoDesdeSugerido(lista)).toBe("2026-08-16");
  });

  it("ignora borradores (todavía no se presentó, no cuenta como antecedente)", () => {
    const lista = [relacion({ id: "a", estado: "borrador", periodoHasta: "2026-08-15" })];
    expect(periodoDesdeSugerido(lista)).toBeNull();
  });

  it("sin antecedentes, no hay sugerencia", () => {
    expect(periodoDesdeSugerido([])).toBeNull();
  });
});

describe("avisoPlazoRelacion", () => {
  it("cuenta los días desde el 'hasta' de la última presentada", () => {
    const lista = [relacion({ id: "a", estado: "presentado", periodoHasta: "2026-07-15", numeroDocumento: "003-2026" })];
    const aviso = avisoPlazoRelacion(lista, new Date("2026-08-20T12:00:00Z"));
    expect(aviso).toMatchObject({ dias: 36, numeroDocumento: "003-2026", periodoHasta: "2026-07-15" });
  });

  it("si el período todavía no terminó, no avisa", () => {
    const lista = [relacion({ id: "a", periodoHasta: "2026-08-20" })];
    expect(avisoPlazoRelacion(lista, new Date("2026-08-20T00:00:00Z"))).toBeNull();
  });

  it("sin relaciones, no hay aviso", () => {
    expect(avisoPlazoRelacion([], new Date())).toBeNull();
  });
});

describe("gtfDuplicadaEntreRelaciones", () => {
  it("detecta un N° de GTF que ya está en OTRA relación (emitida)", () => {
    const otras = [relacion({ id: "a", numeroDocumento: "001-2026", guias: [{ numero: "19-000005" }] })];
    const actuales: FilaGuiaInforme[] = [{ ...nuevaFilaGuia("x"), numero: "19-000005" }];
    expect(gtfDuplicadaEntreRelaciones(actuales, otras)).toEqual([{ numero: "19-000005", otraRelacion: "N° 001-2026" }]);
  });

  it("también la detecta si en la otra relación está anulada", () => {
    const otras = [relacion({ id: "a", numeroDocumento: "001-2026", guias: [{ numero: "19-000005", anulada: true }] })];
    const actuales: FilaGuiaInforme[] = [{ ...nuevaFilaGuia("x"), numero: "19-000005" }];
    expect(gtfDuplicadaEntreRelaciones(actuales, otras)).toHaveLength(1);
  });

  it("sin coincidencias, no reporta nada", () => {
    const otras = [relacion({ id: "a", guias: [{ numero: "19-000005" }] })];
    const actuales: FilaGuiaInforme[] = [{ ...nuevaFilaGuia("x"), numero: "19-000009" }];
    expect(gtfDuplicadaEntreRelaciones(actuales, otras)).toEqual([]);
  });

  it("no duplica el aviso si el mismo N° se repite dos veces en la relación actual", () => {
    const otras = [relacion({ id: "a", numeroDocumento: "001-2026", guias: [{ numero: "19-000005" }] })];
    const actuales: FilaGuiaInforme[] = [
      { ...nuevaFilaGuia("x"), numero: "19-000005" },
      { ...nuevaFilaGuia("y"), numero: "19-000005" },
    ];
    expect(gtfDuplicadaEntreRelaciones(actuales, otras)).toHaveLength(1);
  });
});
