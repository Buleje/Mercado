/**
 * lib/tienda-cliente/google-un-toque.ts — el globito de Google (Google Identity
 * Services, One Tap sobre FedCM) del lado del navegador (17-10).
 *
 * Sólo carga `accounts.google.com/gsi/client` cuando hay client id público
 * (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) y alguien lo pide: sin client id no se baja
 * nada y la tienda queda con el botón de siempre. La CSP abre esos orígenes
 * sólo fuera del panel (`buildCSP`, lib/middleware-utils.ts).
 */

export const URL_GIS = "https://accounts.google.com/gsi/client";
export const RUTA_UN_TOQUE = "/api/tienda-cliente/google";

/** Client id web de Google (público por diseño). null = sin globito. */
export function idClienteGoogle(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
}

/** Lo que usamos de `google.accounts.id` (tipos mínimos, sin @types). */
export interface RespuestaCredencial {
  credential?: string;
}
export interface OpcionesGis {
  client_id: string;
  callback: (r: RespuestaCredencial) => void;
  nonce: string;
  auto_select?: boolean;
  login_hint?: string;
  cancel_on_tap_outside?: boolean;
  context?: "signin" | "signup" | "use";
  itp_support?: boolean;
  use_fedcm_for_prompt?: boolean;
}
interface GisId {
  initialize: (o: OpcionesGis) => void;
  prompt: () => void;
  cancel: () => void;
  disableAutoSelect: () => void;
}
interface VentanaConGoogle {
  google?: { accounts?: { id?: GisId } };
}

export function gis(): GisId | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as VentanaConGoogle).google?.accounts?.id ?? null;
}

let carga: Promise<GisId | null> | null = null;

/** Baja el script de Google una sola vez por página. null si no cargó (CSP, red, bloqueador). */
export function cargarGis(): Promise<GisId | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const ya = gis();
  if (ya) return Promise.resolve(ya);
  if (!carga) {
    carga = new Promise<GisId | null>((resolver) => {
      const s = document.createElement("script");
      s.src = URL_GIS;
      s.async = true;
      s.onload = () => resolver(gis());
      s.onerror = () => {
        carga = null; // otra página/intento puede volver a probar
        resolver(null);
      };
      document.head.appendChild(s);
    });
  }
  return carga;
}

/** Tras «Salir» / «No soy yo»: que el globito no vuelva a entrar solo. Sin GIS cargado, no hace nada. */
export function desactivarEntradaAutomatica(): void {
  try {
    gis()?.disableAutoSelect();
  } catch {
    /* GIS a medio cargar: el recuerdo local ya apagó `autoEntrar` */
  }
}
