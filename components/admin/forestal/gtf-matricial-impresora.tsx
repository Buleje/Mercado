"use client";

/**
 * «Impresora» dentro de Calibrar (16-10): cada matricial corre el papel a su
 * manera, así que la calibración es POR impresora. Oficina = la de siempre (su
 * corrimiento es el X/Y de la hoja, guardado con el talonario); las demás
 * («Monte – Epson LX-350») tienen el suyo y una escala para la que estira o
 * encoge el papel. La prueba sale con la elegida: en el navegador, en PDF a
 * tamaño real o en ESC/P (.prn) para la matricial.
 *
 * Dos pruebas: las CRUCES (se miden con regla) y la «Hoja de prueba en papel
 * blanco» (el formato dibujado + los valores + las cruces, para ponerla sobre el
 * talonario contra una ventana y ver si las rayas coinciden).
 */

import { FileDown, Layers, Pencil, Plus, Printer, Trash2 } from "@buleje/design-system/icons";
import { useId } from "react";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PERFIL_OFICINA_ID } from "@/lib/forestal/gtf-salida-tipos";
import { Btn, I } from "./ctp-shared";
import { BotonIcono, Casilla, NumeroMm } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { EstadoPerfilesTalonario, useSalidaTalonario } from "./hooks/use-gtf-matricial-perfiles";

const SELECT = I.replace("h-11", "h-12");
/** Escala en %, con una décima: 100,4 % = el papel sale 0,4 % más largo. */
const aPct = (v: number): number => Math.round(v * 1000) / 10;
const dePct = (v: number): number => Math.round(v * 100) / 10000;

/** «cruces» = la cuadrícula para medir con regla; «blanca» = el formato + valores + cruces en papel blanco. */
export type TipoPrueba = "cruces" | "blanca";

