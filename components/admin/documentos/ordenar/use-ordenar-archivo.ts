import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanOrden, TipoPropuesta } from "@/lib/documentos/ordenar-archivo";
import type { DeshacerOrden, ResultadoAplicar, ResultadoDeshacer } from "@/lib/documents/ordenar-servidor";
import { guardarConteo } from "./use-conteo-orden";
import { pedirOrden } from "./pedir-orden";

/**
 * Estado de «Ordenar mi Archivo»: pide el plan, lleva las casillas, aplica en
 * tandas (para mostrar avance de verdad) y junta lo necesario para deshacer.
 */

/** Por pedido: el servidor recalcula el plan en cada uno. */
const POR_TANDA = 20;
/** Cambios por pedido al deshacer (la ruta acepta hasta 200 por lista). */
export const POR_TANDA_DESHACER = 100;

const CORTADO = "Se cortó a mitad. Lo que alcanzó a hacerse se puede deshacer.";
const CORTADO_DESHACER = "Se cortó a mitad. Toca «Deshacer» otra vez para terminar: lo ya devuelto no se toca dos veces.";

export type FaseOrden = "cargando" | "error" | "listo" | "aplicando" | "hecho" | "deshaciendo" | "deshecho";

const VACIO: DeshacerOrden = { renombres: [], restaurar: [], carpetas: [], ia: [] };

function juntar(a: DeshacerOrden, b: DeshacerOrden): DeshacerOrden {
  return {
    renombres: [...a.renombres, ...b.renombres],
    restaurar: [...a.restaurar, ...b.restaurar],
    carpetas: [...a.carpetas, ...b.carpetas],
    ia: [...a.ia, ...b.ia],
  };
}

/** Parte el «Deshacer» en pedidos de `n` cambios; las carpetas primero (madres antes que hijas). */
export function enTandas(d: DeshacerOrden, n = POR_TANDA_DESHACER): DeshacerOrden[] {
  const piezas: DeshacerOrden[] = [
    ...madresPrimero(d.carpetas).map((c) => ({ ...VACIO, carpetas: [c] })),
    ...d.restaurar.map((id) => ({ ...VACIO, restaurar: [id] })),
    ...d.renombres.map((r) => ({ ...VACIO, renombres: [r] })),
    ...d.ia.map((x) => ({ ...VACIO, ia: [x] })),
  ];
  const tandas: DeshacerOrden[] = [];
  for (let i = 0; i < piezas.length; i += n) tandas.push(piezas.slice(i, i + n).reduce(juntar, VACIO));
  return tandas;
}

type CarpetaBorrada = DeshacerOrden["carpetas"][number];

/** Si una madre cae en una tanda posterior a su hija, la hija renacería en la raíz. */
function madresPrimero(cs: readonly CarpetaBorrada[]): CarpetaBorrada[] {
  const porId = new Map(cs.map((c) => [c.id, c]));
  const hondura = (c: CarpetaBorrada): number => {
    let h = 0;
    for (let m = c.parentId ? porId.get(c.parentId) : undefined; m && h < cs.length; m = m.parentId ? porId.get(m.parentId) : undefined) h++;
    return h;
  };
  return cs.map((c) => ({ c, h: hondura(c) })).sort((a, b) => a.h - b.h).map((x) => x.c);
}

/** Una hija cuya madre se recreó en una tanda anterior apunta al id nuevo. */
function conMadresNuevas(d: DeshacerOrden, ids: Readonly<Record<string, string>>): DeshacerOrden {
  return { ...d, carpetas: d.carpetas.map((c) => (c.parentId && ids[c.parentId] ? { ...c, parentId: ids[c.parentId] } : c)) };
}

