/**
 * Fixtures de los tests de respaldos del Libro CTP (ADR-530): filas ya
 * serializadas (como salen de la foto), sin base.
 */
import type { FilaSerial, TablasSerial } from "@/lib/forestal/ctp-respaldo-serial";
import type { ContextoRespaldo } from "@/lib/forestal/ctp-respaldo-diff";

export const T = (iso: string) => ({ $t: `${iso}T00:00:00.000Z` });
export const D = (n: number | string) => ({ $d: String(n) });

export const ingreso = (id: string, extra: Partial<FilaSerial> = {}): FilaSerial => ({
  id,
  tenantId: "t1",
  gtfNumber: `GTF-${id}`,
  providerName: "Proveedor",
  entryDate: T("2026-10-10"),
  volumeM3: D("10.0000"),
  pieces: 3,
  supplierId: null,
  contratoId: null,
  deletedAt: null,
  updatedAt: T("2026-10-10"),
  ...extra,
});

export const troza = (id: string, woodEntryId: string, extra: Partial<FilaSerial> = {}): FilaSerial => ({
  id,
  tenantId: "t1",
  woodEntryId,
  codificacion: id.toUpperCase(),
  orden: 1,
  volumenM3: D("1.0000"),
  oxPt: D("200"),
  trozaOrigenId: null,
  loteAserrioId: null,
  loteMixtoId: null,
  consumidaEnId: null,
  fechaConsumo: null,
  despachadaEnId: null,
  fechaDespacho: null,
  noRecepcionada: false,
  descarte: false,
  contratoId: null,
  updatedAt: T("2026-10-10"),
  ...extra,
});

export const corrida = (id: string, extra: Partial<FilaSerial> = {}): FilaSerial => ({
  id,
  tenantId: "t1",
  section: "produccion",
  entryDate: T("2026-10-12"),
  lineNo: 1,
  speciesCommon: "Tornillo",
  unit: "pt",
  quantity: D("500"),
  volumeInputM3: D("2.0000"),
  status: "registrado",
  annulledReason: null,
  contratoId: null,
  deletedAt: null,
  updatedAt: T("2026-10-12"),
  ...extra,
});

export const consumo = (id: string, ctpEntryId: string, woodEntryId: string, m3 = "2.0000"): FilaSerial => ({
  id,
  tenantId: "t1",
  ctpEntryId,
  woodEntryId,
  volumeM3: D(m3),
  updatedAt: T("2026-10-12"),
});

export const loteAserrio = (id: string, code: string, extra: Partial<FilaSerial> = {}): FilaSerial => ({
  id,
  tenantId: "t1",
  code,
  status: "abierto",
  fechaApertura: T("2026-10-11"),
  loteMixtoId: null,
  contratoId: null,
  deletedAt: null,
  updatedAt: T("2026-10-11"),
  ...extra,
});

export const sinCierres: ContextoRespaldo = { mesCerrado: () => null };

/** Copia profunda: cada test arma «hoy» a partir del respaldo sin tocarlo. */
export const copia = (t: TablasSerial): TablasSerial => JSON.parse(JSON.stringify(t)) as TablasSerial;
