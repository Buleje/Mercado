/**
 * Tipos y cuentas puras de la vista Plan de manejo del LO-TH (ADR-126).
 *
 * Salieron de `LothPlanView`, que pasaba de 1.200 líneas: acá queda lo que no
 * dibuja nada —las formas que devuelve la API y el cruce censo ↔ autorizado ↔
 * movilizado—, así cada bloque de la vista lo importa sin depender de otro.
 */

import { claveEspecie } from "@/lib/forestal/loth-constants";

export interface Plan {
  id: string; planType: string; planNumber: string | null; tituloHabilitante: string | null;
  resolucionNumber: string | null; resolucionDate: string | null; titularName: string;
  regenteName?: string | null; regenteRegistro?: string | null; regenteEspecialidad?: string | null;
  representanteLegal?: string | null;
  arffs: string | null; region: string | null; parcelaCorta: string | null;
  areaHa: string | null; uitRef: string | null; vigenciaDesde: string | null;
  vigenciaHasta: string | null; estado: string;
}
export interface Species {
  id: string; speciesCommon: string; speciesScientific: string | null; cites: boolean;
  categoria: string | null; volumenAutorizadoM3: string; arbolesAutorizados: number | null;
  valorEstadoNaturalSoles: string | null; precioVentaSoles: string | null;
}
export interface Tree {
  id: string; treeCode: string; speciesCommon: string; speciesScientific: string | null;
  cites: boolean; dapM: string | null; alturaComercialM: string | null; factorForma: string | null;
  volumenEstimadoM3: string | null; utmZona: string | null; utmX: string | null; utmY: string | null;
  parcelaCorta: string | null; estado: string;
}
export interface CensusStat { estado: string; count: number; volumenEstimadoM3: number; }

export const n = (v: string | null, dp = 4) => (v == null || v === "" ? "—" : Number(v).toFixed(dp));
export const soles = (v: string | null) => (v == null || v === "" ? "—" : `S/ ${Number(v).toFixed(2)}`);
/**
 * Cuántos árboles del censo se traen para calcular el Plan Operativo.
 *
 * Alto a propósito: un POA de mil hectáreas censa miles de árboles, y con un
 * tope bajo la pantalla mostraba un POA completo calculado sobre una parte
 * —medido: con 605 árboles y tope 500 quedaban 590 m³ afuera, invisibles—.
 * Si aun así se corta, el servidor avisa con `truncado` y la vista lo grita.
 */
export const CENSO_LIMITE = 10_000;

export const censusVol = (dap: number, hc: number, ff: number) =>
  dap > 0 && hc > 0 ? Math.round(0.7854 * dap * dap * hc * ff * 10000) / 10000 : 0;

// ─── Balance de extracción / saldos ────────────────────────────────────────
export interface BalanceRow {
  species: string; cites: boolean; autorizado: number; talado: number; movilizado: number;
  saldo: number; pctMovilizado: number; precioVenta: number; valorMovilizado: number;
  pagoDerecho: number; exceso: boolean;
}
export interface Balance {
  rows: BalanceRow[]; pagoArea: number; pagoDerechoTotal: number; valorTotal: number;
  plan: { vigenciaHasta: string | null; estado: string; areaHa: number; uitRef: number } | null;
}

// ─── Control por especie · cruce censo ↔ autorizado ↔ movilizado ────────────
// El corazón de la fiscalización OSINFOR: ¿lo censado/talado/movilizado cabe en
// lo que autorizó la resolución? Detecta especies fuera del plan (tala no
// autorizada), exceso de árboles y de volumen. Todo derivado en el cliente de
// datos ya cargados (species + trees + balance) — sin fetch extra.
export type ControlFlag = "no_autorizada" | "exceso_volumen" | "exceso_arboles" | "sin_censo";
export type ControlTone = "ok" | "warn" | "danger";
export interface ControlRow {
  species: string; cites: boolean;
  autorizada: boolean; autorizadoM3: number; autorizadoArboles: number | null;
  censadoCount: number; censadoVolM3: number; georrefCount: number; taladoCount: number;
  movilizado: number; saldo: number; pctEjecutado: number;
  flags: ControlFlag[]; tone: ControlTone;
}

