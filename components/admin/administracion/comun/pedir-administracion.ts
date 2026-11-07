/**
 * pedir-administracion — fetch de Trámites, Alquileres y el PATCH de la ficha
 * del directorio (ADR-524). Como `pedirJson` de la agenda (nunca lanza, CSRF en
 * las escrituras), pero traduce los CÓDIGOS del contrato
 * (`lib/admin/fichas-tramites-alquileres.ts`) a una frase: `pedirJson` los
 * descarta por tener forma de código y deja el mensaje genérico del estado.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import type { CodigoErrorAdministracion } from "@/lib/admin/fichas-tramites-alquileres";

export type RespuestaAdm<T> = { ok: true; data: T } | { ok: false; status: number; codigo: string | null; error: string };

/** El nombre visible de cada campo que el servidor puede nombrar en `parece_clave`. */
const NOMBRE_CAMPO: Record<string, string> = {
  notas: "Notas",
  contacto: "Contacto",
  proximoPaso: "Próximo paso",
  asunto: "Asunto",
  entidadNombre: "Entidad",
  personaNombre: "Persona",
  nota: "Nota del requisito",
  nombre: "Nombre",
  reajuste: "Reajuste",
  cuentaBanco: "Cuenta",
  cuentaCci: "CCI",
  cuentaTitular: "Titular de la cuenta",
  numeroOperacion: "N.º de operación",
  parentesco: "Parentesco",
  nacimientoLugar: "Lugar de nacimiento",
  rucCondicion: "Condición del RUC",
  direccion: "Dirección",
  observaciones: "Observaciones",
  nuevaNota: "Nota",
};

const MENSAJE_POR_ESTADO: Record<number, string> = {
  401: "Tu sesión venció: vuelve a entrar.",
  403: "Tu usuario no puede hacer esto.",
  404: "No se encontró: ciérralo y actualiza la lista.",
  429: "Muchos pedidos seguidos: espera unos segundos.",
};

/** La frase para un código del contrato; `null` si el código no es de los conocidos. */
export function mensajeAdministracion(codigo: string, campo?: string | null): string | null {
  switch (codigo as CodigoErrorAdministracion) {
    case "periodo_ya_pagado":
      return "Ese mes ya tiene un pago registrado. Si el monto o la fecha están mal, quita ese pago y regístralo de nuevo.";
    case "periodo_fuera_de_plazo":
      return "Ese mes está fuera del plazo del contrato.";
    case "parece_clave": {
      const nombre = campo ? (NOMBRE_CAMPO[campo] ?? campo) : "Un campo";
      return `«${nombre}» parece una clave o contraseña. Aquí no se guardan claves (Clave SOL, PIN, contraseñas): bórrala de ese campo.`;
    }
    case "ruc_invalido":
      return "Ese RUC no es válido: son 11 dígitos y el último es de control. Revísalo en la ficha RUC.";
    case "tiene_pagos":
      return "Este alquiler tiene pagos registrados: no se puede borrar. Pásalo a «Terminado».";
    case "not_found":
      return "Ya no existe: ciérralo y actualiza la lista.";
    case "invalid_body":
      return "Revisa los datos: hay un campo con un valor que no se acepta.";
    default:
      return null;
  }
}

function mensajeDe(cuerpo: unknown, status: number): { codigo: string | null; error: string } {
  if (cuerpo && typeof cuerpo === "object") {
    const { error, message, campo } = cuerpo as { error?: unknown; message?: unknown; campo?: unknown };
    const codigo = typeof error === "string" ? error : null;
    const conocido = codigo ? mensajeAdministracion(codigo, typeof campo === "string" ? campo : null) : null;
    /* `invalid_body` con su `message` de Zod: el detalle sirve más que la frase genérica. */
    if (conocido && !(codigo === "invalid_body" && typeof message === "string" && message.length < 200)) return { codigo, error: conocido };
    if (typeof message === "string" && message.length > 0 && message.length < 200) return { codigo, error: message };
    if (codigo && !/^[a-z_]+$/.test(codigo) && codigo.length < 200) return { codigo: null, error: codigo };
    if (conocido) return { codigo, error: conocido };
  }
  return {
    codigo: null,
    error: MENSAJE_POR_ESTADO[status] ?? (status >= 500 ? "El servidor no respondió bien. Intenta de nuevo en un momento." : "No se pudo completar."),
  };
}

/** GET sin cuerpo; POST/PATCH/DELETE con JSON y CSRF. Nunca lanza. */
export async function pedirAdm<T>(url: string, metodo: "GET" | "POST" | "PATCH" | "DELETE" = "GET", cuerpo?: unknown): Promise<RespuestaAdm<T>> {
  const init: RequestInit = { method: metodo, cache: "no-store", credentials: "include" };
  if (metodo !== "GET") {
    init.headers = csrfHeaders(cuerpo !== undefined ? { "Content-Type": "application/json" } : {});
    if (cuerpo !== undefined) init.body = JSON.stringify(cuerpo);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, codigo: null, error: "Sin conexión: revisa tu internet e intenta de nuevo." };
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, ...mensajeDe(json, res.status) };
  return { ok: true, data: json as T };
}

/** `?a=1&b=x` con sólo los valores puestos. */
export function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
