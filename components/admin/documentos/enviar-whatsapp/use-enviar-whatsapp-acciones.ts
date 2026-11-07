import { useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { pedirArchivo } from "@/lib/documentos/archivo-remoto";
import type { HastaEnviarWhatsAppEstado } from "./use-enviar-whatsapp-estado";
export function useEnviarWhatsAppAcciones(previo: HastaEnviarWhatsAppEstado) {
  const {
    link,
    setCopied,
    normalized,
    setErrorEnvio,
    setEnviando,
    docs,
    message,
    setResultado,
    listos,
    links,
    via,
    multi,
    enviando,
    creating,
  } = previo;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard bloqueado */
    }
  };

  /** Vía 1 — el servidor sube el archivo a Meta y lo manda al número. */
  const enviarArchivo = useCallback(async () => {
    if (!normalized) {
      setErrorEnvio("Pon el número de WhatsApp del destinatario.");
      return;
    }
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await fetch("/api/admin/whatsapp/send-document", {
        method: "POST",
        credentials: "include",
        headers: { ...csrfHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          docIds: docs.map((d) => d.id),
          phone: normalized,
          caption: message.trim() || undefined,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        enviados?: { nombre: string }[];
        fallidos?: { nombre: string; error: string }[];
        error?: string;
        motivo?: string;
      };
      if (r.status === 409 && data.motivo === "sin_conexion") {
        setErrorEnvio(
          "El WhatsApp del negocio no está conectado. Conéctalo en Configuración › WhatsApp, o manda el archivo desde tu celular con «Compartir desde este equipo».",
        );
        return;
      }
      if (!data.enviados?.length && !data.fallidos?.length) {
        setErrorEnvio(data.error ?? "No se pudo enviar.");
        return;
      }
      setResultado({ enviados: data.enviados ?? [], fallidos: data.fallidos ?? [] });
    } catch {
      setErrorEnvio("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }, [docs, message, normalized]);

  /** Vía 2 — el menú de compartir del sistema, con los archivos adjuntos. */
  const compartirDesdeEquipo = useCallback(async () => {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const archivos: File[] = [];
      for (const d of docs) {
        const res = await pedirArchivo(`/api/admin/documents/${d.id}/raw`);
        const blob = await res.blob();
        archivos.push(new File([blob], d.name, { type: d.mimeType || blob.type }));
      }
      if (!navigator.canShare?.({ files: archivos })) {
        setErrorEnvio(
          "Este equipo no puede compartir estos archivos. Prueba con «Mandar el archivo» o con el enlace.",
        );
        return;
      }
      await navigator.share({
        files: archivos,
        ...(message.trim() ? { text: message.trim() } : {}),
      });
      setResultado({ enviados: docs.map((d) => ({ nombre: d.name })), fallidos: [] });
    } catch (e) {
      // Cancelar el menú de compartir tira AbortError: no es un error que
      // haya que mostrar.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErrorEnvio(e instanceof Error ? e.message : "No se pudo compartir.");
    } finally {
      setEnviando(false);
    }
  }, [docs, message]);

  /** Vía 3 — wa.me con el mensaje y los enlaces (lo de siempre). */
  const abrirWhatsAppConEnlace = () => {
    if (listos === 0) return;
    const cuerpo =
      docs.length === 1
        ? (links.get(docs[0].id) ?? "")
        : docs
            .filter((d) => links.has(d.id))
            .map((d) => `• ${d.name}\n${links.get(d.id)}`)
            .join("\n\n");
    const text = encodeURIComponent(`${message}\n\n${cuerpo}`.trim());
    const base = normalized ? `https://wa.me/${normalized}` : "https://wa.me/";
    window.open(`${base}?text=${text}`, "_blank", "noopener");
  };

  const accion =
    via === "archivo"
      ? enviarArchivo
      : via === "dispositivo"
        ? compartirDesdeEquipo
        : abrirWhatsAppConEnlace;
  const textoBoton =
    via === "archivo"
      ? multi
        ? `Mandar ${docs.length} archivos`
        : "Mandar el archivo"
      : via === "dispositivo"
        ? "Compartir"
        : multi
          ? `Abrir WhatsApp con ${listos}`
          : "Abrir WhatsApp";
  const deshabilitado = enviando || (via === "enlace" ? creating || listos === 0 : false);
  return {
    copyLink,
    enviarArchivo,
    compartirDesdeEquipo,
    abrirWhatsAppConEnlace,
    accion,
    textoBoton,
    deshabilitado,
  };
}
export type HastaEnviarWhatsAppAcciones = HastaEnviarWhatsAppEstado &
  ReturnType<typeof useEnviarWhatsAppAcciones>;
