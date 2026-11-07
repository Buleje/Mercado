"use client";

/**
 * «Estado de cuenta» de una cubicación guardada (Brandon 03-11: «todo eso
 * cuádralo bonito y fácil de entender sin mucho texto en un pdf … tiene que
 * estar en una hoja entendible»). La carga sale sola de la guardada (tipo,
 * piezas, pies, precio, importe); acá sólo se escribe lo que el panel no sabe
 * de esa venta: los adelantos que dio el cliente, el saldo de la carga
 * anterior y otros cargos (realización de guía, flete…). Lo escrito se
 * recuerda en este equipo por cubicación, para volver a sacar el papel.
 *
 * Si el cliente tiene cuenta en el panel (Adelantos + cuenta forestal), sus
 * movimientos se traen solos: lo de cargas pasadas se junta en «Saldo
 * anterior» y el adelanto de ESTA carga se marca para que salga aparte.
 *
 * NO crea cobros ni movimientos: es un papel. La plata real sigue en Cuentas.
 */
import { useEffect, useMemo, useState } from "react";
import { FileDown, MessageCircle, Plus, Receipt, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import { hoyISO, precioDeCubicacion, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import {
  cuentaDesdeMovimientos, destinoPorDefecto, estadoDeCuentaDeLaCarga, filasDeLaCarga, pies3, soles,
  type DatosCuenta, type DestinoMovimiento, type LineaCuenta, type MovimientoDelCliente,
} from "@/lib/forestal/estado-cuenta-carga";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";
import { CuentaDelClienteBloque } from "./cubicador-estado-cuenta-cuenta";
import { useCuentaDelCliente } from "./hooks/use-cuenta-del-cliente";
import { usePapelEstadoCuenta } from "./hooks/use-papel-estado-cuenta";

const ENTRADA =
  "h-11 w-full min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";
const MONTO = `${ENTRADA} text-right font-bold tabular-nums`;
const CELDA = "whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums sm:px-2";
/** Títulos de columna: pueden bajar de renglón («Importe / S/») para que la tabla entre en 400 px. */
const TITULO = "px-1.5 py-1.5 text-right sm:px-2";
/** En la tabla el «S/» va en el título de la columna: en el celular «S/ 3.80» se partía en 2 renglones. */
const cifra = (n: number) => soles(n).replace(/^S\/ /, "");

interface Guardado extends DatosCuenta {
  cliente: string;
  carga: string;
  /** Adónde mandó cada movimiento de su cuenta (por `claveMov`); lo que no está, va por defecto. */
  destinos?: Record<string, DestinoMovimiento>;
}

const claveMov = (m: MovimientoDelCliente) => `${m.fecha}|${m.referencia ?? ""}|${m.concepto}|${m.monto}`;

const claveLocal = (id: string) => `buleje:estado-cuenta-carga:${id}`;

/** «S/ 23,000» o «23000» de la ficha (Pago y entrega) → 23000. */
function montoDeTexto(t: string | undefined): number {
  const n = Number((t ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function inicial(c: CubicacionRegistro): Guardado {
  const cliente = c.cliente?.trim() || "";
  return {
    cliente,
    carga: `${c.nombre} (${fechaDeLaGuardada(c.fecha)})`,
    adelantos: [{ concepto: `Adelantos que dio ${cliente || "el cliente"}`, monto: montoDeTexto(c.ficha?.adelanto) }],
    cargos: [
      { concepto: "Saldo de la carga anterior", monto: 0, nota: "" },
      { concepto: "Realización de guía", monto: 0 },
    ],
  };
}

function leer(c: CubicacionRegistro): Guardado {
  try {
    const raw = window.localStorage.getItem(claveLocal(c.id));
    if (raw) return { ...inicial(c), ...(JSON.parse(raw) as Partial<Guardado>) };
  } catch (err) {
    logger.warn("[estado-cuenta-carga] no se pudo leer lo anotado", { error: String(err) });
  }
  return inicial(c);
}

function Lineas({ titulo, signo, lineas, onCambiar, sugerencia }: {
  titulo: string;
  signo: "−" | "+";
  lineas: LineaCuenta[];
  onCambiar: (l: LineaCuenta[]) => void;
  sugerencia: string;
}) {
  const poner = (i: number, cambio: Partial<LineaCuenta>) => onCambiar(lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-bold text-[var(--text-primary)]">{titulo}</legend>
      {lineas.map((l, i) => (
        <div key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_8rem_2.75rem] items-start gap-2">
          <span className="pt-2.5 text-center text-base font-extrabold text-[var(--text-secondary)]" aria-hidden>{signo}</span>
          <div className="space-y-1">
            <input className={ENTRADA} value={l.concepto} onChange={(e) => poner(i, { concepto: e.target.value })} aria-label={`${titulo}: concepto`} placeholder={sugerencia} />
            {l.nota !== undefined && (
              <input className={`${ENTRADA} h-9 text-xs`} value={l.nota} onChange={(e) => poner(i, { nota: e.target.value })} aria-label={`${titulo}: aclaración`} placeholder="Aclaración chica (opcional): «ya descontados los depósitos de…»" />
            )}
          </div>
          <input className={MONTO} inputMode="decimal" value={l.monto === 0 ? "" : String(l.monto)} placeholder="0.00"
            onChange={(e) => poner(i, { monto: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} aria-label={`${titulo}: monto en soles`} />
          <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={() => onCambiar(lineas.filter((_, j) => j !== i))} aria-label="Quitar renglón">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
      <button type="button" className={button({ variant: "secondary", className: "gap-2" })} onClick={() => onCambiar([...lineas, { concepto: "", monto: 0 }])}>
        <Plus className="h-4 w-4" aria-hidden /> Otro renglón
      </button>
    </fieldset>
  );
}

export function EstadoCuentaCargaModal({ c, aboveModals, onClose }: { c: CubicacionRegistro; aboveModals?: boolean; onClose: () => void }) {
  const [datos, setDatos] = useState<Guardado>(() => leer(c));
  const papel = usePapelEstadoCuenta();
  const cuenta = useCuentaDelCliente(c.ficha?.clienteParteId, datos.cliente);

  useEffect(() => {
    try {
      window.localStorage.setItem(claveLocal(c.id), JSON.stringify(datos));
    } catch (err) {
      logger.warn("[estado-cuenta-carga] no se pudo recordar lo anotado", { error: String(err) });
    }
  }, [c.id, datos]);

  const filas = useMemo(() => filasDeLaCarga(c.piezas, precioDeCubicacion(c)), [c]);
  const destinos = useMemo(
    () => cuenta.movimientos.map((m) => datos.destinos?.[claveMov(m)] ?? destinoPorDefecto(m, c.gtfNumber)),
    [cuenta.movimientos, datos.destinos, c.gtfNumber],
  );
  const deLaCuenta = useMemo(() => cuentaDesdeMovimientos(cuenta.movimientos, destinos), [cuenta.movimientos, destinos]);
  const e = useMemo(
    () => estadoDeCuentaDeLaCarga(filas, { adelantos: [...deLaCuenta.adelantos, ...datos.adelantos], cargos: [...deLaCuenta.cargos, ...datos.cargos] }),
    [filas, deLaCuenta, datos.adelantos, datos.cargos],
  );
  const cliente = datos.cliente.trim() || "el cliente";
  const cab = { cliente: datos.cliente.trim() || "Cliente", carga: datos.carga.trim(), fecha: hoyISO() };
  const ponerDestino = (i: number, d: DestinoMovimiento) => {
    const m = cuenta.movimientos[i];
    if (m) setDatos({ ...datos, destinos: { ...datos.destinos, [claveMov(m)]: d } });
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      size="lg"
      icon={Receipt}
      title="Estado de cuenta"
      description="Una hoja para el cliente: su carga, lo que dio y lo que debe"
      claveVentana="cubicador-estado-cuenta"
      aboveModals={aboveModals}
      footer={
        <ModalFooter error={papel.error} aviso={papel.aviso} nota={e.sinPrecio > 0 ? `${e.sinPrecio} tipo(s) sin precio: salen con importe 0` : undefined}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cerrar</button>
          <button type="button" onClick={() => void papel.correr("whatsapp", e, cab, cuenta.elegida?.telefono ?? null)} disabled={papel.ocupado !== null}
            className={button({ variant: "secondary", className: "gap-2" })} data-accion="whatsapp-estado-cuenta">
            <MessageCircle className="h-4 w-4" aria-hidden /> {papel.ocupado === "whatsapp" ? "Armando…" : "WhatsApp"}
          </button>
          <button type="button" onClick={() => void papel.correr("bajar", e, cab, null)} disabled={papel.ocupado !== null} className={button({ variant: "accent", className: "gap-2" })} data-accion="bajar-estado-cuenta">
            <FileDown className="h-4 w-4" aria-hidden /> {papel.ocupado === "bajar" ? "Armando…" : "Bajar PDF"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]">
            Cliente
            <input className={ENTRADA} value={datos.cliente} onChange={(ev) => setDatos({ ...datos, cliente: ev.target.value })} placeholder="Don Rivers" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-[var(--text-secondary)]">
            Carga
            <input className={ENTRADA} value={datos.carga} onChange={(ev) => setDatos({ ...datos, carga: ev.target.value })} />
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <table className="w-full text-sm">
            <caption className="sr-only">Madera de esta carga</caption>
            <thead className="bg-[var(--surface-sunken)] text-xs text-[var(--text-secondary)]">
              <tr><th className="px-2 py-1.5 text-left">Tipo</th><th className={TITULO}>Piezas</th><th className={TITULO}>Pies</th><th className={TITULO}>Precio S/</th><th className={TITULO}>Importe S/</th></tr>
            </thead>
            <tbody>
              {e.filas.map((f) => (
                <tr key={f.clave} className="border-t border-[var(--rule-base)]">
                  <td className="px-2 py-1.5">{f.tipo}</td><td className={CELDA}>{f.piezas}</td><td className={CELDA}>{pies3(f.pies)}</td>
                  <td className={`${CELDA} ${f.precio === 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : ""}`}>{f.precio > 0 ? cifra(f.precio) : "sin precio"}</td>
                  <td className={CELDA}>{cifra(f.importe)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
              <tr><td className="px-2 py-1.5">Total de la carga</td><td className={CELDA}>{e.piezas}</td><td className={CELDA}>{pies3(e.pies)}</td><td /><td className={CELDA}>{cifra(e.importeCarga)}</td></tr>
            </tfoot>
          </table>
        </div>

        <CuentaDelClienteBloque cuenta={cuenta} destinos={destinos} onDestino={ponerDestino} otraMoneda={deLaCuenta.otraMoneda}
          onNombre={(nombre) => setDatos({ ...datos, cliente: nombre })} />

        <Lineas titulo="Lo que ya dio el cliente (se resta)" signo="−" lineas={datos.adelantos} sugerencia={`Adelantos que dio ${cliente}`}
          onCambiar={(adelantos) => setDatos({ ...datos, adelantos })} />
        <Lineas titulo="Lo que se suma" signo="+" lineas={datos.cargos} sugerencia="Realización de guía, flete…"
          onCambiar={(cargos) => setDatos({ ...datos, cargos })} />

        <div className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white" data-total={e.total}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-bold">{e.total >= 0 ? `Total que debe ${cliente}` : `Saldo a favor de ${cliente}`}</span>
            <span className="text-2xl font-extrabold tabular-nums">{soles(e.total)}</span>
          </div>
          <p className="mt-1 text-xs">Son: {e.enLetras}</p>
        </div>
      </div>
    </AdminModal>
  );
}
