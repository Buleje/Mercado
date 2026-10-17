"use client";

/**
 * «Leer la constancia» en el alta de una plantación (ronda 3 de ADR-459).
 *
 * Al montar pregunta si hay lector (`GET constancia-ocr`): sin la IA de la
 * plataforma el botón igual se ve, pero al tocarlo da el aviso del servidor
 * (cómo activarla, si quien mira administra la clave; si no, «avisa al
 * administrador») en vez de hacer elegir un archivo que nadie va a leer. Con clave, abre el selector (foto o
 * PDF), achica la foto, la manda y entrega la lectura al formulario — que es
 * quien decide qué completar (`completarPlanDesdeConstancia`, sin pisar).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { AVISO_IA_NO_DISPONIBLE, FALLOS_DE_CONFIGURACION, type CodigoFalloIA } from "@/lib/ai/aviso-clave-ia";
import { textoDeFila, type EspecieLeida, type LecturaConstancia } from "@/lib/forestal/loth-constancia-ocr";
import { filaVacia, type FilaEspecie } from "../loth-plan-especies-api";
import { fotoEnJpeg } from "./use-placa-foto";

const API = "/api/admin/forestal/plan/constancia-ocr";
/** Lado mayor de la foto: la letra chica del cuadro de especies necesita más que una placa (Sonnet 5.5 ve hasta 2576 px). */
const LADO_MAX_PX = 2400;
/** La ruta corta en ~3,2 MB de archivo (Vercel, 4,5 MB de cuerpo en base64). */
const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** Lo que el formulario completó con una lectura, para decirlo. */
export interface ResultadoConstancia {
  completados: string[];
  /** Las especies que entraron como filas nuevas. */
  especies: string[];
  /** Las ya escritas a las que se les completaron celdas vacías: «Bolaina (m³, año)». */
  especiesCompletadas: string[];
  /** Las ya escritas que no tenían nada vacío: no se tocaron. */
  yaEstaban: string[];
  /** Lo que no pudo entrar (un departamento fuera del padrón, otra región ya elegida). */
  avisos: string[];
  /** Lo que la IA marcó como dudoso. */
  nota: string;
}

export type EstadoLector =
  | { estado: "quieto" }
  | { estado: "leyendo"; archivo: string }
  /** La IA de la plataforma no está: el aviso que mandó el servidor (con o sin instrucciones). */
  | { estado: "sin_clave"; mensaje: string; instrucciones: boolean }
  | { estado: "error"; error: string; deConfiguracion: boolean }
  | { estado: "listo"; resultado: ResultadoConstancia };

function comoDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("sin lectura"));
    r.readAsDataURL(file);
  });
}

/**
 * Una especie leída, vuelta fila del formulario. El científico del PAPEL manda
 * (`cientificoAuto: false`: cambiar el nombre después no lo pisa); si el papel
 * no lo trae, se completa del catálogo como al tipear. CITES sigue al nombre.
 */
export function filaDesdeLeida(e: EspecieLeida): FilaEspecie {
  const t = textoDeFila(e);
  const base = filaVacia(t.nombre, t.cientifico || null);
  return {
    ...base,
    speciesScientific: t.cientifico || base.speciesScientific,
    cientificoAuto: !t.cientifico,
    arboles: t.arboles,
    volumenM3: t.volumenM3,
    anioInstalacion: t.anioInstalacion,
    superficieHa: t.superficieHa,
  };
}

