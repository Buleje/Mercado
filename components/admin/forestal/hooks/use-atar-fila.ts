"use client";

/**
 * Una guardada vieja que se ata al Directorio (Cubicador, 24-10): elige o crea
 * la ficha del comprador, la CCNN y la GTF (que llena el resto de la ficha), y
 * la guarda con el MISMO `POST /cubicaciones` que «Vincular»: la cubicación
 * entera —piezas tal cual— más `cliente`, `ficha` y `gtfNumber`. El servidor
 * recalcula el valor y los totales; `updatedAt` hace que un cambio ajeno dé 409
 * en vez de pisarse. Si se creó la ficha y el guardado falla, se recuerda su id:
 * reintentar no crea una segunda.
 */
import { useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { necesitaAtar, sugerirParte } from "@/lib/forestal/cubicacion-atar";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { datosDeGuardada, cuerpoDeDatos, type DatosDeLaCubicacion } from "../cubicador-guardar-tipos";
import { cuerpoDelVinculo, esDesactualizada } from "./use-vincular-cubicacion";
import { useFichaDesdeGuia } from "./use-ficha-desde-guia";
import type { useLibretaDeLaFicha } from "./use-libreta-de-la-ficha";

type Libreta = ReturnType<typeof useLibretaDeLaFicha>;

export const NUEVA = "__nueva__";
export const MENSAJE_OTRO_LADO = "Se cambió en otro lado: recarga";

export function useAtarFila(c: CubicacionRegistro, libreta: Libreta, alGuardar: (resumen: string) => void) {
  const [datos, setDatos] = useState<DatosDeLaCubicacion>(() => datosDeGuardada(c));
  const [elegido, setElegido] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desactualizada, setDesactualizada] = useState(false);
  const guia = useFichaDesdeGuia(datos, setDatos, libreta);

  const escrito = (c.cliente ?? "").trim();
  const sugerida = useMemo(() => sugerirParte(escrito, libreta.compradores), [escrito, libreta.compradores]);
  const eleccion = elegido ?? (necesitaAtar(c) ? sugerida?.id ?? "" : c.ficha?.clienteParteId ?? "");
  const hayQueGuardar = eleccion !== "" || !!datos.ficha.comunidad?.trim() || datos.gtf.trim() !== "";

  const ponerComunidad = (v: string) => {
    const p = libreta.buscar(libreta.comunidades, v);
    const permiso = p ? libreta.permisoDe(p) : null;
    setDatos((d) => ({
      ...d,
      ficha: {
        ...d.ficha,
        comunidad: v,
        comunidadParteId: p?.id,
        ...(permiso && !d.ficha.tituloHabilitante?.trim() ? { tituloHabilitante: permiso } : {}),
      },
    }));
  };

  const guardar = async () => {
    if (guardando || !hayQueGuardar) return;
    setGuardando(true);
    setError(null);
    setDesactualizada(false);
    try {
      let parteId = eleccion;
      let nombreParte = libreta.compradores.find((p) => p.id === parteId)?.nombre ?? "";
      if (eleccion === NUEVA) {
        const parte = await libreta.guardarParte({ roles: ["cliente"], nombre: escrito });
        parteId = parte.id;
        nombreParte = parte.nombre;
        setElegido(parte.id);
      }
      const ficha = { ...datos.ficha, clienteParteId: parteId || datos.ficha.clienteParteId };
      const r = await fetch("/api/admin/forestal/cubicaciones", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...cuerpoDelVinculo(c, []), ...cuerpoDeDatos({ ...datos, ficha }) }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
      if (esDesactualizada(r.status, j)) { setDesactualizada(true); setError(MENSAJE_OTRO_LADO); return; }
      if (!r.ok) throw new Error(j.message ?? j.error ?? `el servidor respondió ${r.status}`);
      alGuardar([nombreParte && `comprador ${nombreParte}`, ficha.comunidad && `CCNN ${ficha.comunidad}`, datos.gtf.trim() && `GTF ${datos.gtf.trim()}`].filter(Boolean).join(" · "));
    } catch (e) {
      setError(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuardando(false);
    }
  };

  return { datos, setDatos, guia, escrito, sugerida, eleccion, setElegido, hayQueGuardar, ponerComunidad, guardar, guardando, error, desactualizada };
}
