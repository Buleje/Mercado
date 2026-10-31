"use client";

/**
 * Ajustes › Cobros y comprobantes › «Precios y rebajas»: el piso sobre el
 * costo y el margen mínimo de la regla única de rebajas
 * (`lib/precios/margenes-rebajas.ts`). Los usan igual Análisis › Sugerencias
 * de precio y la IA › Precios en bloque.
 *
 * Se guarda con su propio botón (vive en los flags del negocio, no pasa por la
 * barra de cambios). `?campo=margenes-rebajas` la trae a la vista: el «Cambiar»
 * de la lista de rebajas llega aquí.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Percent, ShieldCheck } from "@buleje/design-system/icons";
import { CLASE_CAMPO, FieldLabel } from "@/components/admin/settings/campos";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CAMPO_MARGENES_REBAJAS,
  MARGENES_REBAJAS_POR_DEFECTO,
  MargenesRebajasSchema,
  pctTexto,
  type MargenesRebajas,
} from "@/lib/precios/margenes-rebajas";

const URL_API = "/api/settings/margenes-rebajas";
const iguales = (a: MargenesRebajas | null, b: MargenesRebajas) =>
  !!a && a.pisoSobreCosto === b.pisoSobreCosto && a.margenMinimoSugerido === b.margenMinimoSugerido;

type Clave = keyof MargenesRebajas;
type Textos = Record<Clave, string>;
/** Borrador como texto: un campo borrado es «vacío», no 0 % (un piso 0 % sin querer). */
const aTextos = (m: MargenesRebajas): Textos => ({ pisoSobreCosto: String(m.pisoSobreCosto), margenMinimoSugerido: String(m.margenMinimoSugerido) });
const aNumero = (t: string) => (t.trim() === "" ? Number.NaN : Number(t.replace(",", ".")));
const verPct = (n: number) => (Number.isFinite(n) ? pctTexto(n) : "… %");

/** Como `NumberInput` de Ajustes, pero el valor es el texto: vacío se ve vacío. */
function CampoPct({ id, texto, onChange, sufijo }: { id: string; texto: string; onChange: (t: string) => void; sufijo: string }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="number" inputMode="decimal" value={texto} onChange={(e) => onChange(e.target.value)} min={0} max={90} step={1} className={cn("flex-1 font-mono", CLASE_CAMPO)} />
      <span className="text-sm text-[var(--text-secondary)] font-medium shrink-0">{sufijo}</span>
    </div>
  );
}

export function MargenesRebajasCampos() {
  const ref = useRef<HTMLDivElement>(null);
  const [guardado, setGuardado] = useState<MargenesRebajas | null>(null);
  const [texto, setTexto] = useState<Textos>(aTextos(MARGENES_REBAJAS_POR_DEFECTO));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(URL_API)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r = MargenesRebajasSchema.safeParse(await res.json());
        const m = r.success ? r.data : { ...MARGENES_REBAJAS_POR_DEFECTO };
        if (vivo) { setGuardado(m); setTexto(aTextos(m)); }
      })
      .catch((err) => {
        console.warn("[ajustes] margenes de rebajas", err);
        if (vivo) setAviso({ ok: false, texto: "No pude leer lo guardado: se ven los de fábrica." });
      });
    return () => { vivo = false; };
  }, []);

  // «Cambiar» desde la lista de rebajas: `?campo=margenes-rebajas` la trae a la vista.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("campo") !== CAMPO_MARGENES_REBAJAS) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => clearTimeout(t);
  }, []);

  const valor: MargenesRebajas = { pisoSobreCosto: aNumero(texto.pisoSobreCosto), margenMinimoSugerido: aNumero(texto.margenMinimoSugerido) };
  const vacio = texto.pisoSobreCosto.trim() === "" || texto.margenMinimoSugerido.trim() === "";
  const valido = MargenesRebajasSchema.safeParse(valor);
  const error = vacio ? "Escribe los dos números." : valido.success ? null : (valido.error.issues[0]?.message ?? "Revisa los números.");
  const sinCambios = iguales(guardado, valor);
  const deFabrica = iguales(valor, MARGENES_REBAJAS_POR_DEFECTO);

  async function guardar() {
    if (vacio || !valido.success) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch(URL_API, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(valido.data),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setAviso({ ok: false, texto: res.status === 403 ? "Sólo el dueño, un admin o el encargado lo cambia." : (d?.error ?? `No se pudo guardar (error ${res.status}).`) });
        return;
      }
      setGuardado(valido.data);
      setAviso({ ok: true, texto: "Guardado: Análisis y la IA ya usan estos números." });
    } catch (err) {
      console.warn("[ajustes] margenes de rebajas", err);
      setAviso({ ok: false, texto: "Sin conexión: no se guardó." });
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (k: Clave) => (t: string) => {
    setAviso(null);
    setTexto((prev) => ({ ...prev, [k]: t }));
  };

  return (
    <div ref={ref} id={CAMPO_MARGENES_REBAJAS} className="space-y-3 scroll-mt-24">
      <div className="grid grid-cols-1 sm:grid-cols-2 items-start gap-x-4 gap-y-3">
        <div className="space-y-1">
          <FieldLabel htmlFor="settings-pisoSobreCosto" icon={<ShieldCheck className="h-3.5 w-3.5" />}>Piso de una rebaja</FieldLabel>
          <CampoPct id="settings-pisoSobreCosto" texto={texto.pisoSobreCosto} onChange={cambiar("pisoSobreCosto")} sufijo="% sobre el costo" />
          <p className="text-xs text-[var(--text-secondary)]">Nunca rebajar por debajo de costo + {verPct(valor.pisoSobreCosto)}.</p>
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="settings-margenMinimoSugerido" icon={<Percent className="h-3.5 w-3.5" />}>Margen mínimo</FieldLabel>
          <CampoPct id="settings-margenMinimoSugerido" texto={texto.margenMinimoSugerido} onChange={cambiar("margenMinimoSugerido")} sufijo="% de margen" />
          <p className="text-xs text-[var(--text-secondary)]">Marcar solo las rebajas que dejan al menos {verPct(valor.margenMinimoSugerido)} de margen.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={guardando || sinCambios || !!error || guardado === null} onClick={() => void guardar()} className={button({ variant: "primary", className: "rounded-xl" })}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Guardar
        </button>
        {!deFabrica && (
          <button type="button" onClick={() => { setAviso(null); setTexto(aTextos(MARGENES_REBAJAS_POR_DEFECTO)); }} className={button({ variant: "ghost", className: "rounded-xl" })}>
            Volver a {pctTexto(MARGENES_REBAJAS_POR_DEFECTO.pisoSobreCosto)} y {pctTexto(MARGENES_REBAJAS_POR_DEFECTO.margenMinimoSugerido)}
          </button>
        )}
        {error ? (
          <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>
        ) : aviso ? (
          <p role="status" className={aviso.ok ? "text-sm text-[var(--data-success-ink)]" : "text-sm text-[var(--data-error-ink)]"}>{aviso.texto}</p>
        ) : null}
      </div>
    </div>
  );
}
