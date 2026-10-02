"use client";

/**
 * «Foto de la placa» en la tala: UNA foto hace tres cosas a la vez —
 *   1. se guarda como evidencia (`/api/upload`, la misma `photoUrl` de siempre);
 *   2. se lee el código de la placa (`/loth/placa-ocr`) y se cruza con el censo;
 *   3. se toma el GPS del teléfono parado en el tocón (`gpsOrigen: telefono`).
 *
 * Elegir el árbol lo decide `cruzarPlacaConCenso`: sólo lo inequívoco se elige
 * solo. Lo demás espera a que la persona confirme o corrija el código.
 *
 * En una plantación (ADR-459), si ningún árbol marcado coincide, la placa
 * propone la especie del registro por la abreviatura del código
 * (`cruzarPlacaConRegistro`) y deja ese código para la línea.
 *
 * Los avisos al formulario van por una ref: la lectura vuelve segundos después
 * y el `onElegir` de ese render ya no sabe que el GPS del teléfono llegó (el
 * árbol elegido pisaba la coordenada con la del censo).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import {
  cruzarPlacaConCenso,
  cruzarPlacaConRegistro,
  type CrucePlaca,
  type CrucePlacaRegistro,
  type EspeciePlaca,
  type LecturaPlaca,
} from "@/lib/forestal/loth-placa";

/** Lado mayor de la foto: la placa se lee bien y pesa ~0,5 MB en 4G. */
const LADO_MAX_PX = 1600;
const CALIDAD_JPEG = 0.85;

export interface AvisosPlaca<E extends EspeciePlaca = EspeciePlaca> {
  onElegir: (a: ArbolParaElegir) => void;
  onFoto: (url: string) => void;
  onGps: (lat: number, lng: number) => void;
  /** Plantación: la especie del registro con el código de la placa. */
  onEspecie?: (e: E, codigo: string) => void;
}

/** El registro de una plantación, para cuando ningún árbol marcado coincide. */
export interface RegistroParaPlaca<E extends EspeciePlaca = EspeciePlaca> {
  especies: readonly E[];
  cargando: boolean;
}

export type EstadoPaso<T> = { estado: "espera" } | { estado: "listo"; valor: T } | { estado: "error"; error: string };

export interface GpsTelefono {
  lat: number;
  lng: number;
  precisionM: number | null;
}

export interface LecturaVista extends LecturaPlaca {
  /** El código lo escribió la persona (corrigió o no había lector). */
  escrito: boolean;
  /** Cada lectura (o código escrito) es una vez distinta: se elige una vez por cada una. */
  vez: number;
}

/** La foto en JPEG, achicada: la ruta de lectura sólo acepta JPEG y `/api/upload`, ≤5 MB. */
async function fotoEnJpeg(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", CALIDAD_JPEG));
  if (!blob) throw new Error("sin jpeg");
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("sin lectura"));
    r.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

function pedirGps(): Promise<GpsTelefono> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Este equipo no da la ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "Sin permiso de ubicación en este navegador." : "No se pudo tomar el GPS.")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const m = typeof j?.message === "string" && res.status === 429 ? j.message : typeof j?.error === "string" ? j.error : null;
  return m ?? porDefecto;
}