export function buildControlRows(species: Species[], trees: Tree[], balance: Balance | null): ControlRow[] {
  const spMap = new Map(species.map((s) => [claveEspecie(s.speciesCommon), s]));
  const balMap = new Map((balance?.rows ?? []).map((r) => [claveEspecie(r.species), r]));
  const groups = new Map<string, { name: string; count: number; vol: number; georref: number; talado: number; cites: boolean }>();
  for (const t of trees) {
    const key = claveEspecie(t.speciesCommon);
    const g = groups.get(key) ?? { name: t.speciesCommon, count: 0, vol: 0, georref: 0, talado: 0, cites: false };
    g.count += 1;
    g.vol += Number(t.volumenEstimadoM3 ?? 0);
    if (Number(t.utmX) && Number(t.utmY)) g.georref += 1;
    if (t.estado === "talado") g.talado += 1;
    g.cites = g.cites || t.cites;
    groups.set(key, g);
  }
  const keys = new Set<string>([...spMap.keys(), ...groups.keys()]);
  const rows: ControlRow[] = [];
  for (const key of keys) {
    const sp = spMap.get(key);
    const g = groups.get(key);
    const bal = balMap.get(key);
    const autorizada = !!sp;
    const autorizadoM3 = Number(sp?.volumenAutorizadoM3 ?? 0);
    const autorizadoArboles = sp?.arbolesAutorizados ?? null;
    const censadoCount = g?.count ?? 0;
    const movilizado = bal?.movilizado ?? 0;
    const saldo = bal ? bal.saldo : autorizadoM3 - movilizado;
    const pctEjecutado = autorizadoM3 > 0 ? (movilizado / autorizadoM3) * 100 : 0;
    const flags: ControlFlag[] = [];
    if (!autorizada && censadoCount > 0) flags.push("no_autorizada");
    if (bal?.exceso) flags.push("exceso_volumen");
    if (autorizadoArboles != null && censadoCount > autorizadoArboles) flags.push("exceso_arboles");
    if (autorizada && censadoCount === 0 && autorizadoM3 > 0) flags.push("sin_censo");
    const tone: ControlTone =
      flags.includes("no_autorizada") || flags.includes("exceso_volumen") ? "danger"
        : flags.includes("exceso_arboles") || flags.includes("sin_censo") ? "warn"
          : "ok";
    rows.push({
      species: sp?.speciesCommon ?? g?.name ?? key, cites: sp?.cites ?? g?.cites ?? false,
      autorizada, autorizadoM3, autorizadoArboles, censadoCount, censadoVolM3: g?.vol ?? 0,
      georrefCount: g?.georref ?? 0, taladoCount: g?.talado ?? 0, movilizado, saldo, pctEjecutado, flags, tone,
    });
  }
  const toneRank: Record<ControlTone, number> = { danger: 0, warn: 1, ok: 2 };
  rows.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || b.autorizadoM3 - a.autorizadoM3 || b.censadoVolM3 - a.censadoVolM3);
  return rows;
}

export const FLAG_LABEL: Record<ControlFlag, string> = {
  no_autorizada: "Fuera del plan aprobado",
  exceso_volumen: "Movilizado excede autorizado",
  exceso_arboles: "Censo excede N° árboles autorizados",
  sin_censo: "Autorizada sin censo",
};

/**
 * Una fecha date-only del plan.
 *
 * `timeZone: "UTC"` no es un detalle: sin eso, a las 20:00 de Pucallpa el
 * navegador resta cinco horas y la resolución aparece fechada un día antes
 * (bug off-by-one ya corregido en el resto del libro).
 */
export function fmtFecha(x: string | null | undefined): string | null {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtRange(a: string | null, b: string | null) {
  if (!a && !b) return null;
  return `${fmtFecha(a) ?? "?"} → ${fmtFecha(b) ?? "?"}`;
}
