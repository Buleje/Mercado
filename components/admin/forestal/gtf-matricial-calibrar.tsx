"use client";

/**
 * «Calibrar con regla» (16-10, Brandon): en vez de tantear corrimiento y
 * escala, tres pasos. 1) Imprimir la hoja de cruces con la impresora elegida.
 * 2) Medir con regla, desde el borde izquierdo y el de arriba del papel, el
 * centro de la cruz de arriba a la izquierda y el de la de abajo a la derecha.
 * 3) Ver qué hace la impresora («corre todo 2,5 mm a la derecha; estira 0,8 %
 * a lo ancho») y aplicarlo al perfil, con deshacer.
 *
 * La cuenta es `calcularCalibracion` (pura y probada); el estado,
 * `useCalibrarConRegla`. Se abre DESDE el modal del talonario: `aboveModals`.
 */

import { AlertTriangle, CheckCircle2, FileDown, Printer, Ruler, Undo2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { ReactNode } from "react";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { crucesEsperadas, fmt1, fraseImpresora, pct1, rotuloAjuste, type AjusteImpresora, type CampoMedida } from "@/lib/forestal/gtf-matricial-calibrar";
import { PERFIL_OFICINA_ID } from "@/lib/forestal/gtf-salida-tipos";
import { Btn } from "./ctp-shared";
import { DibujoCruces, MedidaMm } from "./gtf-matricial-calibrar-dibujo";
import type { EstadoCalibrarConRegla, useSalidaTalonario } from "./hooks/use-gtf-matricial-perfiles";

/** «Bajar la prueba» en PDF o ESC/P (lo usan este asistente y el panel de la impresora). */
export function accionesBajarPrueba(salida: ReturnType<typeof useSalidaTalonario>, valores: boolean): MenuAccion[] {
  return [
    { id: "pdf", label: "PDF a tamaño real", hint: "Para imprimirla desde otro equipo", icon: FileDown, busy: salida.bajando === "pdf", onSelect: () => void salida.bajar("pdf", { valores }) },
    { id: "escp", label: "ESC/P para la matricial (.prn)", hint: "Directo, sin el diálogo de impresión", icon: Printer, busy: salida.bajando === "escp", onSelect: () => void salida.bajar("escp", { valores }) },
  ];
}

const FILAS: ReadonlyArray<[string, (a: AjusteImpresora) => string]> = [
  ["Corrimiento X", (a) => `${fmt1(a.dx)} mm`],
  ["Corrimiento Y", (a) => `${fmt1(a.dy)} mm`],
  ["Escala X", (a) => pct1(a.sx)],
  ["Escala Y", (a) => pct1(a.sy)],
];

function Paso({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-extrabold text-[var(--accent-ink)]">
          {n}
        </span>
        <CardTitle className="min-w-0 flex-1">{titulo}</CardTitle>
        {ayuda}
      </div>
      {children}
    </section>
  );
}

/** Antes → queda, con lo que cambia en negrita. */
function AntesYDespues({ antes, despues }: { antes: AjusteImpresora; despues: AjusteImpresora }) {
  return (
    <dl className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm tabular-nums">
      <span />
      <span className="text-right text-xs font-semibold text-[var(--text-tertiary)]">Ahora</span>
      <span className="text-right text-xs font-semibold text-[var(--text-tertiary)]">Queda</span>
      {FILAS.map(([label, f]) => {
        const cambia = f(antes) !== f(despues);
        return (
          <div key={label} className="contents">
            <dt className="text-[var(--text-secondary)]">{label}</dt>
            <dd className="text-right text-[var(--text-secondary)]">{f(antes)}</dd>
            <dd className={`text-right ${cambia ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{f(despues)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Resultado({ c }: { c: EstadoCalibrarConRegla }) {
  const r = c.resultado;
  if (!r && c.aplicado) {
    const oficina = c.aplicado.perfilId === PERFIL_OFICINA_ID;
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--accent-soft)] px-3 py-2 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden />
        <span className="min-w-0 flex-1 text-[var(--text-primary)]">
          <b>{c.aplicado.nombre}</b> quedó en {rotuloAjuste(c.aplicado.despues)}. Imprime otra prueba para comprobar
          {oficina ? "; el corrimiento se guarda con la hoja («Guardar»)." : "."}
        </span>
        <Btn variant="ghost" className="min-h-12 shrink-0" onClick={c.deshacer} data-qa="calibrar-deshacer">
          <Undo2 className="h-4 w-4" aria-hidden /> Deshacer
        </Btn>
      </div>
    );
  }
  if (!r || !c.actual) return <span className="text-sm text-[var(--text-tertiary)]">Escribe las 4 medidas: el resultado sale solo.</span>;
  if (!r.ok) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-ink)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0">{r.mensaje}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-semibold text-[var(--text-primary)]" data-qa="calibrar-frase">
        {fraseImpresora(r.impresora)}
      </span>
      {r.sinCambio ? (
        <span className="text-sm text-[var(--text-secondary)]">Ya está calibrada: no hay nada que cambiar.</span>
      ) : (
        <AntesYDespues antes={c.actual} despues={r.nuevo} />
      )}
    </div>
  );
}

export default function CalibrarConRegla({
  c,
  salida,
  onImprimir,
}: {
  c: EstadoCalibrarConRegla;
  salida: ReturnType<typeof useSalidaTalonario>;
  onImprimir: () => void;
}) {
  if (!c.abierto || !c.hoja || !c.actual) return null;
  const esperadas = crucesEsperadas(c.hoja);
  const deberia: Record<CampoMedida, number> = {
    "arribaIzq.x": esperadas.arribaIzq.x,
    "arribaIzq.y": esperadas.arribaIzq.y,
    "abajoDer.x": esperadas.abajoDer.x,
    "abajoDer.y": esperadas.abajoDer.y,
  };
  const r = c.resultado;
  const campoMalo = r && !r.ok ? r.campo : null;
  const oficina = c.perfilId === PERFIL_OFICINA_ID;
  const medida = (campo: CampoMedida, label: string) => (
    <MedidaMm campo={campo} label={label} value={c.medidas[campo]} onChange={(v) => c.medir(campo, v)} deberia={fmt1(deberia[campo])} invalido={campoMalo === campo} />
  );
  const cruz = (titulo: string, x: CampoMedida, y: CampoMedida) => (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm font-bold text-[var(--text-primary)]">{titulo}</legend>
      <div className="grid grid-cols-2 gap-2">
        {medida(x, "Desde la izquierda")}
        {medida(y, "Desde arriba")}
      </div>
    </fieldset>
  );

  return (
    <AdminModal
      open
      onClose={c.cerrar}
      aboveModals
      size="md"
      claveVentana="gtf-calibrar-con-regla"
      icon={Ruler}
      title={`Calibrar con regla · ${c.nombre}`}
      description="Mide dos cruces: el ajuste sale solo"
      footer={
        <ModalFooter>
          <Btn variant="secondary" onClick={c.cerrar}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={c.aplicar} disabled={!r?.ok || r.sinCambio} data-qa="calibrar-aplicar">
            Aplicar a {c.nombre}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} flex flex-col gap-5`}>
        <Paso
          n={1}
          titulo="Imprime la hoja de cruces"
          ayuda={
            <InfoTip
              icono="ayuda"
              title="La hoja de cruces"
              what={`Una cruz a ${fmt1(esperadas.arribaIzq.x)} mm de cada esquina; abajo dice con qué corrimiento y escala salió.`}
              affects="Mide la hoja que salió con los valores de abajo: si la imprimiste antes con otros, imprime otra."
              example="En el diálogo de impresión: márgenes «Ninguno», escala 100 % y sin encabezados."
            />
          }
        >
          <div className="flex items-center gap-1">
            <Btn variant="secondary" className="min-h-12 flex-1" onClick={onImprimir} data-qa="calibrar-imprimir">
              <Printer className="h-4 w-4" aria-hidden /> Imprimir la prueba
            </Btn>
            <ActionMenu label="Bajar la prueba" soloIcono icon={FileDown} actions={accionesBajarPrueba(salida, false)} />
          </div>
          <span className="text-sm text-[var(--text-secondary)]">
            Sale con {c.nombre}: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{rotuloAjuste(c.actual)}</span>
          </span>
        </Paso>

        <Paso
          n={2}
          titulo="Mide dos cruces con regla"
          ayuda={
            <InfoTip
              icono="ayuda"
              title="Qué medir"
              what="Del borde del papel al centro del circulito de cada cruz: A y C desde el borde izquierdo, B y D desde el borde de arriba."
              affects="Siempre desde esos dos bordes, también para la cruz de abajo a la derecha (es la medida larga)."
              example={`Si la hoja salió perfecta: A ${fmt1(deberia["arribaIzq.x"])}, B ${fmt1(deberia["arribaIzq.y"])}, C ${fmt1(deberia["abajoDer.x"])}, D ${fmt1(deberia["abajoDer.y"])} mm.`}
            />
          }
        >
          <div className="grid items-center gap-3 sm:grid-cols-[8rem_1fr]">
            <DibujoCruces />
            <div className="flex min-w-0 flex-col gap-3">
              {cruz("Cruz de arriba a la izquierda", "arribaIzq.x", "arribaIzq.y")}
              {cruz("Cruz de abajo a la derecha", "abajoDer.x", "abajoDer.y")}
            </div>
          </div>
        </Paso>

        <Paso
          n={3}
          titulo="Resultado"
          ayuda={
            <InfoTip
              icono="ayuda"
              title="Cómo se calcula"
              what="Compara dónde cayó cada cruz con dónde se la mandó y despeja cuánto corre y cuánto estira la impresora; el perfil nuevo lo compensa (redondeado a 0,1 mm y 0,1 %)."
              affects={
                oficina
                  ? "Oficina: el corrimiento va al X/Y de esta hoja del talonario (se guarda con «Guardar») y la escala, a la impresora."
                  : "Vale para todo lo que salga por esta impresora: el navegador, el PDF y el ESC/P."
              }
              example="Si la cruz cayó 2,5 mm a la derecha, el corrimiento X baja 2,5."
            />
          }
        >
          <div aria-live="polite">
            <Resultado c={c} />
          </div>
        </Paso>
      </div>
    </AdminModal>
  );
}
