/**
 * ADR-513 — la huella del celular como passkey (WebAuthn). Tipos y textos que
 * comparten la página pública del enlace, el panel y el servidor. Sin
 * `node:crypto` ni base: lo importa también el navegador.
 */

/** `AdelantoFirma.metodo` de una huella confirmada con el celular. */
export const METODO_PASSKEY = "passkey";

/** Va en `AdelantoFirma.consentimiento` (CHECK: HUELLA ⇒ no null). Subir la versión si cambia el texto. */
export const VERSION_CONSENTIMIENTO_PASSKEY = "passkey-v2-2026-10";
export const TEXTO_CONSENTIMIENTO_PASSKEY =
  "Confirmo este recibo con el desbloqueo de mi celular (huella o PIN). La página no recibe mi huella: sólo una firma digital de mi teléfono. Al registrar el celular se guardan la dirección IP y el tipo de navegador, como constancia del registro.";

/** El reto vale 5 minutos y se usa una vez. */
export const SEGUNDOS_RETO_PASSKEY = 300;

/**
 * Tope de llaves vigentes por persona (todos los dominios). El enlace registra
 * una SÓLO si la persona no tiene ninguna: cambiar de celular = el
 * administrador revoca la anterior desde la ficha (esa revocación es la
 * aprobación). El tope cuida a cualquier otro camino que registre.
 */
export const MAX_PASSKEYS_VIGENTES = 3;

/**
 * Lo que la passkey prueba, dicho sin inflarlo: el aparato registrado para la
 * persona confirmó. No es «su huella»: el celular la miró y firmó (huella o PIN).
 */
export const TEXTO_CONFIRMADO_PASSKEY = "Lo confirmó el aparato registrado para esta persona (passkey)";

/** De dónde salió la llave con que se firmó (constancia v2). */
/** `mismoEnlace: null` = llave anterior al 23-10, sin enlace guardado: no se sabe. */
export type RegistroDeLaLlave = { mismoEnlace: boolean | null; registradaEn: string | null };

/** «llave registrada con este mismo enlace» (prueba más débil) / «llave registrada el 20/10 con otro enlace». */
export function textoLlavePasskey(r: RegistroDeLaLlave): string {
  if (r.mismoEnlace === null) return "sin dato de con qué enlace se registró la llave";
  if (r.mismoEnlace) return "llave registrada con este mismo enlace";
  const m = r.registradaEn ? /^\d{4}-(\d{2})-(\d{2})/.exec(diaDeLima(r.registradaEn)) : null;
  return m ? `llave registrada el ${m[2]}/${m[1]} con otro enlace` : "llave registrada con otro enlace";
}

/** «2026-10-20» del instante, en hora de Lima (UTC−5 fijo, sin horario de verano). */
function diaDeLima(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * El sistema que DECLARA el navegador que registró la llave (user-agent): la
 * ficha lo rotula «según su navegador». No identifica a nadie y se puede fingir.
 */
export function sistemaQueDeclara(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

/** «registrar» = el celular todavía no tiene la llave para este dominio; «confirmar» = ya la tiene. */
export type ModoPasskey = "registrar" | "confirmar";

export type CodigoErrorPasskey =
  | "no_encontrado"
  | "vencido"
  | "usado"
  | "revocado"
  | "anulado"
  | "dni_no_coincide"
  | "origen_no_permitido"
  | "reto_vencido"
  | "reto_usado"
  | "no_verificada"
  | "credencial_ajena"
  | "contador_bajo"
  | "ya_registrada"
  | "tope_llaves"
  | "datos_invalidos";

/** Lo que devuelve `POST …/passkey/opciones` y `…/passkey/registrar`: las opciones van tal cual a @simplewebauthn/browser. */
export type OpcionesPasskeyRespuesta =
  | { modo: "registrar"; opciones: Record<string, unknown> }
  | { modo: "confirmar"; opciones: Record<string, unknown> };

/** Una passkey en la ficha de la persona (sin la llave pública). */
export interface PasskeyDeLaPersona {
  id: string;
  rpId: string;
  /** El sistema que declara el navegador que la registró («según su navegador»); se puede fingir. */
  navegador: string | null;
  /** Legado: el nombre que mandó quien la registró (las filas nuevas no lo traen). */
  nombrePuesto: string | null;
  creadaEn: string;
  usadaEn: string | null;
  revocadaEn: string | null;
}
