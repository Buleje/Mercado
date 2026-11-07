/**
 * Hikvision DS-2CFSP4/4G (solar + 4G, Hik-Connect) — lo puro de la guía y de
 * «En vivo» (2026-10-05). Sin React: lo prueba `__tests__/camaras-hik-connect.test.ts`.
 *
 * Fuentes, verificadas el 05-10:
 *  · Ficha oficial (assets.hikvision.com, DS-2CFSP4_4G_Datasheet_20250701.pdf):
 *    «API: ISAPI · Client: Hik-Connect» (sin navegador web), «Motion detection
 *    (human and vehicle)», «Linkage: … notify surveillance center, trigger capture».
 *  · Manual iVMS-4200 V3.6.0 §3.2.4 «Add Device by Hik-Connect» y tabla 3-1
 *    «Remote Configuration» (el engranaje de la columna Operación).
 *  · Hikvision Europe, «How to get real-time alarm/event in HTTP listening
 *    mode»: la cámara sube cada evento con vinculación configurada al host de
 *    «HTTP Listening» (ISAPI `/ISAPI/Event/notification/httpHosts`).
 *  · Google Play: `com.connect.enduser` = «Hik-Connect - for End User».
 *  · App Store (iTunes lookup, Perú): id 1087803190 = «Hik-Connect»,
 *    Hangzhou Hikvision Digital Technology.
 *
 * Lo que NO está verificado y la pantalla no promete: un enlace que abra la
 * app en UNA cámara (Hikvision no publica esquema de enlace profundo) ni que
 * la Configuración remota por Hik-Connect de este modelo a batería muestre
 * «HTTP Listening» (Hikvision no publica el manual del modelo).
 */

export const HIK_CONNECT = {
  paqueteAndroid: "com.connect.enduser",
  playStore: "https://play.google.com/store/apps/details?id=com.connect.enduser",
  appStore: "https://apps.apple.com/pe/app/hik-connect/id1087803190",
  web: "https://www.hik-connect.com/",
} as const;

export const FUENTES_GUIA = {
  ficha:
    "https://assets.hikvision.com/prd/public/all/doc/m000158571/DS-2CFSP4_4G_Datasheet_20250701.pdf",
  ivms: "https://www.hikvision.com/en/support/download/software/ivms4200-series/",
  httpListening:
    "https://www.hikvisioneurope.com/eu/portal/portal/Technology%20Partner%20Program/03-How%20to/How%20to%20get%20real-time%20event%20in%20listening%20mode.pdf",
} as const;

export type Plataforma = "android" | "ios" | "pc";

/** iPadOS se presenta como Mac: lo delata la pantalla táctil. */
export function plataformaDe(userAgent: string, puntosTactiles = 0): Plataforma {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && puntosTactiles > 1) return "ios";
  return "pc";
}

export interface EnlaceEnVivo {
  href: string;
  /** Lo que pasa al tocarlo, dicho sin promesas: el video se ve en Hik-Connect. */
  titulo: string;
  nuevaPestana: boolean;
}

/**
 * Android: un `intent:` con el paquete de Hik-Connect y, si Chrome no la puede
 * abrir directo, su página de Play Store (con la app instalada muestra «Abrir»).
 * iOS: la página de App Store (mismo «Abrir»). PC: Hik-Connect en la web.
 */
export function enlaceEnVivo(plataforma: Plataforma): EnlaceEnVivo {
  if (plataforma === "android") {
    return {
      href: `intent://#Intent;package=${HIK_CONNECT.paqueteAndroid};S.browser_fallback_url=${encodeURIComponent(HIK_CONNECT.playStore)};end`,
      titulo:
        "Abre la app Hik-Connect. Si se abre Play Store, toca «Abrir». El video se ve en la app.",
      nuevaPestana: false,
    };
  }
  if (plataforma === "ios") {
    return {
      href: HIK_CONNECT.appStore,
      titulo: "Abre Hik-Connect desde App Store: toca «Abrir». El video se ve en la app.",
      nuevaPestana: false,
    };
  }
  return {
    href: HIK_CONNECT.web,
    titulo:
      "Abre Hik-Connect en la web (o iVMS-4200 si lo tienes en esta PC). El video se ve ahí, no en esta página.",
    nuevaPestana: true,
  };
}

/** Lo que se escribe campo por campo en «HTTP Listening» de la cámara. */
export interface ValoresHttpListening {
  /** «Dirección IP de destino o nombre de host». */
  host: string;
  /** «URL»: la ruta con el token, sin el host. */
  url: string;
  puerto: number;
  protocolo: "HTTPS" | "HTTP";
  /** Con HTTPS, la otra forma si el menú no ofrece HTTPS: HTTP por el 80. */
  alternativa: { protocolo: "HTTP"; puerto: number } | null;
}

/** Parte la dirección que se copia en los campos del menú. `null` si no hay dirección. */
export function valoresParaCamara(direccion: string): ValoresHttpListening | null {
  if (!direccion) return null;
  let u: URL;
  try {
    u = new URL(direccion);
  } catch {
    return null;
  }
  const https = u.protocol === "https:";
  const puerto = u.port ? Number(u.port) : https ? 443 : 80;
  return {
    host: u.hostname,
    url: `${u.pathname}${u.search}`,
    puerto,
    protocolo: https ? "HTTPS" : "HTTP",
    /* Un túnel o dominio con HTTPS en el 443 también atiende HTTP en el 80
       (la prueba de recepción lo confirma o lo descarta). */
    alternativa: https && !u.port ? { protocolo: "HTTP", puerto: 80 } : null,
  };
}