export function useOrdenarArchivo({ descartadas, onCambio }: { descartadas: readonly string[]; onCambio?: () => void }) {
  const [fase, setFase] = useState<FaseOrden>("cargando");
  const [plan, setPlan] = useState<PlanOrden | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [avance, setAvance] = useState({ hechos: 0, total: 0 });
  const [resultado, setResultado] = useState<{ aplicados: number; fallidos: number; deshacer: DeshacerOrden } | null>(null);
  const [revertidos, setRevertidos] = useState(0);
  // La lista de descartadas cambia de identidad en cada render del módulo: se lee al pedir.
  const descartadasRef = useRef(descartadas);
  descartadasRef.current = descartadas;
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  const cargar = useCallback(async (signal?: AbortSignal) => {
    setFase("cargando");
    setError(null);
    try {
      const p = await pedirOrden<PlanOrden>({ modo: "plan", descartadas: [...descartadasRef.current] }, signal);
      if (signal?.aborted) return;
      setPlan(p);
      guardarConteo(p);
      setElegidas(new Set(p.propuestas.map((x) => x.id)));
      setFase("listo");
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setFase("error");
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void cargar(ctrl.signal);
    return () => ctrl.abort();
  }, [cargar]);

  const alternar = useCallback((id: string) => {
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const marcarSeccion = useCallback(
    (tipo: TipoPropuesta, marcar: boolean) => {
      const ids = (plan?.propuestas ?? []).filter((p) => p.tipo === tipo).map((p) => p.id);
      setElegidas((s) => {
        const n = new Set(s);
        for (const id of ids) {
          if (marcar) n.add(id);
          else n.delete(id);
        }
        return n;
      });
    },
    [plan],
  );

  const aplicar = useCallback(async () => {
    const ids = (plan?.propuestas ?? []).filter((p) => elegidas.has(p.id)).map((p) => p.id);
    if (ids.length === 0) return;
    setFase("aplicando");
    setError(null);
    setRevertidos(0);
    setAvance({ hechos: 0, total: ids.length });
    let acumulado = { aplicados: 0, fallidos: 0, deshacer: VACIO };
    try {
      for (let i = 0; i < ids.length; i += POR_TANDA) {
        const tanda = ids.slice(i, i + POR_TANDA);
        const r = await pedirOrden<ResultadoAplicar>({ modo: "aplicar", ids: tanda, descartadas: [...descartadasRef.current] });
        acumulado = {
          aplicados: acumulado.aplicados + r.aplicados,
          fallidos: acumulado.fallidos + r.fallidos + r.vencidas.length,
          deshacer: juntar(acumulado.deshacer, r.deshacer),
        };
        setAvance({ hechos: Math.min(ids.length, i + tanda.length), total: ids.length });
        if (r.interrumpido) {
          setError(CORTADO);
          break;
        }
      }
    } catch (e) {
      // Lo que alcanzó a aplicarse se puede deshacer igual.
      setError(e instanceof Error ? e.message : String(e));
    }
    setResultado(acumulado);
    setFase("hecho");
    if (acumulado.aplicados > 0) onCambioRef.current?.();
  }, [plan, elegidas]);

  const deshacer = useCallback(async () => {
    if (!resultado) return;
    setFase("deshaciendo");
    setError(null);
    const tandas = enTandas(resultado.deshacer);
    let carpetasNuevas: Record<string, string> = {};
    let hechos = revertidos;
    for (let i = 0; i < tandas.length; i++) {
      const tanda = conMadresNuevas(tandas[i], carpetasNuevas);
      let r: ResultadoDeshacer | null = null;
      try {
        r = await pedirOrden<ResultadoDeshacer>({ modo: "deshacer", deshacer: tanda });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      if (r) {
        hechos += r.revertidos;
        carpetasNuevas = { ...carpetasNuevas, ...r.carpetas };
        if (r.interrumpido) setError(CORTADO_DESHACER);
      }
      if (!r || r.interrumpido) {
        // Queda pendiente esta tanda (repetirla es seguro) y las que faltan.
        const resto = [tanda, ...tandas.slice(i + 1)].map((t) => conMadresNuevas(t, carpetasNuevas)).reduce(juntar, VACIO);
        setRevertidos(hechos);
        setResultado({ ...resultado, deshacer: resto });
        setFase("hecho");
        if (hechos > 0) onCambioRef.current?.();
        return;
      }
    }
    setRevertidos(hechos);
    setFase("deshecho");
    onCambioRef.current?.();
  }, [resultado, revertidos]);

  const marcadas = useMemo(
    () => (plan?.propuestas ?? []).filter((p) => elegidas.has(p.id)).length,
    [plan, elegidas],
  );

  return {
    fase, plan, error, elegidas, marcadas, avance, resultado, revertidos,
    recargar: () => void cargar(), alternar, marcarSeccion, aplicar, deshacer,
  };
}
