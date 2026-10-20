"use client";

import { useId, useState } from "react";
import { Plus, Settings2, Trash2 } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { ConfigRevendedorasSchema, type ConfigRevendedoras } from "@/lib/revendedoras/reglas";

type Resultado = { ok: true } | { ok: false; error: string };

/** El formulario guarda texto (se puede borrar un número mientras se escribe). */
interface Formulario {
  activo: boolean;
  niveles: { desde: string; descuento: string }[];
  pedidoMinimo: string;
  envioGratis: boolean;
  envioGratisDesde: string;
  margenMinimo: string;
  categorias: string[];
  mesesSinCredito: string;
  metaActivas: string;
}

const MAX_NIVELES = 4;
const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-60";
const LABEL = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
const CHECK = "h-5 w-5 shrink-0 accent-[var(--accent)]";

const txt = (n: number) => String(n);
const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));

function aFormulario(c: ConfigRevendedoras): Formulario {
  return {
    activo: c.activo,
    niveles: c.niveles.map((n) => ({ desde: txt(n.desde), descuento: txt(n.descuento) })),
    pedidoMinimo: txt(c.pedidoMinimo),
    envioGratis: c.envioGratisDesde != null,
    envioGratisDesde: txt(c.envioGratisDesde ?? 300),
    margenMinimo: txt(c.margenMinimo),
    categorias: c.categoriasSinDescuento,
    mesesSinCredito: txt(c.mesesSinCredito),
    metaActivas: txt(c.metaActivas),
  };
}

function aConfig(f: Formulario): unknown {
  return {
    activo: f.activo,
    niveles: f.niveles.map((n, i) => ({ desde: i === 0 ? 0 : num(n.desde), descuento: num(n.descuento) })),
    pedidoMinimo: num(f.pedidoMinimo),
    envioGratisDesde: f.envioGratis ? num(f.envioGratisDesde) : null,
    margenMinimo: num(f.margenMinimo),
    categoriasSinDescuento: f.categorias,
    mesesSinCredito: num(f.mesesSinCredito),
    metaActivas: num(f.metaActivas),
  };
}

