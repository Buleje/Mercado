/**
 * ruc — validar el RUC que se guarda aparte del DNI en la ficha (ADR-524 §3.3).
 *
 * Bloquea lo que no puede ser un RUC (largo, prefijo, dígito verificador) y
 * AVISA, sin bloquear, cuando el RUC de persona natural (prefijo 10) no lleva
 * adentro el DNI de la misma ficha: 10 + DNI + dígito. Puede ser legítimo (un
 * DNI que se renovó con otro número), por eso no se rechaza.
 *
 * El dígito verificador es el de `rucChecksumOk` del directorio (comprobado con
 * RUCs reales): una sola fórmula para todo el panel.
 */
import { rucChecksumOk } from "@/lib/forestal/directorio";

export type ResultadoRuc = { ok: true; aviso: string | null } | { ok: false; motivo: string };

const PREFIJOS = ["10", "15", "17", "20"] as const;

export function validarRuc(
  ruc: string,
  persona: { docTipo?: string | null; docNumero?: string | null } = {},
): ResultadoRuc {
  const n = ruc.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(n)) return { ok: false, motivo: "El RUC tiene 11 dígitos, sin letras ni espacios." };
  if (!PREFIJOS.some((p) => n.startsWith(p))) {
    return { ok: false, motivo: "El RUC empieza con 10, 15, 17 o 20." };
  }
  if (!rucChecksumOk(n)) {
    return { ok: false, motivo: "Ese RUC no existe: el último dígito no corresponde. Revisa si bailó un número." };
  }
  const dni = (persona.docNumero ?? "").replace(/\D/g, "");
  if (n.startsWith("10") && persona.docTipo === "DNI" && dni.length === 8 && n.slice(2, 10) !== dni) {
    return { ok: true, aviso: `El RUC no lleva el DNI ${dni} de la ficha (un RUC 10 es 10 + DNI + 1 dígito). Revísalo.` };
  }
  return { ok: true, aviso: null };
}