export default function ImpresoraTalonario({
  t,
  imp,
  salida,
  conValores,
  setConValores,
  onPrueba,
}: {
  t: EstadoGtfMatricial;
  imp: EstadoPerfilesTalonario;
  salida: ReturnType<typeof useSalidaTalonario>;
  conValores: boolean;
  setConValores: (v: boolean) => void;
  onPrueba: (tipo?: TipoPrueba) => void;
}) {
  const id = useId();
  const { prompt, confirm } = useConfirm();
  const hoja = t.hoja;
  if (!hoja) return null;
  const p = imp.elegido;
  const oficina = !p || p.id === PERFIL_OFICINA_ID;
  const lista = imp.perfiles.length ? imp.perfiles : [{ id: PERFIL_OFICINA_ID, nombre: "Oficina" }];

  const agregar = async () => {
    const nombre = await prompt({ title: "Agregar impresora", label: "Nombre", placeholder: "Monte – Epson LX-350", required: true });
    if (nombre?.trim()) await imp.agregar(nombre.trim());
  };
  const renombrar = async () => {
    if (!p) return;
    const nombre = await prompt({ title: "Renombrar impresora", label: "Nombre", defaultValue: p.nombre, required: true });
    if (nombre?.trim() && nombre.trim() !== p.nombre) await imp.renombrar(p.id, nombre.trim());
  };
  const borrar = async () => {
    if (!p || oficina) return;
    const ok = await confirm({ title: `¿Borrar «${p.nombre}»?`, description: "Se pierde su calibración; Oficina queda.", intent: "danger", confirmLabel: "Sí, borrar" });
    if (ok) await imp.borrar(p.id);
  };
  /* Lo que falla al bajar se ve en el pie del modal (vale también para la guía). */
  const aviso = imp.error;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-semibold text-[var(--text-secondary)]">
          Impresora{imp.guardando ? " · guardando…" : ""}
        </label>
        <div className="flex items-center gap-1">
          <select id={id} className={`${SELECT} min-w-0 flex-1`} value={p?.id ?? PERFIL_OFICINA_ID} disabled={imp.ocupado} onChange={(e) => imp.elegir(e.target.value)}>
            {lista.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
          <BotonIcono icon={Plus} label="Agregar impresora" ayuda="Por ejemplo, la matricial del monte." onClick={() => void agregar()} disabled={imp.ocupado} />
          <BotonIcono icon={Pencil} label="Renombrar impresora" onClick={() => void renombrar()} disabled={imp.ocupado || !p} />
          <BotonIcono icon={Trash2} label="Borrar impresora" ayuda={oficina ? "Oficina no se borra." : undefined} onClick={() => void borrar()} disabled={imp.ocupado || oficina} />
        </div>
      </div>

      {oficina || !p ? (
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="Corrimiento X" value={hoja.offsetXMm} min={-50} max={50} onChange={(offsetXMm) => t.cambiarHoja({ offsetXMm })} />
          <NumeroMm label="Corrimiento Y" value={hoja.offsetYMm} min={-50} max={50} onChange={(offsetYMm) => t.cambiarHoja({ offsetYMm })} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="Corrimiento X" value={p.corrimientoXmm} min={-50} max={50} onChange={(corrimientoXmm) => imp.calibrar(p.id, { corrimientoXmm })} />
          <NumeroMm label="Corrimiento Y" value={p.corrimientoYmm} min={-50} max={50} onChange={(corrimientoYmm) => imp.calibrar(p.id, { corrimientoYmm })} />
          <NumeroMm label="Escala X" sufijo="%" paso={0.1} value={aPct(p.escalaX)} min={90} max={110} onChange={(v) => imp.calibrar(p.id, { escalaX: dePct(v) })} />
          <NumeroMm label="Escala Y" sufijo="%" paso={0.1} value={aPct(p.escalaY)} min={90} max={110} onChange={(v) => imp.calibrar(p.id, { escalaY: dePct(v) })} />
        </div>
      )}

      <Casilla label="Con los valores de esta guía" checked={conValores} onChange={setConValores} />
      <div className="flex items-center gap-1">
        <Btn variant="secondary" className="min-h-12 flex-1" onClick={() => onPrueba("cruces")}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir prueba
        </Btn>
        <ActionMenu
          label="Bajar la prueba"
          soloIcono
          icon={FileDown}
          actions={[
            { id: "pdf", label: "PDF a tamaño real", hint: "Para imprimirla desde otro equipo", icon: FileDown, busy: salida.bajando === "pdf", onSelect: () => void salida.bajar("pdf", { valores: conValores }) },
            { id: "escp", label: "ESC/P para la matricial (.prn)", hint: "Directo, sin el diálogo de impresión", icon: Printer, busy: salida.bajando === "escp", onSelect: () => void salida.bajar("escp", { valores: conValores }) },
          ]}
        />
        <InfoTip
          icono="ayuda"
          title="Cómo calibrar"
          what={
            <span>
              1) Mide tu talonario y ponlo en «Medida». 2) Elige la impresora, pon una hoja en la matricial e imprime la prueba.
              3) Con una regla, mide del borde del papel al centro de cada cruz: debe dar 10 mm. 4) Si da 12 mm a la izquierda,
              pon −2 en X; si da 8 mm arriba, pon +2 en Y. Si arriba da 10 y abajo 11, la escala Y va en 100,4 %.
            </span>
          }
          affects="Oficina usa el X/Y de cada hoja del talonario; las demás impresoras, el suyo para todas las guías."
          example="En el diálogo de impresión: márgenes «Ninguno», escala 100 % y sin encabezados ni pies de página."
        />
      </div>
      <div className="flex items-center gap-1">
        {/* El rótulo entero no entra en el costado a 1280 (y `* { min-width: 0 }` encoge el botón): parte en dos renglones. */}
        <Btn variant="secondary" className="min-h-12 flex-1 whitespace-normal! leading-tight" onClick={() => onPrueba("blanca")} data-qa="prueba-papel-blanco">
          <Layers className="h-4 w-4 shrink-0" aria-hidden />
          <span>Hoja de prueba en papel blanco</span>
        </Btn>
        <InfoTip
          icono="ayuda"
          title="Hoja de prueba en papel blanco"
          what="Imprime en una hoja blanca el formato del talonario en rayas finas grises, los valores de esta hoja y las cruces de las esquinas, con la impresora elegida."
          affects="Ponla encima del talonario contra una ventana: si las rayas grises caen sobre las celestes, la medida y la impresora están bien. Si no, corrige «Medida» o el corrimiento y la escala de arriba."
          example="Si todo cae 2 mm a la derecha, pon −2 en Corrimiento X; si arriba coincide y abajo se pasa 1 mm, baja la escala Y a 99,6 %."
        />
      </div>
      {aviso && <span className="text-sm font-semibold text-[var(--data-warning-ink)]">{aviso}</span>}
    </div>
  );
}
