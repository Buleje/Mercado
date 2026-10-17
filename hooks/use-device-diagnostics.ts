"use client";

/**
 * useDeviceDiagnostics — junta en un solo lugar toda la ficha técnica del
 * dispositivo del admin (navegador, sistema, conexión, almacenamiento, estado
 * de la app/PWA). Fuente de verdad única para el tab Soporte Técnico: lo que
 * se muestra en pantalla y lo que se copia "para soporte" salen de acá.
 *
 * online se actualiza en vivo (eventos online/offline).
 */

import { useEffect, useState } from "react";

export type ConnGrade = "buena" | "regular" | "lenta" | "desconocida";

export interface DeviceDiagnostics {
  browser: string;
  platform: string;
  language: string;
  screen: string;
  window: string;
  dpr: string;
  systemDark: boolean;
  cores: string;
  deviceMemory: string;
  cookiesEnabled: boolean;
  https: boolean;
  // Conexión
  connType: string;
  connSpeed: number | null; // Mbps
  connRtt: number | null; // ms
  saveData: boolean;
  connGrade: ConnGrade;
  // App / PWA
  online: boolean;
  pwaInstalled: boolean;
  serviceWorker: "activo" | "disponible" | "no";
  appName: string;
  url: string;
  // Almacenamiento (async → puede tardar un tick)
  storage: {
    quota: number;
    usage: number;
    caches: number;
    localStorage: number;
    sessionStorage: number;
  } | null;
}

const APP_NAME = "Bodega San Martín";

function gradeSpeed(speed: number | null): ConnGrade {
  if (speed == null) return "desconocida";
  if (speed >= 5) return "buena";
  if (speed >= 1.5) return "regular";
  return "lenta";
}

function readSync(): Omit<DeviceDiagnostics, "storage"> {
  const nav = navigator as Navigator & Record<string, unknown>;
  const conn = (nav.connection || nav.mozConnection || nav.webkitConnection) as
    | Record<string, unknown>
    | undefined;
  const speed = (conn?.downlink as number) ?? null;
  const pwaInstalled =
    (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) ||
    (nav.standalone as boolean | undefined) === true;
  const sw: DeviceDiagnostics["serviceWorker"] = !("serviceWorker" in nav)
    ? "no"
    : nav.serviceWorker && (nav.serviceWorker as ServiceWorkerContainer).controller
      ? "activo"
      : "disponible";

  return {
    browser: (nav.userAgent as string | undefined)?.split(" ").pop() || "Desconocido",
    platform: (nav.platform as string | undefined) || "Desconocido",
    language: (nav.language as string | undefined) || "es",
    screen: `${screen.width} × ${screen.height} px`,
    window: `${window.innerWidth} × ${window.innerHeight} px`,
    dpr: `${window.devicePixelRatio}x`,
    systemDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    cores: nav.hardwareConcurrency ? `${nav.hardwareConcurrency} núcleos` : "No disponible",
    deviceMemory: nav.deviceMemory ? `~${nav.deviceMemory} GB` : "No disponible",
    cookiesEnabled: !!nav.cookieEnabled,
    https: location.protocol === "https:",
    connType: ((conn?.effectiveType as string) || "").toUpperCase() || "Desconocida",
    connSpeed: speed,
    connRtt: (conn?.rtt as number) ?? null,
    saveData: (conn?.saveData as boolean) ?? false,
    connGrade: gradeSpeed(speed),
    online: nav.onLine !== false,
    pwaInstalled,
    serviceWorker: sw,
    appName: APP_NAME,
    url: location.origin,
  };
}

export function useDeviceDiagnostics(): DeviceDiagnostics | null {
  const [diag, setDiag] = useState<DeviceDiagnostics | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const base = readSync();
    setDiag({ ...base, storage: null });

    // Almacenamiento (async)
    (async () => {
      const storage = { quota: 0, usage: 0, caches: 0, localStorage: 0, sessionStorage: 0 };
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          storage.quota = est.quota || 0;
          storage.usage = est.usage || 0;
        }
        if ("caches" in window) {
          const names = await caches.keys();
          let total = 0;
          for (const name of names) total += (await caches.open(name).then((c) => c.keys())).length;
          storage.caches = total;
        }
        let ls = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) ls += (localStorage.getItem(k)?.length || 0) * 2;
        }
        storage.localStorage = ls;
        let ss = 0;
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k) ss += (sessionStorage.getItem(k)?.length || 0) * 2;
        }
        storage.sessionStorage = ss;
      } catch (err) {
        console.debug("[diagnostics] storage estimate falló", err);
      }
      if (!cancelled) setDiag((d) => (d ? { ...d, storage } : d));
    })();

    // online/offline en vivo
    const sync = () => setDiag((d) => (d ? { ...d, online: navigator.onLine } : d));
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return diag;
}

/** Formatea el diagnóstico como texto plano para pegar en soporte/WhatsApp. */
export function diagnosticsToText(d: DeviceDiagnostics, stamp: string): string {
  const fmtBytes = (b: number) => {
    if (!b) return "0 B";
    const k = 1024;
    const s = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
  };
  const lines = [
    `📋 Diagnóstico — ${d.appName}`,
    stamp ? `Fecha: ${stamp}` : "",
    `URL: ${d.url}`,
    "",
    `Estado: ${d.online ? "Conectado" : "Sin conexión"}`,
    `App instalada: ${d.pwaInstalled ? "Sí" : "No (en navegador)"}`,
    `Service Worker: ${d.serviceWorker}`,
    `Conexión: ${d.connType}${d.connSpeed != null ? ` · ${d.connSpeed} Mbps` : ""}${d.connRtt != null ? ` · ${d.connRtt}ms` : ""} (${d.connGrade})`,
    "",
    `Navegador: ${d.browser}`,
    `Plataforma: ${d.platform}`,
    `Idioma: ${d.language}`,
    `Pantalla: ${d.screen} · Ventana: ${d.window} · ${d.dpr}`,
    `CPU: ${d.cores} · RAM: ${d.deviceMemory}`,
    `Modo oscuro del sistema: ${d.systemDark ? "Sí" : "No"}`,
    `Cookies: ${d.cookiesEnabled ? "Sí" : "No"} · HTTPS: ${d.https ? "Sí" : "No"}`,
  ];
  if (d.storage) {
    lines.push(
      "",
      `Almacenamiento: ${fmtBytes(d.storage.usage)} de ${fmtBytes(d.storage.quota)}`,
      `Datos guardados: ${fmtBytes(d.storage.localStorage)} · Caché: ${d.storage.caches} archivos`,
    );
  }
  return lines.filter((l) => l !== "").join("\n");
}
