"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CredencialesRespuesta, ReauthEntrada, TipoCandado } from "@/lib/superadmin/candado-reglas";
import { abrirPanelDeTienda } from "@/components/superadmin/tenants/abrir-panel-tienda";

/** Estado del candado tal como llega en el 423 de la ruta de credenciales. */
export interface CandadoCerrado {
  configurado: boolean;
  tipo: TipoCandado | null;
  bloqueadoHasta: number | null;
  /** El superadmin tiene 2FA: confirmar/recuperar el candado pide también el código. */
  totpActivo: boolean;
}

export type FaseCredenciales =
  | { fase: "cargando" }
  | { fase: "cerrado"; candado: CandadoCerrado }
  | { fase: "abierto"; datos: CredencialesRespuesta }
  | { fase: "error"; mensaje: string };

/** Contraseña recién generada: se muestra UNA vez y se olvida al cerrar el candado. */
export interface ContrasenaGenerada {
  adminUserId: string;
  usuario: string;
  clave: string;
}

const JSON_POST = () => csrfHeaders({ "Content-Type": "application/json" });

/** Mensaje del servidor o uno de respaldo (las rutas devuelven `{ message }` o `{ error }`). */
async function mensajeDe(res: Response, respaldo: string): Promise<string> {
  const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string; restantes?: number };
  if (d.error === "incorrecto" && typeof d.restantes === "number") {
    return `No coincide. Te quedan ${d.restantes} intento${d.restantes === 1 ? "" : "s"} antes del bloqueo de 15 minutos.`;
  }
  if (res.status === 429) return "Demasiados intentos desde esta red. Espera un rato y vuelve a probar.";
  return d.message ?? (d.error && d.error.length < 80 ? d.error : respaldo);
}

/**
 * Datos y acciones de la pestaña «Credenciales»: lee la ruta protegida por el
 * candado; si responde 423 la vista muestra el candado, y al abrirlo vuelve a leer.
 * Al vencer el desbloqueo (5 min) vuelve sola a «cerrado».
 */
export function useCredencialesTienda(slug: string) {
  const [estado, setEstado] = useState<FaseCredenciales>({ fase: "cargando" });
  const [generada, setGenerada] = useState<ContrasenaGenerada | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(slug)}/credenciales`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        setEstado({ fase: "abierto", datos: (await res.json()) as CredencialesRespuesta });
        return;
      }
      if (res.status === 423) {
        const d = (await res.json().catch(() => ({}))) as Partial<CandadoCerrado>;
        setGenerada(null);
        setEstado({
          fase: "cerrado",
          candado: {
            configurado: !!d.configurado,
            tipo: d.tipo ?? null,
            bloqueadoHasta: d.bloqueadoHasta ?? null,
            totpActivo: !!d.totpActivo,
          },
        });
        return;
      }
      setEstado({ fase: "error", mensaje: await mensajeDe(res, "No se pudieron leer las credenciales.") });
    } catch {
      setEstado({ fase: "error", mensaje: "Error de red." });
    }
  }, [slug]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Reloj del desbloqueo: cuenta regresiva y, al vencer, vuelve a cerrar la vista.
  const vence = estado.fase === "abierto" ? estado.datos.desbloqueadoHasta : null;
  useEffect(() => {
    if (vence == null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setAhora(t);
      if (t >= vence) void cargar();
    }, 1000);
    return () => window.clearInterval(id);
  }, [vence, cargar]);

  /** Abre el candado. Devuelve el mensaje de error o `null` si abrió. */
  const abrir = useCallback(
    async (secreto: string): Promise<string | null> => {
      const res = await fetch("/api/superadmin/candado", {
        method: "POST",
        credentials: "include",
        headers: JSON_POST(),
        body: JSON.stringify({ accion: "verificar", secreto }),
      }).catch(() => null);
      if (!res) return "Error de red.";
      if (!res.ok) {
        const msg = await mensajeDe(res, "No se pudo abrir el candado.");
        if (res.status === 423) void cargar();
        return msg;
      }
      await cargar();
      return null;
    },
    [cargar],
  );

  /**
   * Configura el candado: la primera vez y «Olvidé mi candado» con `reauth`
   * (contraseña + 2FA), un cambio con `actual`. Devuelve el error o `null`.
   */
  const configurar = useCallback(
    async (tipo: TipoCandado, secreto: string, actual?: string, reauth?: ReauthEntrada): Promise<string | null> => {
      const res = await fetch("/api/superadmin/candado", {
        method: "POST",
        credentials: "include",
        headers: JSON_POST(),
        body: JSON.stringify({ accion: "configurar", tipo, secreto, ...(actual ? { actual } : {}), ...(reauth ? { reauth } : {}) }),
      }).catch(() => null);
      if (!res) return "Error de red.";
      if (!res.ok) return mensajeDe(res, "No se pudo guardar el candado.");
      await cargar();
      return null;
    },
    [cargar],
  );

  /** Cierra el candado ya (sin esperar los 5 min). */
  const cerrar = useCallback(async () => {
    setGenerada(null);
    await fetch("/api/superadmin/candado", {
      method: "POST",
      credentials: "include",
      headers: JSON_POST(),
      body: JSON.stringify({ accion: "cerrar" }),
    }).catch(() => null);
    await cargar();
  }, [cargar]);

  /** Genera una contraseña temporal para un usuario (TOTP obligatorio). Devuelve el error o `null`. */
  const generar = useCallback(
    async (adminUserId: string, totpCode: string): Promise<string | null> => {
      const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(slug)}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: JSON_POST(),
        body: JSON.stringify({ adminUserId, totpCode }),
      }).catch(() => null);
      if (!res) return "Error de red.";
      if (res.status === 423) {
        await cargar();
        return "El candado se cerró. Ábrelo de nuevo.";
      }
      const d = (await res.json().catch(() => ({}))) as { tempPassword?: string; username?: string; error?: string; message?: string };
      if (!res.ok || !d.tempPassword) {
        if (d.error === "totp_invalid") return "Código de 2FA inválido o vencido.";
        if (d.error === "totp_not_enrolled") return "Activa tu 2FA en Seguridad antes de generar contraseñas.";
        return d.message ?? d.error ?? "No se pudo generar la contraseña.";
      }
      setGenerada({ adminUserId, usuario: d.username ?? "", clave: d.tempPassword });
      void cargar();
      return null;
    },
    [slug, cargar],
  );

  /** «Entrar como esta tienda» (exige el candado abierto). Devuelve el error o `null`. */
  const entrar = useCallback(async (): Promise<string | null> => {
    const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(slug)}/credenciales/entrar`, {
      method: "POST",
      credentials: "include",
      headers: JSON_POST(),
      body: "{}",
    }).catch(() => null);
    if (!res) return "Error de red.";
    if (res.status === 423) {
      await cargar();
      return "El candado se cerró. Ábrelo de nuevo.";
    }
    if (!res.ok) return mensajeDe(res, "No se pudo entrar como la tienda.");
    await abrirPanelDeTienda(slug);
    return null;
  }, [slug, cargar]);

  const segundosRestantes = vence != null ? Math.max(0, Math.round((vence - ahora) / 1000)) : 0;

  return { estado, cargar, abrir, configurar, cerrar, generar, entrar, generada, olvidarGenerada: () => setGenerada(null), segundosRestantes };
}

export type CredencialesTienda = ReturnType<typeof useCredencialesTienda>;
