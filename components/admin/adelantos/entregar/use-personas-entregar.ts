"use client";

/**
 * A quién se le puede entregar (ADR-491): `GET /api/adelantos/entregar/personas`.
 *
 * La primera lectura trae el contexto de la pantalla (las 3 frecuentes, si
 * quien entrega es cajero y su tope, si la firma es obligatoria, si hay caja
 * abierta); el buscador pide `?q=` con 250 ms de espera, y el fotocheck
 * `?codigo=` con el texto crudo del QR (el servidor lo entiende con
 * `codigoDeMarcacion`). Una respuesta vieja no pisa a una nueva (`turno`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaEntregar, PersonasEntregarRespuesta } from "@/lib/adelantos/entregar-tipos";
import { leerJson, sinDato } from "@/lib/errores/sin-dato";

const RUTA = "/api/adelantos/entregar/personas";
const ESPERA_MS = 250;

export type ContextoEntrega = Omit<PersonasEntregarRespuesta, "resultados" | "porCodigo" | "codigoSinPersona">;

async function pedir(query: string): Promise<{ status: number; j: PersonasEntregarRespuesta | null }> {
  const res = await fetch(`${RUTA}${query}`, { credentials: "include", cache: "no-store" }).catch(sinDato("personas para entregar"));
  if (!res) return { status: 0, j: null };
  return { status: res.status, j: res.ok ? await leerJson<PersonasEntregarRespuesta>(res) : null };
}

export function usePersonasEntregar() {
  const [contexto, setContexto] = useState<ContextoEntrega | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [q, setQ] = useState("");
  /** `null` = no se está buscando (se ven las frecuentes). */
  const [resultados, setResultados] = useState<PersonaEntregar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState(false);
  const turno = useRef(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setErrorCarga(null);
    void pedir("").then(({ status, j }) => {
      if (!vivo) return;
      if (j && Array.isArray(j.frecuentes)) {
        setContexto({ frecuentes: j.frecuentes, restringido: !!j.restringido, topeCajero: j.topeCajero ?? null, firmaObligatoria: !!j.firmaObligatoria, cajaAbierta: !!j.cajaAbierta });
      } else {
        setErrorCarga(status === 403 ? "Tu rol no puede entregar adelantos: pídeselo al dueño." : "No se pudo cargar a quién entregar. Revisa la conexión.");
      }
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [version]);

  useEffect(() => {
    const texto = q.trim();
    const mio = ++turno.current;
    if (texto.length < 2) {
      setResultados(null);
      setBuscando(false);
      setErrorBusqueda(false);
      return;
    }
    setBuscando(true);
    const espera = window.setTimeout(() => {
      void pedir(`?q=${encodeURIComponent(texto)}`).then(({ j }) => {
        if (mio !== turno.current) return;
        setResultados(j?.resultados ?? []);
        setErrorBusqueda(!j);
        setBuscando(false);
      });
    }, ESPERA_MS);
    return () => window.clearTimeout(espera);
  }, [q]);

  /** El QR del fotocheck → su persona de Adelantos, o el aviso de por qué no. */
  const porCodigo = useCallback(async (texto: string): Promise<{ persona: PersonaEntregar | null; aviso: string | null }> => {
    const { j } = await pedir(`?codigo=${encodeURIComponent(texto)}`);
    if (!j) return { persona: null, aviso: "No se pudo leer el fotocheck. Revisa la conexión o búscalo por nombre." };
    if (j.porCodigo) return { persona: j.porCodigo, aviso: null };
    return {
      persona: null,
      aviso: j.codigoSinPersona
        ? "Ese fotocheck es de un colaborador sin cuenta en Adelantos: pídele al dueño que lo vincule, o búscalo por nombre."
        : "No encontré a nadie con ese fotocheck: búscalo por nombre.",
    };
  }, []);

  const releer = useCallback(() => {
    setQ("");
    setVersion((v) => v + 1);
  }, []);

  return { contexto, cargando, errorCarga, q, setQ, resultados, buscando, errorBusqueda, porCodigo, releer };
}

export type PersonasEntrega = ReturnType<typeof usePersonasEntregar>;
