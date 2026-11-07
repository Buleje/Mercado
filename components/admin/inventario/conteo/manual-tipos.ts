import { limaDateKey } from "@/lib/utils";

/** Tipos y utilidades del conteo manual (se guarda en este navegador, un conteo por día). */

export interface ProductoManual {
  id: number;
  name: string;
  sku?: string;
  stock: number;
}

export interface FilaConteo {
  productId: number;
  productName: string;
  sku: string;
  systemStock: number;
  realStock: number | "";
  reason: string;
}

export interface SesionConteo {
  id: string;
  date: string;
  rows: FilaConteo[];
  status: "pendiente" | "aplicado";
  totalCounted: number;
  differences: number;
}

export type VistaManual = "start" | "counting" | "reconcile" | "history";

export const MOTIVOS = [
  { value: "", label: "Elige el motivo" },
  { value: "error-conteo", label: "Error de conteo" },
  { value: "robo", label: "Robo / hurto" },
  { value: "dano", label: "Daño" },
  { value: "vencido", label: "Producto vencido" },
  { value: "otro", label: "Otro" },
];

const PREFIJO = "bodega-physical-count-";

export const hoyClave = () => limaDateKey();
const claveDe = (fecha: string) => `${PREFIJO}${fecha}`;

export function leerSesion(fecha: string): SesionConteo | null {
  try {
    const raw = localStorage.getItem(claveDe(fecha));
    return raw ? (JSON.parse(raw) as SesionConteo) : null;
  } catch {
    return null;
  }
}

export function leerSesiones(): SesionConteo[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIJO))
    .map((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? "") as SesionConteo;
      } catch {
        return null;
      }
    })
    .filter((s): s is SesionConteo => s !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function guardarSesion(s: SesionConteo) {
  localStorage.setItem(claveDe(s.date), JSON.stringify(s));
}

export function diferenciaDe(f: FilaConteo): number {
  return f.realStock === "" ? 0 : f.realStock - f.systemStock;
}

export const colorDiferencia = (d: number) => (d < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]");
