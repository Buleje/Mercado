"use client";

/**
 * Estado del modal «Vaciar el Libro de Operaciones»: qué casillas están
 * marcadas, el recuento del servidor para esa combinación y el envío.
 *
 * Cada cambio de casillas vuelve a contar contra la base (nada se estima en el
 * navegador). Una respuesta que llega tarde —la de una combinación que ya no
 * está marcada— se descarta: si no, la pantalla mostraría los números de otra
 * elección justo antes de confirmar.
 *
 * Al confirmar se devuelven las cifras que se MOSTRARON: el servidor las vuelve
 * a contar dentro de la transacción y, si el libro cambió, responde 409
 * `libro_cambio` sin borrar nada. Entonces se recuenta solo, sin borrar el aviso,
 * para que la persona vea los números de ahora antes de volver a confirmar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";
import { ALCANCES_VACIADO, type ResumenVaciado, type ScopeVaciado } from "@/lib/forestal/ctp-purga-tipos";

const URL_PURGA = "/api/admin/forestal/ctp-purga";

export function useVaciarLibro(onVaciado?: () => void) {
  const [elegidos, setElegidos] = useState<ScopeVaciado[]>([]);
  const [resumen, setResumen] = useState<ResumenVaciado | null>(null);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [palabra, setPalabra] = useState("VACIAR LIBRO");
  const [cargando, setCargando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResumenVaciado | null>(null);
  const turno = useRef(0);
  /** Sube para recontar la misma elección (tras un 409 `libro_cambio`). */
  const [recuento, setRecuento] = useState(0);
  /** El recuento que dispara un 409 no borra su aviso. */
  const conservarAviso = useRef(false);

  /** «Todo el libro» excluye a los demás; los demás se suman entre sí. */
  const alternar = useCallback((a: ScopeVaciado) => {
    setHecho(null);
    setElegidos((prev) => {
      if (a === "todo") return prev.includes("todo") ? [] : ["todo"];
      if (prev.includes("todo")) return prev;
      const sig = prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a];
      return ALCANCES_VACIADO.filter((x) => sig.includes(x));
    });
  }, []);

  useEffect(() => {
    const miTurno = ++turno.current;
    if (elegidos.length === 0) {
      setResumen(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    if (!conservarAviso.current) setErr(null);
    conservarAviso.current = false;
    void (async () => {
      try {
        const r = await fetch(`${URL_PURGA}?scope=${elegidos.join(",")}`, { credentials: "include" });
        const j = await r.json();
        if (miTurno !== turno.current) return;
        if (!r.ok) throw new Error(j?.message ?? j?.error ?? "no se pudo consultar");
        setResumen({ alcances: j.alcances, conteo: j.conteo, porAlcance: j.porAlcance, lotesBloqueados: j.lotesBloqueados ?? [] });
        setPeriodos(j.periodos ?? []);
        if (j.palabra) setPalabra(j.palabra);
      } catch (e) {
        if (miTurno !== turno.current) return;
        logger.error("[ctp-purga] no se pudo contar el libro", { error: String(e), alcances: elegidos.join(",") });
        setErr("No se pudo leer el estado del libro.");
        setResumen(null);
      } finally {
        if (miTurno === turno.current) setCargando(false);
      }
    })();
  }, [elegidos, recuento]);

  const vaciar = useCallback(
    async (confirmacion: string) => {
      if (!resumen || cargando) {
        setErr("Espera a que termine de contar lo que se borra.");
        return;
      }
      setBorrando(true);
      setErr(null);
      try {
        const r = await fetch(URL_PURGA, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ confirmacion, scopes: elegidos, esperado: resumen.conteo }),
        });
        const j = await r.json();
        if (!r.ok) {
          setErr(j?.message ?? "No se pudo vaciar el libro.");
          if (j?.error === "libro_cambio") {
            conservarAviso.current = true;
            setRecuento((n) => n + 1);
          }
          return;
        }
        setHecho({ alcances: j.alcances, conteo: j.conteo, porAlcance: j.porAlcance, lotesBloqueados: j.lotesBloqueados ?? [] });
        onVaciado?.();
      } catch (e) {
        logger.error("[ctp-purga] falló el vaciado", { error: String(e), alcances: elegidos.join(",") });
        setErr("No se pudo enviar. Revisa la conexión.");
      } finally {
        setBorrando(false);
      }
    },
    [elegidos, resumen, cargando, onVaciado],
  );

  return { elegidos, alternar, resumen, periodos, palabra, cargando, borrando, err, hecho, vaciar };
}
