import "server-only";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #21 — Conciliacion bancaria CSV
 *
 * Parsea un CSV bancario (formato BCP / Interbank / BBVA simplificado) y
 * lo matchea contra los pagos registrados en la DB para producir un
 * reporte de conciliación: matched / unmatched / ambiguous.
 *
 * Interfaz deliberadamente simple — pasamos el contenido del CSV como
 * string, devolvemos el resultado. El caller se encarga de leer el
 * archivo y escribir el reporte.
 */

export interface BankRow {
  date: string;
  description: string;
  amount: number;
  reference?: string;
}

export interface SystemPayment {
  id: string;
  date: string;
  amount: number;
  reference?: string;
  method?: string;
}

export interface Match {
  bank: BankRow;
  system: SystemPayment;
  confidence: number;
}

export interface ReconciliationResult {
  matched: Match[];
  unmatchedBank: BankRow[];
  unmatchedSystem: SystemPayment[];
  ambiguous: { bank: BankRow; candidates: SystemPayment[] }[];
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseBankCsv(csv: string): BankRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length <= 1) return [];
  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("fecha") || header.includes("date") || header.includes("monto");
  const rows = hasHeader ? lines.slice(1) : lines;

  const parsed: BankRow[] = [];
  for (const line of rows) {
    const cols = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const [date, description, amountRaw, reference] = cols;
    const amount = parseAmount(amountRaw);
    if (!date || amount === 0) continue;
    parsed.push({ date, description, amount, reference: reference ?? undefined });
  }
  return parsed;
}

const AMOUNT_TOLERANCE = 0.01;
const DATE_TOLERANCE_DAYS = 3;

function datesClose(a: string, b: string): boolean {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
  return Math.abs(da - db) <= DATE_TOLERANCE_DAYS * 24 * 60 * 60 * 1000;
}

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

/**
 * Match rows from the bank statement against system payments.
 * Priority:
 *  1. exact reference match (confidence 1.0)
 *  2. amount + date within tolerance (confidence 0.7)
 *  3. ambiguous: multiple candidates → mark for manual review
 */
export function reconcile(
  bankRows: BankRow[],
  systemPayments: SystemPayment[],
): ReconciliationResult {
  const matched: Match[] = [];
  const ambiguous: ReconciliationResult["ambiguous"] = [];
  const consumedSystem = new Set<string>();
  const unmatchedBank: BankRow[] = [];

  for (const bank of bankRows) {
    if (bank.reference) {
      const byRef = systemPayments.find(
        (p) => !consumedSystem.has(p.id) && p.reference === bank.reference,
      );
      if (byRef) {
        matched.push({ bank, system: byRef, confidence: 1 });
        consumedSystem.add(byRef.id);
        continue;
      }
    }

    const candidates = systemPayments.filter(
      (p) =>
        !consumedSystem.has(p.id) &&
        amountsClose(p.amount, bank.amount) &&
        datesClose(p.date, bank.date),
    );

    if (candidates.length === 1) {
      matched.push({ bank, system: candidates[0], confidence: 0.7 });
      consumedSystem.add(candidates[0].id);
    } else if (candidates.length > 1) {
      ambiguous.push({ bank, candidates });
    } else {
      unmatchedBank.push(bank);
    }
  }

  const unmatchedSystem = systemPayments.filter((p) => !consumedSystem.has(p.id));

  logger.info("[bank-reconciliation] done", {
    bankRows: bankRows.length,
    systemPayments: systemPayments.length,
    matched: matched.length,
    ambiguous: ambiguous.length,
    unmatchedBank: unmatchedBank.length,
    unmatchedSystem: unmatchedSystem.length,
  });

  return { matched, unmatchedBank, unmatchedSystem, ambiguous };
}