/** Las reglas del negocio: niveles, mínimo, envío, ganancia mínima, ofertas y fiado. */
export default function ConfigRevendedorasModal({
  open,
  onClose,
  config,
  porDefecto,
  categorias,
  onGuardar,
}: {
  open: boolean;
  onClose: () => void;
  config: ConfigRevendedoras;
  porDefecto: ConfigRevendedoras;
  categorias: string[];
  onGuardar: (c: ConfigRevendedoras) => Promise<Resultado>;
}) {
  const idForm = useId();
  const [f, setF] = useState<Formulario>(() => aFormulario(config));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const poner = (p: Partial<Formulario>) => setF((x) => ({ ...x, ...p }));
  const ponerNivel = (i: number, p: Partial<Formulario["niveles"][number]>) =>
    setF((x) => ({ ...x, niveles: x.niveles.map((n, j) => (j === i ? { ...n, ...p } : n)) }));
  const todasLasCategorias = [...new Set([...categorias, ...f.categorias])].sort((a, b) => a.localeCompare(b, "es"));

  async function guardar() {
    const parsed = ConfigRevendedorasSchema.safeParse(aConfig(f));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      // Un casillero vacío o con letras llega como NaN: el mensaje de Zod sale en inglés.
      setError(!i ? "Revisa los números." : i.code === "invalid_type" ? "Completa los números (sólo cifras; meses y meta sin decimales)." : i.message);
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await onGuardar(parsed.data);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    toast.success("Reglas de revendedoras guardadas");
    onClose();
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Reglas de revendedoras"
      icon={Settings2}
      size="lg"
      claveVentana="revendedoras-reglas"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={() => setF(aFormulario({ ...porDefecto, activo: f.activo }))} className={button({ variant: "ghost" })}>
            Los de fábrica
          </button>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void guardar()} disabled={guardando} className={button({ variant: "primary" })}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-5")}>
        <label className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-3">
          <input type="checkbox" checked={f.activo} onChange={(e) => poner({ activo: e.target.checked })} className={CHECK} />
          <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">Reglas activas en mi negocio</span>
        </label>

        <fieldset className="space-y-2">
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
            Descuento según lo que compra en el mes
            <InfoTip
              title="Niveles"
              what="Lo que la revendedora compró en el mes (en Lima) decide su descuento. El pedido con el que pasa el monto ya sale con el descuento nuevo."
              affects="Los descuentos no se suman con ofertas, kits ni preventa."
              example="20 % desde S/ 0 y 25 % desde S/ 600: si ya compró S/ 450 y pide S/ 190 más, todo ese pedido sale al 25 %."
            />
          </legend>
          {f.niveles.map((n, i) => (
            <div key={i} className="flex items-end gap-2" data-nivel={i}>
              <label className="flex-1">
                <span className={LABEL}>{i === 0 ? "Desde (todas)" : "Desde S/ comprado"}</span>
                <input inputMode="decimal" value={i === 0 ? "0" : n.desde} disabled={i === 0} onChange={(e) => ponerNivel(i, { desde: e.target.value })} className={INPUT} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Descuento %</span>
                <input inputMode="decimal" value={n.descuento} onChange={(e) => ponerNivel(i, { descuento: e.target.value })} className={INPUT} />
              </label>
              <button
                type="button"
                aria-label={`Quitar el nivel ${i + 1}`}
                disabled={i === 0}
                onClick={() => poner({ niveles: f.niveles.filter((_, j) => j !== i) })}
                className={button({ variant: "ghost", className: "h-12 w-12 shrink-0 px-0" })}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          {f.niveles.length < MAX_NIVELES && (
            <button
              type="button"
              onClick={() => {
                const ultimo = f.niveles[f.niveles.length - 1];
                poner({ niveles: [...f.niveles, { desde: txt((num(ultimo?.desde ?? "0") || 0) + 600), descuento: ultimo?.descuento ?? "20" }] });
              }}
              className={button({ variant: "secondary", className: "gap-1.5" })}
            >
              <Plus className="h-4 w-4" aria-hidden /> Agregar nivel
            </button>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={LABEL}>Pedido mínimo S/</span>
            <input inputMode="decimal" value={f.pedidoMinimo} onChange={(e) => poner({ pedidoMinimo: e.target.value })} className={INPUT} />
          </label>
          <div>
            <span className={cn(LABEL, "flex items-center gap-1.5")}>
              <label htmlFor={`${idForm}-margen`}>Ganancia mínima %</label>
              <InfoTip
                title="Ganancia mínima"
                what="Ningún precio de revendedora deja menos que esto sobre el costo del producto."
                affects="Si el descuento la rompe, el precio se queda en el piso y la pantalla lo avisa."
                example="Costo S/ 45 con 30 %: el precio nunca baja de S/ 64,29."
              />
            </span>
            <input id={`${idForm}-margen`} inputMode="decimal" value={f.margenMinimo} onChange={(e) => poner({ margenMinimo: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <input type="checkbox" checked={f.envioGratis} onChange={(e) => poner({ envioGratis: e.target.checked })} className={CHECK} />
              Envío gratis desde S/
            </label>
            <input
              inputMode="decimal"
              aria-label="Envío gratis desde S/"
              value={f.envioGratis ? f.envioGratisDesde : ""}
              placeholder="Lo paga ella"
              disabled={!f.envioGratis}
              onChange={(e) => poner({ envioGratisDesde: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <span className={cn(LABEL, "flex items-center gap-1.5")}>
              <label htmlFor={`${idForm}-sin-fiado`}>Meses sin fiado al empezar</label>
              <InfoTip title="Sin fiado" what="Los primeros meses desde que la agregas, paga al contado." example="3 meses: agregada el 20/11, puede fiar desde el 20/02." />
            </span>
            <input id={`${idForm}-sin-fiado`} inputMode="numeric" value={f.mesesSinCredito} onChange={(e) => poner({ mesesSinCredito: e.target.value })} className={INPUT} />
          </div>
          <label>
            <span className={LABEL}>Meta de revendedoras activas</span>
            <input inputMode="numeric" value={f.metaActivas} onChange={(e) => poner({ metaActivas: e.target.value })} className={INPUT} />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
            Categorías sin descuento
            <InfoTip
              title="Ofertas"
              what="Lo de estas categorías va siempre a su precio: ya trae su propio descuento."
              example="«Kits y ofertas»: el kit de S/ 179 lo paga S/ 179 también la revendedora."
            />
          </legend>
          {todasLasCategorias.length === 0 ? (
            <span className="text-sm text-[var(--text-tertiary)]">Tus productos no tienen categorías.</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {todasLasCategorias.map((c) => {
                const on = f.categorias.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => poner({ categorias: on ? f.categorias.filter((x) => x !== c) : [...f.categorias, c] })}
                    className={cn(
                      "min-h-10 rounded-full border px-3 text-sm",
                      on
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold text-[var(--text-primary)]"
                        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>
    </AdminModal>
  );
}
