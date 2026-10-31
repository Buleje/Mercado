"use client";

/**
 * Mandar el recibo del adelanto por WhatsApp (23-10). Dos pasos, como el
 * enlace para firmar: el navegador bloquea un `window.open` que llega después
 * de un `await`, así que primero se PREPARA (el PDF al Archivo + su enlace que
 * vence) y después el «Abrir WhatsApp» es un enlace de verdad que el usuario
 * toca. El envío se anota al tocarlo (o al compartir el archivo en el celular).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import {
  celularParaRecibo,
  fechaCortaLima,
  fichaSinTelefono,
  mensajeRecibo,
  puedeMandarRecibo,
  type ViaEnvio,
} from "@/lib/adelantos/recibo-whatsapp";
import { reciboComoArchivo } from "../detalle/comprobante-del-adelanto";

/** Lo que dice el mensaje, como lo guarda la base (la ruta lo devuelve): no lo que muestra la pantalla. */
interface DatosDelMensaje {
  nombre: string;
  codigo: string | null;
  monto: string;
  negocio: string;
}

interface Preparado {
  documentoId: string;
  enlace: string;
  venceEn: string;
  archivo: File;
  datos: DatosDelMensaje;
}

export interface EnvioAnotado {
  en: string;
  nueve: string;
  via: ViaEnvio;
  celularAnotado: boolean;
}

const url = (id: string) => `/api/adelantos/${encodeURIComponent(id)}/recibo-whatsapp`;

export function useEnviarRecibo(a: DbAdelanto, onEnviado: () => void) {
  const telefonoFicha = a.beneficiario?.telefono ?? "";
  const [celular, setCelular] = useState(() => {
    const v = celularParaRecibo(telefonoFicha);
    return v.ok ? v.nueve : telefonoFicha.replace(/\D/g, "");
  });
  const [preparando, setPreparando] = useState(false);
  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [enviado, setEnviado] = useState<EnvioAnotado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anotando = useRef(false);
  const rol = useMiRol();
  /* El encargado ve el adelanto pero no la carpeta privada de la persona: el
     servidor le diría 403. `null` = todavía no se sabe: no se apaga nada. */
  const sinPermiso = rol != null && !puedeMandarRecibo(rol);

  const valido = celularParaRecibo(celular);
  const nueve = valido.ok ? valido.nueve : null;
  /* El número que se escribe NO pisa el de la ficha: sólo se anota si estaba
     vacía (`fichaSinTelefono`, el mismo criterio que el servidor). */
  const fichaVacia = fichaSinTelefono(telefonoFicha);
  const fichaNoEsCelular = !fichaVacia && !celularParaRecibo(telefonoFicha).ok;

  const mensaje = useMemo(
    () =>
      preparado
        ? mensajeRecibo({ ...preparado.datos, enlace: preparado.enlace, vence: preparado.venceEn ? fechaCortaLima(preparado.venceEn) : "" })
        : "",
    [preparado],
  );
  const enlaceWhatsApp = preparado && nueve ? enlaceWhatsAppConTexto(nueve, mensaje) : null;

  const preparar = useCallback(async () => {
    const v = celularParaRecibo(celular);
    if (!v.ok) return setError(v.error);
    setError(null);
    setPreparando(true);
    try {
      const archivo = await reciboComoArchivo(a);
      const fd = new FormData();
      fd.append("file", archivo);
      fd.append("telefono", v.nueve);
      const res = await fetch(url(a.id), { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<{ documentoId?: string; ruta?: string; venceEn?: string; datos?: DatosDelMensaje; error?: string }>(res);
      if (!res.ok || !j?.documentoId || !j.ruta || !j.datos) {
        setError(j?.error ?? "No se pudo preparar el recibo. Vuelve a intentarlo.");
        return;
      }
      setPreparado({ documentoId: j.documentoId, enlace: `${window.location.origin}${j.ruta}`, venceEn: j.venceEn ?? "", archivo, datos: j.datos });
    } catch (e) {
      logger.error("[adelantos] no se pudo preparar el recibo para WhatsApp", { error: String(e) });
      setError("No se pudo armar el PDF del recibo. Vuelve a intentarlo.");
    } finally {
      setPreparando(false);
    }
  }, [a, celular]);

  /** Anota el envío (quién, cuándo, a qué número, por dónde). Se llama al abrir el chat o al compartir. */
  const anotarEnvio = useCallback(
    async (via: ViaEnvio) => {
      if (!preparado || !nueve || anotando.current) return;
      anotando.current = true;
      try {
        const res = await fetch(url(a.id), {
          method: "PUT",
          headers: { ...csrfHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ documentoId: preparado.documentoId, telefono: nueve, via }),
        });
        const j = await leerJson<{ enviadoEn?: string; celularAnotado?: boolean; error?: string }>(res);
        if (!res.ok || !j?.enviadoEn) {
          setError(j?.error ?? "Se abrió WhatsApp, pero el envío no quedó anotado. Vuelve a tocar «Abrir WhatsApp».");
          return;
        }
        setEnviado({ en: j.enviadoEn, nueve, via, celularAnotado: !!j.celularAnotado });
        onEnviado();
      } catch (e) {
        logger.error("[adelantos] no se pudo anotar el envío del recibo", { error: String(e) });
        setError("Se abrió WhatsApp, pero el envío no quedó anotado. Vuelve a tocar «Abrir WhatsApp».");
      } finally {
        anotando.current = false;
      }
    },
    [a.id, nueve, preparado, onEnviado],
  );

  /** En el celular: el PDF mismo al chat (hoja de compartir del sistema). */
  const puedeCompartir =
    !!preparado && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [preparado.archivo] });

  const compartir = useCallback(async () => {
    if (!preparado) return;
    try {
      await navigator.share({ files: [preparado.archivo], text: mensaje });
      await anotarEnvio("compartido");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return; // cerró la hoja sin mandar
      logger.warn("[adelantos] no se pudo compartir el recibo", { error: String(e) });
      setError("Tu celular no dejó compartir el archivo: usa «Abrir WhatsApp», que manda el enlace.");
    }
  }, [preparado, mensaje, anotarEnvio]);

  return {
    celular,
    setCelular: (v: string) => {
      setCelular(v);
      setError(null);
    },
    nueve,
    errorCelular: celular && !valido.ok ? valido.error : null,
    fichaVacia,
    fichaNoEsCelular,
    telefonoFicha,
    sinPermiso,
    preparando,
    preparado,
    enlaceWhatsApp,
    puedeCompartir,
    enviado,
    error,
    preparar,
    abrirWhatsApp: () => void anotarEnvio("whatsapp"),
    compartir,
  };
}
