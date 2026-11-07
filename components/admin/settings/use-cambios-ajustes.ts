import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SeccionAjustes } from "@/components/admin/settings/secciones";

export type SettingsData = Record<string, unknown>;

/** Las secciones que se guardan con «Guardar cambios» (las demás guardan solas o en otra pantalla). */
export type SeccionConGuardar = Extract<SeccionAjustes, "negocio" | "cobros" | "delivery" | "tienda">;

/**
 * Qué campos de `/api/settings` edita cada sección (nombres de la API). Son
 * los mismos que mandaba el botón de cada sección; ahora se manda sólo lo que
 * cambió, así guardar los colores no reescribe el RUC de nadie.
 */
export const CLAVES_POR_SECCION: Record<SeccionConGuardar, readonly string[]> = {
  negocio: [
    "mode", "businessName", "businessPhone", "businessAddress", "businessLat", "businessLon",
    "logoUrl", "coverUrl", "bannerUrl", "description", "hours", "deliveryZone", "razonSocial", "ruc",
    "businessEmail", "currency", "businessType", "socialLinks", "invoiceFooterText",
  ],
  cobros: [
    "cashEnabled", "yapeEnabled", "yapeImage", "yapeName", "yapePhone",
    "plinEnabled", "plinImage", "plinName", "plinPhone",
    "transferEnabled", "transferBankName", "transferAccountNum", "transferAccountHolder",
    "cashAlertMax", "autoCloseTime", "sunatRuc", "sunatDenominacion", "taxRate",
    "maxDiscountPercent", "adelantoTopeCajero",
  ],
  delivery: ["deliveryZones", "freeDeliveryMin"],
  tienda: ["primaryColor", "secondaryColor", "slogan", "maintenanceMessage"],
};

const SECCIONES_CON_GUARDAR = Object.keys(CLAVES_POR_SECCION) as SeccionConGuardar[];

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Cambios sin guardar de Configuración (patrón «barra de guardado»: Shopify,
 * Loyverse). `formulario` es el estado en forma de API; `base`, lo que el
 * servidor tiene. Cuando difieren aparece la barra con «Guardar» y
 * «Descartar», y se queda a la vista aunque cambies de sección.
 *
 * `versionCarga` sube cada vez que el formulario se llena desde el servidor:
 * en ese render se toma la foto de la base.
 */
export function useCambiosAjustes({ formulario, versionCarga, aplicar, patch }: {
  formulario: SettingsData;
  versionCarga: number;
  aplicar: (d: SettingsData, opciones?: { parcial?: boolean }) => void;
  patch: (data: SettingsData) => Promise<boolean>;
}) {
  const [base, setBase] = useState<SettingsData | null>(null);
  const ultimo = useRef(formulario);
  ultimo.current = formulario;

  useEffect(() => {
    if (versionCarga > 0) setBase({ ...ultimo.current });
  }, [versionCarga]);

  const clavesCambiadas = useMemo(() => {
    if (!base) return [] as string[];
    return Object.keys(formulario).filter((k) => !igual(formulario[k], base[k]));
  }, [base, formulario]);

  const seccionesConCambios = useMemo(
    () => SECCIONES_CON_GUARDAR.filter((s) => CLAVES_POR_SECCION[s].some((k) => clavesCambiadas.includes(k))),
    [clavesCambiadas],
  );

  /** Lo que ya quedó guardado por otro camino (un interruptor que guarda al toque). */
  const marcarGuardado = useCallback((parcial: SettingsData) => {
    setBase((b) => (b ? { ...b, ...parcial } : b));
  }, []);

  /** Manda sólo lo que cambió. Devuelve lo enviado (o `null` si no se guardó). */
  const guardar = useCallback(async (): Promise<SettingsData | null> => {
    if (clavesCambiadas.length === 0) return null;
    const payload: SettingsData = {};
    for (const k of clavesCambiadas) payload[k] = formulario[k];
    const ok = await patch(payload);
    if (!ok) return null;
    marcarGuardado(payload);
    return payload;
  }, [clavesCambiadas, formulario, patch, marcarGuardado]);

  /** Vuelve cada campo a lo que tiene el servidor. */
  const descartar = useCallback(() => {
    if (base) aplicar(base, { parcial: true });
  }, [aplicar, base]);

  return { seccionesConCambios, guardar, descartar, marcarGuardado };
}
