"use client";

/**
 * Cámaras — lo que la cámara del patio manda, y la dirección para que mande.
 *
 * La cámara es 4G con panel solar: nadie puede «entrar» a verla (CGNAT), y un
 * stream continuo no se sostiene ni en datos ni en batería. Así que esta
 * pantalla no es un monitor de video: es **el historial de lo que pasó**, que es
 * lo que sirve a la mañana siguiente — quién entró, a qué hora, y la foto.
 *
 * Dos cosas que la pantalla resuelve y son las que hacen que esto funcione o no:
 *
 *  1. **La dirección para copiar en la cámara.** Es lo único que hay que
 *     configurar del lado del aparato, y se copia de un botón. Si se escribe a
 *     mano, no anda.
 *  2. **Avisar cuando una dejó de mandar.** Con panel solar, dos días nublados
 *     la apagan; y una SIM sin datos deja de subir sin decir nada. Enterarse a
 *     las 24 h es la diferencia entre revisarla hoy o descubrirlo el día que
 *     pasó algo y no hay foto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Camera, Check, Copy, Eye, EyeOff, HelpCircle, Image as ImageIcon, Loader2, MessageCircle, Plus, RefreshCw, Trash2, Upload, Wifi,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  buscarCapturas, EVENTO_LABEL, estaCallada, horasSinVerse, type AvisosCamara, type Captura,
} from "@/lib/camaras/camaras";
import ConectarCamaraModal, {
  estadoDeConexion, PastillaConexion, queHacer,
  type CamaraConConexion, type ConexionCamara, type DatosConexion, type ResultadoConexion,
} from "./camaras/ConectarCamaraModal";
import VisorEnVivo from "./camaras/VisorEnVivo";
import ControlPtz from "./camaras/ControlPtz";

const API = "/api/admin/camaras";

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function CamarasView() {
  const [camaras, setCamaras] = useState<CamaraConConexion[]>([]);
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [lugar, setLugar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  /* Lo que se está tipeando en «avisar a» de cada cámara, antes de guardar. */
  const [avisosEdit, setAvisosEdit] = useState<Record<string, { whatsapp: string; cuando: AvisosCamara["cuando"] }>>({});
  const avisosDe = (c: CamaraConConexion) =>
    avisosEdit[c.id] ?? { whatsapp: c.avisos?.whatsapp ?? "", cuando: c.avisos?.cuando ?? "noche" };
  const guardarAvisos = async (c: CamaraConConexion) => {
    const a = avisosDe(c);
    if (await escribir({ method: "PATCH", body: JSON.stringify({ id: c.id, accion: "avisos", whatsapp: a.whatsapp, cuando: a.cuando }) })) {
      setAvisosEdit((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
    }
  };
  const [filtro, setFiltro] = useState<string>("");
  /** Buscar por lo que se VE: «camión», una placa, «dos personas». */
  const [texto, setTexto] = useState("");

  // Una carga que salió antes de un cambio trae lo de antes. Con el GET del
  // doble montaje o el de «Actualizar» todavía en vuelo, la foto borrada
  // reaparecía y, tras «Cambiar la dirección», volvía la dirección vieja (la que
  // ya no funciona) para copiarla (mismo bug medido en Tareas el 2026-09-14).
  // Sólo aplica lo que trae la carga más nueva, y sólo si no hubo cambios
  // mientras viajaba; cada escritura termina con una carga silenciosa.
  const cargasRef = useRef({ ultima: 0, cambios: 0 });
  const cargar = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    const vigente = () => esta === cargasRef.current.ultima;
    if (!opciones?.silenciosa) setCargando(true);
    try {
      const r = await fetch(API, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { camaras?: CamaraConConexion[]; capturas?: Captura[] };
      if (vigente() && cambiosAlSalir === cargasRef.current.cambios) {
        setCamaras(j.camaras ?? []);
        setCapturas(j.capturas ?? []);
      }
      // La silenciosa no borra el error de la escritura que la disparó.
      if (vigente() && !opciones?.silenciosa) setError(null);
    } catch {
      if (vigente() && !opciones?.silenciosa) setError("No se pudo leer las cámaras.");
    } finally {
      if (vigente()) setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const escribir = async (init: RequestInit & { url?: string }) => {
    setGuardando(true);
    setError(null);
    cargasRef.current.cambios += 1;
    try {
      const r = await fetch(init.url ?? API, {
        ...init,
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const j = (await r.json().catch(() => ({}))) as { mensaje?: string; message?: string; error?: string; camaras?: CamaraConConexion[] };
      if (!r.ok || j.error) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      if (j.camaras) setCamaras(j.camaras);
      if (j.mensaje) setAviso(j.mensaje);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGuardando(false);
      void cargar({ silenciosa: true });
    }
  };

  const crear = async () => {
    if (!nombre.trim()) return;
    if (await escribir({ method: "POST", body: JSON.stringify({ nombre, lugar }) })) {
      setNombre("");
      setLugar("");
      await cargar();
    }
  };

  /** La dirección que se copia en la cámara. Absoluta: el aparato no sabe de rutas. */
  const direccionDe = (c: CamaraConConexion) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/camara?k=${c.token}`;

  /**
   * Subir una foto a mano por la MISMA puerta que usa la cámara (2026-09-12).
   *
   * Sirve para dos cosas antes de que la cámara esté conectada: ver cómo queda
   * el historial y probar la lectura de la IA con una foto del celular. Entra
   * como evento «manual» para que nunca se confunda con lo que mandó el aparato.
   */
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const subirAMano = async (c: CamaraConConexion, archivo: File) => {
    setSubiendo(c.id);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", archivo);
      const r = await fetch(`${direccionDe(c)}&evento=manual&nota=${encodeURIComponent("subida desde el panel")}`, {
        method: "POST",
        body: form,
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        throw new Error(
          j.error === "muy_grande"
            ? "La foto pesa más de lo permitido: sácale una captura o bájale la calidad."
            : `La cámara no la aceptó (${j.error ?? r.status}).`,
        );
      }
      setAviso("Foto guardada. La lectura de la IA aparece en unos segundos: toca «Actualizar».");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(null);
    }
  };

  /**
   * Conexión DIRECTA con el aparato (ADR-421).
   *
   * Estos tres no pasan por `escribir`: acá hace falta el cuerpo del error tal
   * cual lo manda el servidor (`motivo`/`detalle`) para traducirlo a qué hacer,
   * y `escribir` lo aplana en una sola frase. La guarda de carga vieja sí se
   * respeta: se cuenta el cambio y se recarga en silencio al terminar.
   */
  const [conectando, setConectando] = useState<string | null>(null);
  const [visorOculto, setVisorOculto] = useState<Record<string, boolean>>({});
  const camaraAConectar = camaras.find((c) => c.id === conectando) ?? null;

  const pedirConexion = async (cuerpo: Record<string, unknown>, camaraId: string): Promise<ResultadoConexion> => {
    cargasRef.current.cambios += 1;
    try {
      const r = await fetch(API, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(cuerpo),
      });
      const j = (await r.json().catch(() => ({}))) as {
        camaras?: CamaraConConexion[]; conexion?: ConexionCamara | null;
        motivo?: string; detalle?: string; error?: string; message?: string; respondio?: boolean;
      };
      if (j.camaras) setCamaras(j.camaras);
      /* Estas acciones contestan 200 con el problema ADENTRO del cuerpo: el
         `r.ok` solo no alcanza. `respondio: false` es «probar» diciendo que la
         cámara no contestó, aunque la conexión guardada siga ahí. */
      const conexion = j.conexion ?? j.camaras?.find((x) => x.id === camaraId)?.conexion ?? null;
      const fallo = !r.ok || Boolean(j.error) || j.respondio === false;
      if (!fallo && conexion) return { ok: true, conexion };
      return {
        ok: false,
        motivo: j.motivo ?? j.error ?? "",
        detalle: j.detalle ?? j.message ?? `El servidor respondió ${r.status}.`,
      };
    } catch (e) {
      /* Ni siquiera salió el pedido: el panel no llegó a su propio servidor. */
      return { ok: false, motivo: "inalcanzable", detalle: e instanceof Error ? e.message : String(e) };
    } finally {
      void cargar({ silenciosa: true });
    }
  };

  const conectar = (c: CamaraConConexion, datos: DatosConexion) =>
    pedirConexion({ id: c.id, accion: "conectar", ...datos }, c.id);

  const probarDeNuevo = async (c: CamaraConConexion) => {
    setError(null);
    const r = await pedirConexion({ id: c.id, accion: "probar" }, c.id);
    if (!r.ok) setError(queHacer(r.motivo, r.detalle));
    else setAviso(`${c.nombre} contestó: la conexión funciona.`);
  };

  /**
   * Mover la cámara. Va sin esperar respuesta a propósito: entre que se aprieta
   * y se suelta pasan décimas, y encolar la vuelta del servidor haría que la
   * cámara siguiera girando después de soltar el botón.
   */
  const moverCamara = (c: CamaraConConexion, x: number, y: number, zoom: number) => {
    void fetch(API, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: c.id, accion: "ptz", x, y, zoom }),
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!r.ok || j.error) setError(j.message ?? `No se pudo mover ${c.nombre}.`);
      })
      .catch((e: unknown) => setError(`No se pudo mover ${c.nombre}: ${e instanceof Error ? e.message : String(e)}`));
  };

  const copiar = async (c: CamaraConConexion) => {
    try {
      await navigator.clipboard.writeText(direccionDe(c));
      setCopiado(c.id);
      setTimeout(() => setCopiado((k) => (k === c.id ? null : k)), 2500);
    } catch {
      setError("El navegador no dejó copiar. Selecciona la dirección a mano.");
    }
  };

  const calladas = useMemo(() => camaras.filter((c) => estaCallada(c)), [camaras]);
  const visibles = useMemo(() => {
    const deLaCamara = filtro ? capturas.filter((c) => c.camaraId === filtro) : capturas;
    return buscarCapturas(deLaCamara, texto);
  }, [capturas, filtro, texto]);
  const nombreDe = (id: string) => camaras.find((c) => c.id === id)?.nombre ?? "Cámara quitada";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Camera className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
            Cámaras del patio
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            La cámara manda la foto cuando detecta algo y acá queda con su hora. Y si el panel la
            alcanza por la red, además se la puede ver ahora mismo: «Conectar», en su tarjeta. Con
            panel solar y datos móviles el camino bueno sigue siendo el primero: transmitir todo el
            día vacía la batería.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden /> Actualizar
        </button>
      </div>

      {calladas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            {calladas.length === 1 ? "Una cámara no manda nada" : `${calladas.length} cámaras no mandan nada`} hace más
            de un día: {calladas.map((c) => `${c.nombre} (${horasSinVerse(c)} h)`).join(" · ")}. Suele ser batería o
            datos.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p className="rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
          {aviso}
        </p>
      )}

      {/* Alta + lista de cámaras con su dirección */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Cámara nueva
            </span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
              placeholder="Portón de entrada"
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Qué mira (opcional)
            </span>
            <input
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Patio de trozas"
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={guardando || !nombre.trim()}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Agregar
          </button>
        </div>

        <ul className="mt-3 space-y-2">
          {camaras.map((c) => {
            const est = estadoDeConexion(c);
            return (
            <li key={c.id} className="rounded-xl border border-[var(--rule-base)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {/* En celular el nombre se queda con la fila entera: con la
                    pastilla y «Conectar» al lado, «Portón del patio» se leía
                    «Port…» (medido a 400 px). En sm+ comparte la fila. */}
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">
                    {c.lugar || "Sin lugar declarado"} ·{" "}
                    {c.ultimaCapturaEn ? `última foto ${cuando(c.ultimaCapturaEn)}` : "todavía no mandó nada"}
                  </span>
                </span>
                {/* Dos caminos que conviven: la cámara manda fotos (siempre) y,
                    si el panel la alcanza por la red, además se la puede ver. */}
                <PastillaConexion estado={est} />
                <button
                  type="button"
                  onClick={() => setConectando(c.id)}
                  title="Ver esta cámara ahora, hablándole directo por su dirección IP"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  <Wifi className="h-4 w-4" aria-hidden />
                  {est.tipo === "push" ? "Conectar" : "Conexión"}
                </button>
                {est.tipo === "conectada" && (
                  <button
                    type="button"
                    onClick={() => setVisorOculto((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    {visorOculto[c.id] ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                    {visorOculto[c.id] ? "Ver ahora" : "Ocultar"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void copiar(c)}
                  title="Copiar la dirección para pegarla en la cámara"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  {copiado === c.id ? <Check className="h-4 w-4 text-[var(--data-success-600)]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copiado === c.id ? "Copiada" : "Copiar dirección"}
                </button>
                <label
                  title="Subir una foto del celular por la misma puerta que usa la cámara (evento «manual»)"
                  className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] ${subiendo === c.id ? "opacity-50" : ""}`}
                >
                  {subiendo === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                  Subir a mano
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label={`Subir una foto a mano a ${c.nombre}`}
                    disabled={subiendo !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void subirAMano(c, f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void escribir({ method: "PATCH", body: JSON.stringify({ id: c.id, accion: "rotar" }) })}
                  disabled={guardando}
                  title="Dirección nueva: la anterior deja de funcionar"
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  aria-label={`Cambiar la dirección de ${c.nombre}`}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void escribir({ method: "DELETE", url: `${API}?id=${encodeURIComponent(c.id)}` })}
                  disabled={guardando}
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] disabled:opacity-50"
                  aria-label={`Quitar ${c.nombre}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {/* Avisar por WhatsApp cuando la IA ve a alguien (2026-09-12). Es
                  por lectura, no por movimiento: una rama con viento no avisa.
                  «De noche» es 19:00–06:00 de Lima, cuando el patio está solo. */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
                <MessageCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <label className="flex min-w-[11rem] flex-1 items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="whitespace-nowrap font-bold">Avisar al WhatsApp</span>
                  <input
                    value={avisosDe(c).whatsapp}
                    onChange={(e) => setAvisosEdit((prev) => ({ ...prev, [c.id]: { ...avisosDe(c), whatsapp: e.target.value } }))}
                    inputMode="tel"
                    placeholder="9 dígitos"
                    aria-label={`WhatsApp al que avisa ${c.nombre}`}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <select
                  value={avisosDe(c).cuando}
                  onChange={(e) => setAvisosEdit((prev) => ({ ...prev, [c.id]: { ...avisosDe(c), cuando: e.target.value as AvisosCamara["cuando"] } }))}
                  aria-label={`Cuándo avisa ${c.nombre}`}
                  className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="noche">sólo de noche (19–06)</option>
                  <option value="siempre">siempre</option>
                  <option value="nunca">nunca</option>
                </select>
                <button
                  type="button"
                  onClick={() => void guardarAvisos(c)}
                  disabled={guardando || !avisosEdit[c.id]}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-40 dark:text-[var(--accent)]"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden /> Guardar
                </button>
                <span className="basis-full text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {c.avisos?.whatsapp
                    ? `Avisa a ${c.avisos.whatsapp} ${c.avisos.cuando === "noche" ? "de noche" : c.avisos.cuando === "siempre" ? "siempre" : "— apagado"} cuando la foto muestra una persona o un vehículo. Como mucho uno cada 10 minutos.`
                    : "Sin aviso: la foto queda en el historial y nadie se entera hasta que lo abre."}
                </span>
              </div>

              {/* Conexión directa: sólo aparece cuando hay algo que decir. Una
                  cámara que sólo empuja fotos no gana ninguna fila vacía. */}
              {est.tipo === "falla" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" aria-hidden />
                  <p className="min-w-[12rem] flex-1 text-xs text-[var(--text-secondary)]">
                    {queHacer(est.motivo, est.detalle)}
                    {est.detalle && (
                      <span className="mt-0.5 block break-words font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {est.detalle}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => void probarDeNuevo(c)}
                    disabled={guardando}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Probar de nuevo
                  </button>
                </div>
              )}
              {est.tipo === "conectada" && !visorOculto[c.id] && (
                <div className="mt-2 space-y-2 border-t border-[var(--rule-soft)] pt-2">
                  <VisorEnVivo
                    camaraId={c.id}
                    nombre={c.nombre}
                    direccionWebhook={direccionDe(c)}
                    onGuardada={() => void cargar({ silenciosa: true })}
                  />
                  {est.conexion.soportaPtz && (
                    <ControlPtz onMover={(x, y, zoom) => moverCamara(c, x, y, zoom)} disabled={guardando} />
                  )}
                </div>
              )}
            </li>
            );
          })}
          {camaras.length === 0 && !cargando && (
            <li className="px-1 py-3 text-sm text-[var(--text-tertiary)]">
              Todavía no hay ninguna. Agrega la primera, copia su dirección y sigue la guía de abajo.
            </li>
          )}
        </ul>

        {/* Cómo se conecta, campo por campo. Vive acá y no en un manual aparte:
            la persona que configura la cámara tiene esta pantalla abierta. Los
            nombres de menú son los de Hikvision; una versión de firmware puede
            traducirlos distinto y se dice. */}
        <details className="mt-3 rounded-xl border border-[var(--rule-base)] px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden /> Cómo conectar la cámara Hikvision (paso a paso)
          </summary>
          <div className="mt-2 space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              La cámara tiene que <b>mandar</b> la foto: con SIM 4G no se la puede ir a buscar (está detrás
              de la red del operador). Hik-Connect en el celular sólo avisa <i>a ti</i>; lo que manda
              fotos <i>al sistema</i> se configura en la <b>cámara misma</b>: desde una PC en la misma red,
              abre la dirección IP de la cámara en el navegador (usuario <code>admin</code> y la clave
              que le pusiste), o desde la app iVMS-4200. Los nombres de menú pueden variar por firmware —
              busca el que se parezca.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <b>Que dispare por persona o vehículo, no por cualquier movimiento.</b>{" "}
                <code>Configuración → Evento → Evento inteligente → Detección de intrusión</code> (o «Cruce de
                línea»), activa <i>Detección de objetivo: humano / vehículo</i>. Con «Detección de
                movimiento» a secas la cámara manda ramas y perros; el sistema igual filtra con la IA,
                pero gasta datos.
              </li>
              <li>
                <b>Que mande la foto a esta dirección.</b>{" "}
                <code>Configuración → Red → Config. avanzada → Servidor de alarma</code> (en algunos
                firmwares «HTTP Listening» o «Notificar a centro de vigilancia»). Pega la dirección que
                copiaste arriba en <i>URL de destino</i>, protocolo <b>HTTP/HTTPS</b>, método <b>POST</b>. En
                el evento del paso 1, en <i>Método de enlace</i>, tilda <b>Notificar al servidor de
                alarma</b> y <b>Capturar imagen</b>. Si el firmware no trae esa opción, la alternativa es{" "}
                <b>Subir a FTP</b> → todavía no lo recibimos: avísame y lo armo.
              </li>
              <li>
                <b>Prueba.</b> Camina delante de la cámara. En menos de un minuto la foto aparece abajo, en
                «Lo que mandaron», con su hora. Si no aparece: (a) la dirección copiada a mano suele tener
                un carácter de menos — vuelve a copiarla del botón; (b) revisa que la SIM tenga datos
                (Hik-Connect en el celular muestra la cámara «en línea»); (c) la hora de la cámara no
                importa, el sistema pone la suya.
              </li>
              <li>
                <b>Que te avise.</b> Ponele tu WhatsApp en «Avisar al WhatsApp» y elige «sólo de noche»:
                cuando la IA vea a alguien te llega un mensaje con la hora, qué vio y el enlace a la foto.
              </li>
            </ol>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              Mientras no esté conectada, «Subir a mano» (al lado de cada cámara) mete una foto del
              celular por la misma puerta: sirve para ver cómo queda el historial y probar la lectura de la
              IA hoy mismo.
            </p>
          </div>
        </details>
      </div>

      {/* El historial */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle as="h3" className="mr-auto flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ImageIcon className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Lo que mandaron ({visibles.length})
          </CardTitle>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar: camión, placa, persona…"
            aria-label="Buscar en lo que se ve en las fotos"
            className="h-10 w-52 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {camaras.length > 1 && (
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Filtrar por cámara"
              className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)]"
            >
              <option value="">Todas las cámaras</option>
              {camaras.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>

        {cargando ? (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las fotos…
          </p>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-1 py-8 text-center">
            <Upload className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">
              Todavía no llegó ninguna foto. Cuando la cámara mande la primera, aparece acá con su hora.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibles.map((c) => (
              <li key={c.id} className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen de storage propio, sin layout fijo */}
                  <img src={c.url} alt={`${nombreDe(c.camaraId)} · ${cuando(c.at)}`} className="aspect-video w-full object-cover" loading="lazy" />
                </a>
                <div className="flex items-center gap-1.5 px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{nombreDe(c.camaraId)}</span>
                    <span className="block truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {cuando(c.at)} · {EVENTO_LABEL[c.evento]}
                    </span>
                    {/* Lo que la IA leyó. La placa va con su cartel: es una
                        LECTURA para confirmar, no un dato declarado. */}
                    {c.lectura?.descripcion && (
                      <span className="mt-0.5 block line-clamp-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
                        {c.lectura.descripcion}
                      </span>
                    )}
                    {c.lectura?.placa && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">
                        {c.lectura.placa}
                        <span className="font-sans font-normal text-[var(--text-tertiary)]">
                          {c.lectura.confianza === "alta" ? "leída" : "a confirmar"}
                        </span>
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await escribir({ method: "DELETE", url: `${API}?captura=${encodeURIComponent(c.id)}` })) {
                        setCapturas((prev) => prev.filter((x) => x.id !== c.id));
                      }
                    }}
                    disabled={guardando}
                    aria-label="Borrar esta foto del historial"
                    title="Borrar esta foto del historial"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {camaraAConectar && (
        <ConectarCamaraModal
          /* Uno por cámara: al montarse lee la conexión que ya tiene, y así una
             recarga de la lista mientras se escribe no pisa lo tipeado. */
          key={camaraAConectar.id}
          camara={camaraAConectar}
          onCerrar={() => setConectando(null)}
          onConectar={(datos) => conectar(camaraAConectar, datos)}
          onDesconectar={async () => {
            await escribir({ method: "PATCH", body: JSON.stringify({ id: camaraAConectar.id, accion: "desconectar" }) });
          }}
        />
      )}
    </div>
  );
}