export function usePlacaFoto<E extends EspeciePlaca = EspeciePlaca>(
  arboles: readonly ArbolParaElegir[],
  cargandoCenso: boolean,
  avisos: AvisosPlaca<E>,
  registro: RegistroParaPlaca<E> | null = null,
) {
  const avisosRef = useRef(avisos);
  useEffect(() => {
    avisosRef.current = avisos;
  });

  const [activa, setActiva] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  const [foto, setFoto] = useState<EstadoPaso<string>>({ estado: "espera" });
  const [lectura, setLectura] = useState<EstadoPaso<LecturaVista> & { sinLector?: boolean }>({ estado: "espera" });
  const [gps, setGps] = useState<EstadoPaso<GpsTelefono>>({ estado: "espera" });
  /** Cada foto es una corrida: lo que vuelve de una foto vieja no pisa la nueva. */
  const corrida = useRef(0);
  const gpsListo = useRef<GpsTelefono | null>(null);
  /** La última lectura cuyo árbol ya se eligió solo. */
  const aplicada = useRef<number | null>(null);
  const veces = useRef(0);

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  const cruce: CrucePlaca | null = useMemo(() => {
    if (lectura.estado !== "listo" || cargandoCenso) return null;
    return cruzarPlacaConCenso(lectura.valor, arboles);
  }, [lectura, arboles, cargandoCenso]);

  /* Plantación: ningún árbol marcado coincide → la especie del registro. */
  const especiesRegistro = registro?.especies;
  const cargandoRegistro = registro?.cargando ?? false;
  const cruceRegistro: CrucePlacaRegistro<E> | null = useMemo(() => {
    if (cruce?.tipo !== "sin_censo" || lectura.estado !== "listo" || !especiesRegistro?.length || cargandoRegistro) return null;
    return cruzarPlacaConRegistro(lectura.valor, especiesRegistro);
  }, [cruce, lectura, especiesRegistro, cargandoRegistro]);

  /* Lo inequívoco se elige UNA vez por lectura; si el GPS del teléfono ya
     llegó, se vuelve a poner después (elegir copia la coordenada del censo). */
  useEffect(() => {
    if (cruce?.tipo !== "elegido" || lectura.estado !== "listo") return;
    if (aplicada.current === lectura.valor.vez) return;
    aplicada.current = lectura.valor.vez;
    avisosRef.current.onElegir(cruce.arbol);
    const g = gpsListo.current;
    if (g) avisosRef.current.onGps(g.lat, g.lng);
  }, [cruce, lectura]);

  /* Lo mismo con la especie del registro: una vez por lectura, sólo si es inequívoca. */
  useEffect(() => {
    if (cruceRegistro?.tipo !== "especie" || lectura.estado !== "listo") return;
    if (aplicada.current === lectura.valor.vez) return;
    aplicada.current = lectura.valor.vez;
    avisosRef.current.onEspecie?.(cruceRegistro.especie, cruceRegistro.codigo);
    const g = gpsListo.current;
    if (g) avisosRef.current.onGps(g.lat, g.lng);
  }, [cruceRegistro, lectura]);

  const procesar = useCallback(async (file: File) => {
    const id = ++corrida.current;
    const vigente = () => corrida.current === id;
    gpsListo.current = null;
    setActiva(true);
    setProcesando(true);
    setFoto({ estado: "espera" });
    setLectura({ estado: "espera" });
    setGps({ estado: "espera" });

    pedirGps().then(
      (g) => {
        if (!vigente()) return;
        gpsListo.current = g;
        setGps({ estado: "listo", valor: g });
        avisosRef.current.onGps(g.lat, g.lng);
      },
      (e: Error) => { if (vigente()) setGps({ estado: "error", error: e.message }); },
    );

    let img: { blob: Blob; dataUrl: string };
    try {
      img = await fotoEnJpeg(file);
    } catch {
      if (!vigente()) return;
      const error = "No pude abrir la foto. Tómala de nuevo con la cámara.";
      setFoto({ estado: "error", error });
      setLectura({ estado: "error", error });
      setProcesando(false);
      return;
    }
    if (!vigente()) return;
    setVista(URL.createObjectURL(img.blob));

    const subir = (async () => {
      try {
        const fd = new FormData();
        fd.append("file", new File([img.blob], "placa.jpg", { type: "image/jpeg" }));
        fd.append("folder", "forestal");
        const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders({}), credentials: "include", body: fd });
        if (!res.ok) throw new Error(await mensajeDe(res, `No se guardó la foto (HTTP ${res.status}).`));
        const url = String((await res.json()).url ?? "");
        if (!url) throw new Error("No se guardó la foto.");
        if (!vigente()) return;
        setFoto({ estado: "listo", valor: url });
        avisosRef.current.onFoto(url);
      } catch (e) {
        if (vigente()) setFoto({ estado: "error", error: e instanceof Error ? e.message : "No se guardó la foto." });
      }
    })();

    const leer = (async () => {
      try {
        const res = await fetch("/api/admin/forestal/loth/placa-ocr", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ image: img.dataUrl }),
        });
        if (!res.ok) {
          const error = await mensajeDe(res, "No se pudo leer la placa.");
          if (vigente()) setLectura({ estado: "error", error, sinLector: res.status === 503 });
          return;
        }
        const j = (await res.json()) as Partial<LecturaPlaca>;
        if (!vigente()) return;
        setLectura({
          estado: "listo",
          valor: { codigo: String(j.codigo ?? ""), confianza: Number(j.confianza ?? 0), nota: String(j.nota ?? ""), escrito: false, vez: ++veces.current },
        });
      } catch {
        if (vigente()) setLectura({ estado: "error", error: "Sin conexión: no se pudo leer la placa." });
      }
    })();

    await Promise.all([subir, leer]);
    if (vigente()) setProcesando(false);
  }, []);

  /** La persona escribió o corrigió el código: vale como confirmado. */
  const escribirCodigo = useCallback((codigo: string) => {
    const c = codigo.trim();
    if (!c) return;
    setActiva(true);
    setLectura({ estado: "listo", valor: { codigo: c, confianza: 1, nota: "", escrito: true, vez: ++veces.current } });
  }, []);

  /** Uno de los candidatos, confirmado por la persona. */
  const confirmar = useCallback((a: ArbolParaElegir) => {
    avisosRef.current.onElegir(a);
    const g = gpsListo.current;
    if (g) avisosRef.current.onGps(g.lat, g.lng);
  }, []);

  /** Plantación: la especie del registro, elegida por la persona, con el código de la placa. */
  const confirmarEspecie = useCallback((e: E, codigo: string) => {
    avisosRef.current.onEspecie?.(e, codigo);
    const g = gpsListo.current;
    if (g) avisosRef.current.onGps(g.lat, g.lng);
  }, []);

  return { activa, procesando, vista, foto, lectura, gps, cruce, cruceRegistro, procesar, escribirCodigo, confirmar, confirmarEspecie };
}
