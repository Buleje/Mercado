"use client";
/**
 * «A quién escribir» — datos y acciones del navegador (bandeja, borradores,
 * Escríbelo por mí, recordatorios y recibos). Los componentes solo pintan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { usd } from "../papel/formato";
import { conRef, refDeCandidato, tipoRecordatorio, formatoMonto, type Candidato } from "@/lib/admin/comandos-ia/candidatos";
import type { Tono } from "@/lib/admin/comandos-ia/plantillas-sin-ia";

// ── Tipos del contrato con las rutas ─────────────────────────────────────────

export interface Bandeja {
  hoy: string;
  candidatos: Candidato[];
  negocio: string;
  fuentes: { fiados: number; clientesConCompras: number; adelantos: boolean; seguimientos: number };
}

export interface Borrador {
  id: string;
  candidato: Candidato;
  texto: string;
  siguiente: string;
  conIa: boolean;
}

export type MotivoSinIa = "sin-clave" | "no-respondio" | "tope" | "formato" | null;

export interface RespuestaRedactar {
  borradores: Borrador[];
  faltan: string[];
  costoIaUsd: number;
  motivoSinIa: MotivoSinIa;
  tono: Tono;
}

export type Salida = "whatsapp" | "cartel" | "tienda";

export interface Escrito {
  salida: Salida;
  titulo: string;
  texto: string;
  pie: string[];
  costoIaUsd: number;
}

// ── Estilos compartidos por las piezas de esta sub-vista ─────────────────────

// Botones: el canon de toda la pestaña (44 px de alto, como en papel y precios).
export { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "../papel/formato";
export const CHIP_BASE =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]";
export const CHIP_ACTIVO = "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]";
export const CHIP_INACTIVO = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]";

/** «IA ≈ $0.0010» — la cifra va SIEMPRE antes del botón que gasta. */
export function costoTexto(n: number): string {
  return usd(n);
}

/**
 * Cuánto costaría redactar a N personas, con la MISMA cuenta que el servidor
 * usa para pedir permiso al tope (`redactar/route.ts`: ~2 plantillas por tipo).
 */
export function costoEstimado(n: number): number {
  if (n <= 0) return 0;
  const claves = Math.min(6, n * 2);
  return (claves * 120 + 350 + 900) * 0.000001;
}

/** Lo que dice la fila: «S/ 150,00 · venció hace 69 días». */
export function datoDeFila(c: Candidato): string {
  const d = c.datos;
  const monto = d.monto != null ? formatoMonto(d.monto, d.moneda) : null;
  const dias = d.dias ?? 0;
  const plural = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  switch (c.tipo) {
    case "fiado-vencido":
      return `${monto} · venció ${dias === 0 ? "hoy" : `hace ${plural(dias)}`}`;
    case "fiado-por-vencer":
      return `${monto} · vence ${dias === 0 ? "hoy" : `en ${plural(dias)}`}`;
    case "cliente-ritmo":
      return `${plural(dias)} sin comprar`;
    case "adelanto":
      return `${monto} de saldo`;
    case "seguimiento":
      return c.pagado ? "Ya pagó" : monto ? `${monto} · sigue pendiente` : "Te tocaba volver a escribirle";
  }
}

/** Lo que ve el dueño cuando la ruta no trae su propio mensaje (nunca «Error 500»). */
function mensajeDeEstado(status: number): string {
  if (status === 401 || status === 403) return "Tu usuario no tiene permiso para esto.";
  if (status === 429) return "Fueron muchos pedidos seguidos. Espera un minuto y vuelve a intentar.";
  if (status >= 500) return "El servidor no respondió bien. Vuelve a intentar en un momento.";
  return "No se pudo hacer. Revisa los datos y vuelve a intentar.";
}

/** Texto para un error atrapado: «Failed to fetch» (sin red) sale en español. */
export function textoDeError(err: unknown, porDefecto: string): string {
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return "Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.";
  }
  return err instanceof Error && err.message ? err.message : porDefecto;
}

async function leerJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: unknown };
  if (!res.ok) {
    const msg = typeof data.error === "string" && data.error ? data.error : mensajeDeEstado(res.status);
    throw new Error(msg);
  }
  return data;
}

function postJson(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<Response> {
  return fetch(url, {
    method,
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

// ── Bandeja ──────────────────────────────────────────────────────────────────

export function useBandeja() {
  const [bandeja, setBandeja] = useState<Bandeja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  const recargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comandos-ia/mensajes/bandeja", { credentials: "include", cache: "no-store" });
      const data = await leerJson<Bandeja>(res);
      if (n === pedido.current) setBandeja(data);
    } catch (err) {
      if (n === pedido.current) setError(textoDeError(err, "No pude leer la bandeja."));
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { bandeja, cargando, error, recargar };
}

// ── Acciones ─────────────────────────────────────────────────────────────────

export async function pedirBorradores(ids: string[], tono: Tono): Promise<RespuestaRedactar> {
  return leerJson<RespuestaRedactar>(await postJson("/api/admin/comandos-ia/mensajes/redactar", { ids, tono }));
}

export async function pedirEscrito(pedido: string, salida: Salida): Promise<Escrito> {
  return leerJson<Escrito>(await postJson("/api/admin/comandos-ia/mensajes/escribir", { pedido, salida }));
}

/** Recibo en «Lo que hizo la IA». Si la ruta aún no existe, no rompe nada. */
export function registrarRecibo(body: { tipo: "mensajes" | "recordatorio"; resumen: string; filas?: number; costoIaUsd?: number; refId?: string }): void {
  postJson("/api/admin/comandos-ia/recibos", { ...body, resumen: body.resumen.slice(0, 200) })
    .then((res) => {
      if (!res.ok) logger.warn("[comandos-ia/mensajes] recibo no guardado", { status: res.status });
    })
    .catch((err) => logger.error("[comandos-ia/mensajes] recibo falló", { error: String(err) }));
}

/** Crea el recordatorio con el SIGUIENTE mensaje y la referencia para volver a mirar el dato. */
export async function crearRecordatorio(c: Candidato, fecha: string, siguiente: string): Promise<{ id: string }> {
  const ref = refDeCandidato(c);
  const sufijo = ref ? `\n\nref:${ref.tipo}/${ref.id}` : "";
  const cuerpo = siguiente.slice(0, 1000 - sufijo.length);
  const monto = c.datos.monto != null ? ` · ${formatoMonto(c.datos.monto, c.datos.moneda)}` : "";
  const res = await postJson("/api/reminders", {
    title: `Escribir a ${c.nombre}${monto}`.slice(0, 200),
    type: tipoRecordatorio(c),
    priority: "media",
    // 09:00 de Lima del día elegido (Lima = UTC-5, sin horario de verano).
    dueDate: `${fecha}T14:00:00.000Z`,
    description: ref ? conRef(cuerpo, ref) : cuerpo,
  });
  return leerJson<{ id: string }>(res);
}

export async function cerrarSeguimiento(recordatorioId: string): Promise<void> {
  const res = await postJson(`/api/reminders?id=${encodeURIComponent(recordatorioId)}`, { status: "completado" }, "PATCH");
  await leerJson<unknown>(res);
}
