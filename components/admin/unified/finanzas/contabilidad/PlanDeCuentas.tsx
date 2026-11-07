"use client";

/**
 * El plan de cuentas (PCGE 2019): buscador, las cuentas que ya se usan
 * resaltadas, y alta/baja de cuentas propias. Solo las propias se pueden dar de
 * baja; las del PCGE base no se tocan.
 */
import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Plus } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { button } from "@/components/ui-system/button-variants";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { useAccionContable } from "@/hooks/use-contabilidad-acciones";
import { NATURALEZAS, type CuentaPlan, type CuentaPropiaEntrada, type Naturaleza, type RespuestaPlan } from "@/lib/contabilidad/tipos";
import { Bloque, Cargador, FRASE_VACIA, Insignia } from "./compartido";
import { CAMPO, ETIQUETA } from "./campos";

const TOPE = 150;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const NOMBRE_NAT: Record<Naturaleza, string> = { activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio", ingreso: "Ingreso", gasto: "Gasto" };

function AltaDeCuenta({ onCreada }: { onCreada: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [f, setF] = useState<CuentaPropiaEntrada>({ codigo: "", nombre: "", naturaleza: "gasto" });
  const { ejecutar, enviando, error, limpiar } = useAccionContable();
  const listo = /^\d{3,10}$/.test(f.codigo) && f.nombre.trim().length >= 3 && !enviando;
  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)} className={button({ variant: "secondary", className: "gap-2 rounded-xl px-4" })}>
        <Plus className="h-4 w-4" aria-hidden />Agregar cuenta propia
      </button>
    );
  }
  const guardar = async () => {
    const res = await ejecutar<CuentaPlan>("POST", "plan", { ...f, nombre: f.nombre.trim() });
    if (!res.ok) return;
    toast.success(`Cuenta ${res.datos.codigo} creada.`);
    setF({ codigo: "", nombre: "", naturaleza: f.naturaleza });
    setAbierta(false);
    onCreada();
  };
  return (
    <Bloque className="space-y-3 p-4">
      <p className="text-sm text-[var(--text-secondary)]">Tu cuenta tiene que colgar de una del plan: por ejemplo 10411 cuelga de 1041.</p>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_11rem]">
        <label><span className={ETIQUETA}>Número</span><input inputMode="numeric" className={CAMPO} value={f.codigo} onChange={(e) => { limpiar(); setF({ ...f, codigo: e.target.value.replace(/\D/g, "") }); }} /></label>
        <label><span className={ETIQUETA}>Nombre</span><input className={CAMPO} value={f.nombre} maxLength={80} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label>
          <span className={ETIQUETA}>Tipo</span>
          <select className={CAMPO} value={f.naturaleza} onChange={(e) => setF({ ...f, naturaleza: e.target.value as Naturaleza })}>
            {NATURALEZAS.map((n) => <option key={n} value={n}>{NOMBRE_NAT[n]}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-ink)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void guardar()} disabled={!listo} className={button({ variant: "accent", className: "rounded-xl px-5" })}>{enviando ? "Guardando…" : "Guardar cuenta"}</button>
        <button type="button" onClick={() => { setAbierta(false); limpiar(); }} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Cancelar</button>
      </div>
    </Bloque>
  );
}

export default function PlanDeCuentas() {
  const estado = useContabilidad<RespuestaPlan>("plan");
  const { ejecutar } = useAccionContable();
  const [q, setQ] = useState("");
  const [soloUsadas, setSoloUsadas] = useState(false);
  const [todas, setTodas] = useState(false);

  const usadas = useMemo(() => new Set(estado.datos?.usadas ?? []), [estado.datos]);
  const vistas = useMemo(() => {
    const t = sinTildes(q.trim());
    return (estado.datos?.cuentas ?? []).filter((c) => (!soloUsadas || usadas.has(c.codigo)) && (!t || c.codigo.startsWith(t) || sinTildes(c.nombre).includes(t)));
  }, [estado.datos, q, soloUsadas, usadas]);
  const mostradas = todas || q ? vistas : vistas.slice(0, TOPE);

  const cambiarActiva = async (c: CuentaPlan) => {
    const res = await ejecutar<CuentaPlan>("PATCH", `plan/${encodeURIComponent(c.codigo)}`, { activa: !c.activa });
    if (res.ok) { toast.success(c.activa ? `Cuenta ${c.codigo} dada de baja.` : `Cuenta ${c.codigo} activa otra vez.`); estado.recargar(); }
    else toast.error(res.error);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" className={`${CAMPO} sm:max-w-sm`} placeholder="Buscar cuenta (caja, 1011, sueldos…)" aria-label="Buscar en el plan de cuentas" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-pressed={soloUsadas} onClick={() => setSoloUsadas((v) => !v)} className={button({ variant: soloUsadas ? "accent" : "secondary", className: "rounded-xl px-4" })}>
          Solo las que uso
        </button>
        <div className="ml-auto"><AltaDeCuenta onCreada={estado.recargar} /></div>
      </div>
      <Cargador estado={estado}>
        {() => (
          <Bloque className="overflow-x-auto">
            <DataTable>
              <thead><tr><th>Cuenta</th><th>Nombre</th><th>Tipo</th><th>Estado</th><th className="text-right">Acción</th></tr></thead>
              <tbody>
                {mostradas.length === 0 && <tr><td colSpan={5} className={FRASE_VACIA}>Ninguna cuenta coincide.</td></tr>}
                {mostradas.map((c) => {
                  const usada = usadas.has(c.codigo);
                  return (
                    <tr key={c.codigo} className={usada ? "bg-[var(--accent-soft)]" : undefined}>
                      <td className={`whitespace-nowrap tabular-nums ${c.imputable ? "font-semibold" : "font-bold"}`}>{c.codigo}</td>
                      <td className={c.activa ? undefined : "line-through opacity-60"}>{c.nombre}</td>
                      <td className="text-[var(--text-secondary)]">{NOMBRE_NAT[c.naturaleza]}{!c.imputable && " · agrupa"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {usada && <Insignia tono="ok">Se usa</Insignia>}
                          {c.propia && <Insignia tono="info">Propia</Insignia>}
                          {!c.activa && <Insignia>De baja</Insignia>}
                        </div>
                      </td>
                      <td className="text-right">
                        {c.propia && (
                          <button type="button" onClick={() => void cambiarActiva(c)} disabled={c.activa && usada} title={c.activa && usada ? "Ya tiene movimientos: no se puede dar de baja" : undefined} className={button({ variant: "ghost", size: "sm" })}>
                            {c.activa ? "Dar de baja" : "Activar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            {!todas && !q && vistas.length > TOPE && (
              <div className="border-t border-[var(--rule-soft)] p-3">
                <button type="button" onClick={() => setTodas(true)} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Ver las {vistas.length} cuentas</button>
              </div>
            )}
          </Bloque>
        )}
      </Cargador>
    </div>
  );
}
