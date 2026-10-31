/**
 * Los pasos de la ficha del Directorio (Brandon 24-10: «la misma mejora de
 * organización por bloques para el modal de Agregar al directorio»). Antes eran
 * 9 secciones apiladas en 3,2 pantallas (6 en el celular); ahora se ve un paso
 * y la barra de arriba dice cuál está completo, cuál tiene algo por cargar y
 * cuál tiene algo mal escrito.
 *
 * Nada se movió de su sección: el paso sólo decide cuál se ve. Puro (lo prueban
 * sin navegador): qué pasos hay, en qué paso se carga cada dato que reclama la
 * salud de la ficha (`directorio-salud`) y cómo está cada paso.
 */
import type { Pendiente } from "./directorio-salud";
import type { EstadoDelPaso } from "./loth-plan-pasos";

export type PasoFicha = "quien" | "papel" | "donde" | "pago" | "papeles";

export interface PasoDeLaFicha {
  id: PasoFicha;
  /** El rótulo corto de la barra (entra en un botón angosto). */
  corto: string;
}

/** Los pasos, en el orden en que se llena una ficha. «Según el papel», sólo si algún papel pide algo propio. */
export function pasosDeLaFicha(hayPapel: boolean): PasoDeLaFicha[] {
  return [
    { id: "quien", corto: "Quién es" },
    ...(hayPapel ? [{ id: "papel" as const, corto: "Según el papel" }] : []),
    { id: "donde", corto: "Dónde y contacto" },
    { id: "pago", corto: "Pago y vínculos" },
    { id: "papeles", corto: "Papeles y notas" },
  ];
}

/**
 * Dónde se carga cada dato que `pendientesDeFicha` reclama. Si la salud suma un
 * campo nuevo y nadie lo agrega acá, el test lo dice (cae a «Quién es», que es
 * donde arranca la ficha, y no desaparece).
 */
export const PASO_DEL_PENDIENTE: Readonly<Record<string, PasoFicha>> = {
  Documento: "quien",
  "Registro MTC": "papel",
  "Licencia de conducir": "papel",
  "Título habilitante": "papel",
  "Representante legal": "papel",
  Dirección: "donde",
  "Departamento, provincia y distrito": "donde",
  Ubigeo: "donde",
  "Teléfono o WhatsApp": "donde",
  "Cuenta para pagarle": "pago",
  "Condición de pago": "pago",
};

export function pasoDelPendiente(campo: string): PasoFicha {
  return PASO_DEL_PENDIENTE[campo] ?? "quien";
}

/** Lo que está mal escrito AHORA (no lo que falta): bloquea o avisa al guardar. */
export interface ErroresDeLaFicha {
  /** RUC/DNI con formato o dígito verificador mal, o que ya es de otra ficha al editar. */
  documento?: boolean;
  /** El DNI del representante del proveedor. */
  representanteDni?: boolean;
  /** Un precio del cliente escrito y sin guardar que no se entiende. */
  precio?: boolean;
  /** CCI que no tiene 20 dígitos. */
  cci?: boolean;
}

/** El paso de cada error: «Guardar» lleva ahí, y ese paso se marca en rojo. */
export const PASO_DEL_ERROR: Readonly<Record<keyof ErroresDeLaFicha, PasoFicha>> = {
  documento: "quien",
  representanteDni: "papel",
  precio: "papel",
  cci: "pago",
};

export interface DatosDelEstado {
  /** Lo que esta ficha necesita según sus papeles: `pendientesDeFicha` sobre una ficha vacía con los mismos roles. */
  requisitos: readonly Pick<Pendiente, "campo">[];
  /** Lo que todavía le falta. */
  pendientes: readonly Pick<Pendiente, "campo">[];
  errores: ErroresDeLaFicha;
  /** El nombre es lo único obligatorio de la ficha. */
  sinNombre: boolean;
  /** Ya se tocó «Guardar» una vez: lo obligatorio vacío pasa de aviso a rojo. */
  intento: boolean;
}

/**
 * · `falta`: algo mal escrito en el paso, o el nombre vacío tras intentar guardar.
 * · `pendiente`: algo que la ficha necesita para sus papeles y todavía no está.
 * · `completo`: el paso tiene requisitos y están todos.
 * · `opcional`: ningún papel de esta ficha pide nada de este paso.
 */
export function estadoDePasoFicha(paso: PasoFicha, d: DatosDelEstado): EstadoDelPaso {
  const conError = (Object.keys(d.errores) as (keyof ErroresDeLaFicha)[]).some(
    (k) => d.errores[k] && PASO_DEL_ERROR[k] === paso,
  );
  if (conError) return "falta";
  if (paso === "quien" && d.sinNombre) return d.intento ? "falta" : "pendiente";
  if (d.pendientes.some((p) => pasoDelPendiente(p.campo) === paso)) return "pendiente";
  const pide = paso === "quien" || d.requisitos.some((p) => pasoDelPendiente(p.campo) === paso);
  return pide ? "completo" : "opcional";
}

/** El paso que se ve: si el actual dejó de existir (se desmarcaron los papeles), el que le sigue. */
export function pasoVisibleDeLaFicha(pasos: readonly PasoDeLaFicha[], actual: PasoFicha): PasoFicha {
  if (pasos.some((p) => p.id === actual)) return actual;
  return actual === "papel" ? "donde" : (pasos[0]?.id ?? "quien");
}
