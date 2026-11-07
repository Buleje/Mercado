/**
 * lib/semaforo/formulario.ts — el modal de Ajustes del Semáforo, en texto (ADR-508).
 *
 * El formulario trabaja con strings (lo que se tipea) y al guardar arma SÓLO
 * lo que cambió: un umbral que el dueño no tocó sigue siguiendo al catálogo, y
 * cambiar el ticket no pisa la caja que anotó otro. Campo vacío = «sin meta»
 * (`null`), que es distinto de no tocarlo (`undefined`).
 *
 * Puro: lo usa la vista (modal de Ajustes) y lo prueba
 * `__tests__/semaforo-formulario.test.ts`.
 */
import { INDICADORES, type IndicadorId } from "./indicadores";
import { normalizarConfig, type ConfigSemaforoGuardada } from "./config";

export interface FilaIndicadorForm {
  verde: string;
  amarillo: string;
  verdeHasta: string;
  rojo: string;
  apagado: boolean;
}

export interface FormSemaforo {
  lanzamiento: string;
  caja: string;
  decisionFecha: string;
  decisionVerde: string;
  decisionAmarillo: string;
  decisionRecompra: string;
  productosA: string;
  categoriasAnuncios: string;
  indicadores: Record<IndicadorId, FilaIndicadorForm>;
}

const txt = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

/** De lo guardado (o nada) al formulario con los valores que hoy valen. */
export function formDeConfig(guardada: ConfigSemaforoGuardada): FormSemaforo {
  const cfg = normalizarConfig(guardada);
  const indicadores = {} as Record<IndicadorId, FilaIndicadorForm>;
  for (const def of INDICADORES) {
    const a = cfg.indicadores[def.id];
    indicadores[def.id] = {
      verde: txt(a.verde),
      amarillo: txt(a.amarillo),
      verdeHasta: txt(a.verdeHasta),
      rojo: a.acciones.rojo,
      apagado: a.apagado,
    };
  }
  return {
    lanzamiento: cfg.lanzamiento ?? "",
    caja: txt(cfg.cajaAnotada?.monto),
    decisionFecha: cfg.decision?.fecha ?? "",
    decisionVerde: txt(cfg.decision?.verde),
    decisionAmarillo: txt(cfg.decision?.amarillo),
    decisionRecompra: txt(cfg.decision?.rojoSiRecompraMenorA),
    productosA: cfg.productosA.join(", "),
    categoriasAnuncios: guardada.categoriasAnuncios?.join(", ") ?? "",
    indicadores,
  };
}

/** «12,5» o «12.5» → 12.5 · vacío → null · basura → NaN (lo ataja `cambioDeForm`). */
function numero(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  return Number(t);
}

const lista = (s: string): string[] =>
  [...new Set(s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];

export type ResultadoForm = { ok: true; cambio: ConfigSemaforoGuardada } | { ok: false; error: string };

/**
 * Compara el formulario con el de partida y arma el cambio para el PUT.
 * `guardada` hace falta para no perder las acciones de verde/amarillo que ya
 * había: `mezclarConfig` reemplaza `acciones` entera por indicador.
 */
export function cambioDeForm(
  form: FormSemaforo,
  inicial: FormSemaforo,
  guardada: ConfigSemaforoGuardada,
  hoy: string,
): ResultadoForm {
  const cambio: ConfigSemaforoGuardada = {};
  const malo = (que: string): ResultadoForm => ({ ok: false, error: `Revisa ${que}: tiene que ser un número.` });

  if (form.lanzamiento !== inicial.lanzamiento) cambio.lanzamiento = form.lanzamiento || null;

  if (form.caja !== inicial.caja) {
    const monto = numero(form.caja);
    if (Number.isNaN(monto)) return malo("la caja del lunes");
    cambio.cajaAnotada = monto === null ? null : { monto, fecha: hoy };
  }

  const claveDecision = (f: FormSemaforo) => [f.decisionFecha, f.decisionVerde, f.decisionAmarillo, f.decisionRecompra].join("|");
  if (claveDecision(form) !== claveDecision(inicial)) {
    const verde = numero(form.decisionVerde);
    const amarillo = numero(form.decisionAmarillo);
    const recompra = numero(form.decisionRecompra);
    const vacia = !form.decisionFecha && verde === null && amarillo === null;
    if (vacia) cambio.decision = null;
    else {
      if (!form.decisionFecha || verde === null || amarillo === null) {
        return { ok: false, error: "La decisión necesita su fecha, la ganancia para verde y la de amarillo." };
      }
      if ([verde, amarillo, recompra].some((n) => Number.isNaN(n))) return malo("la decisión");
      if (recompra !== null && (recompra < 0 || recompra > 100)) return { ok: false, error: "El % de clientes que vuelven va de 0 a 100." };
      cambio.decision = { fecha: form.decisionFecha, verde, amarillo, rojoSiRecompraMenorA: recompra };
    }
  }

  if (form.productosA !== inicial.productosA) cambio.productosA = lista(form.productosA);
  if (form.categoriasAnuncios !== inicial.categoriasAnuncios) {
    cambio.categoriasAnuncios = lista(form.categoriasAnuncios).map((c) => c.toLowerCase());
  }

  const indicadores: NonNullable<ConfigSemaforoGuardada["indicadores"]> = {};
  for (const def of INDICADORES) {
    const f = form.indicadores[def.id];
    const i = inicial.indicadores[def.id];
    const ajuste: NonNullable<typeof indicadores[IndicadorId]> = {};
    for (const campo of ["verde", "amarillo", "verdeHasta"] as const) {
      if (f[campo] === i[campo]) continue;
      const n = numero(f[campo]);
      if (Number.isNaN(n)) return malo(`«${def.nombre}»`);
      ajuste[campo] = n;
    }
    if (f.rojo.trim() !== i.rojo.trim()) {
      ajuste.acciones = { ...(guardada.indicadores?.[def.id]?.acciones ?? {}), rojo: f.rojo.trim() };
    }
    if (f.apagado !== i.apagado) ajuste.apagado = f.apagado;
    if (Object.keys(ajuste).length > 0) indicadores[def.id] = ajuste;
  }
  if (Object.keys(indicadores).length > 0) cambio.indicadores = indicadores;

  return { ok: true, cambio };
}
