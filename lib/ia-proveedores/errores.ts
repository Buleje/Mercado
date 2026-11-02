/**
 * Buleje IA (ADR-528) — qué quiso decir el proveedor cuando falló.
 *
 * Cada empresa contesta distinto (Google da 400 con «API key not valid»,
 * DeepSeek 402 sin saldo, OpenAI 429 «insufficient_quota» cuando NO es un
 * límite por minuto sino falta de crédito). Acá se juntan en los 8
 * `EstadoProveedorIa` y en UNA frase para la persona.
 *
 * Sin `server-only`: la pantalla usa `mensajeDeEstado` para el aviso.
 */

import type { EstadoProveedorIa } from "./tipos";

const RE_CLAVE = /api[\s_-]?key|invalid[_\s]?(api[_\s]?)?key|unauthori[sz]ed|authentication|incorrect api key|invalid_x_api_key|invalid token|token.*(invalid|expired)/i;
const RE_CREDITO = /insufficient[_\s]?(quota|balance|funds|credit)|credit balance|balance is (too )?low|billing|out of credits|no credits|payment required|arrearage|exceeded your current quota|account.*(suspend|overdue)/i;
const RE_MODELO = /model[_\s]?not[_\s]?found|does not exist|no such model|unknown model|model.*(not (found|available|supported)|decommissioned|deprecated)|invalid model/i;

/** Traduce el status HTTP + el cuerpo del error a un estado. */
export function estadoDeHttp(status: number, cuerpo = ""): EstadoProveedorIa {
  const texto = cuerpo.slice(0, 2000);
  if (status >= 200 && status < 300) return "ok";
  if (status === 402 || RE_CREDITO.test(texto)) return "sin_credito";
  if (status === 401) return "clave_invalida";
  if (status === 404 || RE_MODELO.test(texto)) return "modelo_no_disponible";
  if (status === 403) return RE_CLAVE.test(texto) ? "clave_invalida" : "sin_permiso";
  if (status === 429) return "limite_ia";
  if (status === 400 && RE_CLAVE.test(texto)) return "clave_invalida";
  return "error";
}

/** Un fallo de red o de tiempo (fetch tiró). */
export function estadoDeExcepcion(err: unknown): EstadoProveedorIa {
  const nombre = (err as { name?: string } | null)?.name ?? "";
  if (nombre === "SsrfBlockedError") return "sin_permiso";
  return "sin_conexion";
}

/** Frase para la persona, sin jerga. `nombre` = «Claude», «Gemini»… */
export function mensajeDeEstado(estado: EstadoProveedorIa, nombre = "el proveedor"): string {
  switch (estado) {
    case "ok":
      return `${nombre} responde bien.`;
    case "clave_invalida":
      return `Esa clave no es válida para ${nombre}. Cópiala de nuevo desde su página, completa.`;
    case "sin_credito":
      return `La cuenta de ${nombre} no tiene saldo. Recarga crédito en su página y vuelve a probar.`;
    case "modelo_no_disponible":
      return `Ese modelo ya no está en ${nombre} (o tu cuenta no lo tiene). Elige otro de la lista.`;
    case "limite_ia":
      return `${nombre} pidió esperar un momento (demasiados pedidos seguidos). Prueba en un minuto.`;
    case "sin_conexion":
      return `No se pudo llegar a ${nombre}: revisa la dirección o prueba en un rato.`;
    case "sin_permiso":
      return `${nombre} no deja usar esa clave para esto (o la dirección no está permitida).`;
    default:
      return `${nombre} contestó con un error. Prueba en un rato o elige otro modelo.`;
  }
}

/** Estados que dicen «la clave del negocio ya no sirve» y se anotan en `ultimoEstado`. */
export function esFallaDeCuenta(estado: EstadoProveedorIa): boolean {
  return estado === "clave_invalida" || estado === "sin_credito" || estado === "modelo_no_disponible" || estado === "sin_permiso";
}