export function useLectorConstancia(
  aplicar: (l: LecturaConstancia) => ResultadoConstancia,
  /** Sólo el alta de una plantación lee la constancia: en otro caso ni se pregunta. */
  habilitado = true,
) {
  /** `null` = todavía no se sabe: se deja elegir el archivo y la ruta contesta. */
  const [activo, setActivo] = useState<boolean | null>(null);
  const [leePdf, setLeePdf] = useState(true);
  /** El aviso de «no hay lector» tal como lo dio el servidor (genérico, o con instrucciones si quien mira administra la clave). */
  const [aviso, setAviso] = useState<{ mensaje: string; instrucciones: boolean } | null>(null);
  const [estado, setEstado] = useState<EstadoLector>({ estado: "quieto" });
  const input = useRef<HTMLInputElement>(null);
  /* La lectura vuelve segundos después: se aplica con el formulario de ESE
     momento, no con el del render en que se eligió el archivo. */
  const aplicarRef = useRef(aplicar);
  useEffect(() => {
    aplicarRef.current = aplicar;
  });

  useEffect(() => {
    if (!habilitado) return;
    const ctrl = new AbortController();
    fetch(API, { credentials: "include", signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ activo?: unknown; leePdf?: unknown; aviso?: unknown; codigo?: unknown }>) : null))
      .then((j) => {
        if (!j) return;
        setActivo(j.activo === true);
        setLeePdf(j.leePdf !== false);
        setAviso(typeof j.aviso === "string" ? { mensaje: j.aviso, instrucciones: j.codigo === "sin_lector" } : null);
      })
      /* Sin respuesta no se sabe: el botón abre el selector y la ruta dirá. */
      .catch(() => setActivo(null));
    return () => ctrl.abort();
  }, [habilitado]);

  /** El botón: sin clave dice cómo activarla; con clave (o sin saber) abre el selector. */
  const pedirArchivo = useCallback(() => {
    if (activo === false) {
      setEstado({ estado: "sin_clave", mensaje: aviso?.mensaje ?? AVISO_IA_NO_DISPONIBLE, instrucciones: aviso?.instrucciones ?? false });
      return;
    }
    input.current?.click();
  }, [activo, aviso]);

  const leer = useCallback(
    async (file: File) => {
      const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (esPdf && !leePdf) {
        setEstado({ estado: "error", error: "Para leer un PDF hace falta la clave de Claude: sube una foto de la constancia.", deConfiguracion: true });
        return;
      }
      if (esPdf && file.size > MAX_PDF_BYTES) {
        setEstado({ estado: "error", error: "El PDF pesa más de 3 MB: sube una foto de la hoja o un PDF más liviano.", deConfiguracion: false });
        return;
      }
      setEstado({ estado: "leyendo", archivo: file.name });
      let archivo: string;
      try {
        archivo = esPdf ? await comoDataUrl(file) : (await fotoEnJpeg(file, LADO_MAX_PX)).dataUrl;
      } catch {
        setEstado({ estado: "error", error: "No pude abrir ese archivo: usa una foto JPG o PNG, o un PDF.", deConfiguracion: false });
        return;
      }
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ archivo }),
        });
        const j = (await res.json().catch(() => null)) as {
          lectura?: LecturaConstancia;
          error?: unknown;
          message?: unknown;
          codigo?: unknown;
        } | null;
        if (!res.ok || !j?.lectura) {
          const codigo = (typeof j?.codigo === "string" ? j.codigo : null) as CodigoFalloIA | null;
          if (codigo === "sin_lector" || codigo === "ia_no_disponible") {
            const mensaje = typeof j?.error === "string" ? j.error : AVISO_IA_NO_DISPONIBLE;
            setActivo(false);
            setAviso({ mensaje, instrucciones: codigo === "sin_lector" });
            setEstado({ estado: "sin_clave", mensaje, instrucciones: codigo === "sin_lector" });
            return;
          }
          const error =
            res.status === 429 && typeof j?.message === "string"
              ? j.message
              : typeof j?.error === "string"
                ? j.error
                : `No se pudo leer la constancia (HTTP ${res.status}).`;
          setEstado({ estado: "error", error, deConfiguracion: codigo != null && FALLOS_DE_CONFIGURACION.includes(codigo) });
          return;
        }
        setEstado({ estado: "listo", resultado: aplicarRef.current(j.lectura) });
      } catch {
        setEstado({ estado: "error", error: "Sin conexión: no se pudo leer la constancia.", deConfiguracion: false });
      }
    },
    [leePdf],
  );

  const cerrar = useCallback(() => setEstado({ estado: "quieto" }), []);

  return { input, activo, leePdf, estado, pedirArchivo, leer, cerrar };
}

export type LectorConstancia = ReturnType<typeof useLectorConstancia>;
