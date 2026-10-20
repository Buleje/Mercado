"use client";

/**
 * ConfigAvisoModal — cuándo y cómo sale el aviso en pantalla de la agenda:
 * prendido o no, cada cuánto, en qué horario y días, a la hora de cada
 * actividad, con lo atrasado, aviso del sistema y sonido. Es de cada persona
 * (`useConfigAviso`: navegador + servidor). «Probar ahora» lo abre ya.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BellRing, Play } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { CAMPO_ALTO, claseChip } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { abrirAvisoAgenda, useConfigAviso } from "@/hooks/use-aviso-agenda";
import { AvisoPantallaSchema, CADA_MINUTOS, textoCada, type AvisoPantalla, type ModoAviso } from "@/lib/agenda/aviso-pantalla";
import { BotonesDias } from "../comun/BotonesDias";
import { SeccionCelular } from "./SeccionCelular";
import { SeccionTelegram } from "./SeccionTelegram";
import { DIAS_LARGOS, ORDEN_SEMANA } from "../comun/fechas";

const MODOS: readonly { id: ModoAviso; label: string; hint: string }[] = [
  { id: "ventana", label: "Ventana al centro", hint: "Tapa la página hasta que la cierres" },
  { id: "lateral", label: "Al costado", hint: "No tapa la página y sigue al cambiar de pestaña" },
  { id: "fija", label: "Fija al costado", hint: "Corre la página para no tapar nada y vuelve al recargar" },
];

type Cambiar = <K extends keyof AvisoPantalla>(campo: K, valor: AvisoPantalla[K]) => void;

export default function ConfigAvisoModal({ onCerrar }: { onCerrar: () => void }) {
  const { config, guardar } = useConfigAviso();
  const [b, setB] = useState<AvisoPantalla>(config);
  const [error, setError] = useState<string | null>(null);
  const tocado = useRef(false);
  const id = useId();

  /* Lo del servidor llega después de abrir: lo toma mientras no hayas cambiado nada. */
  useEffect(() => {
    if (!tocado.current) setB(config);
  }, [config]);

  const cambiar: Cambiar = (campo, valor) => {
    tocado.current = true;
    setB((x) => ({ ...x, [campo]: valor }));
    setError(null);
  };

  const validado = (): AvisoPantalla | null => {
    const r = AvisoPantallaSchema.safeParse(b);
    if (r.success) return r.data;
    setError(r.error.issues[0]?.message ?? "Revisa los datos");
    return null;
  };
  const onGuardar = () => {
    const c = validado();
    if (!c) return;
    guardar(c);
    toast.success(c.activo ? `Listo: te aviso cada ${textoCada(c.cadaMin)}` : "Aviso apagado");
    onCerrar();
  };
  const onProbar = () => {
    const c = validado();
    if (!c) return;
    guardar(c);
    onCerrar();
    abrirAvisoAgenda();
  };
  const alternarSistema = async (prender: boolean) => {
    if (!prender) return cambiar("notificacion", false);
    if (typeof Notification === "undefined") return setError("Este navegador no muestra avisos del sistema.");
    const permiso = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permiso !== "granted") return setError("El navegador bloqueó los avisos: permítelos en el candado de la barra de direcciones.");
    cambiar("notificacion", true);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Recordatorios"
      description="Cuándo y por dónde te avisa lo que falta hacer"
      icon={BellRing}
      size="md"
      footer={
        <ModalFooter error={error} nota={<Resumen c={b} />}>
          <button type="button" className={button({ variant: "secondary", className: "max-sm:w-12 max-sm:px-0" })} onClick={onProbar} title="Guardar y abrirlo ya">
            <Play className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Probar ahora</span>
          </button>
          <button type="button" className={button({ variant: "primary" })} onClick={onGuardar}>
            Guardar
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`}>
        <Opcion marcado={b.activo} onCambiar={(v) => cambiar("activo", v)} titulo="Prendido" texto="Sale solo, sin que toques nada, si te falta algo" />

        <fieldset disabled={!b.activo} className="space-y-5 disabled:opacity-60">
          <legend className="sr-only">Cuándo sale</legend>
          <div className="space-y-2">
            <span id={`${id}-cada`} className="block text-sm font-semibold text-[var(--text-secondary)]">
              Cada cuánto
            </span>
            <div role="radiogroup" aria-labelledby={`${id}-cada`} className="flex flex-wrap gap-2">
              {CADA_MINUTOS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={b.cadaMin === m} className={claseChip(b.cadaMin === m)} onClick={() => cambiar("cadaMin", m)}>
                  {textoCada(m)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span id={`${id}-modo`} className="block text-sm font-semibold text-[var(--text-secondary)]">
              Dónde sale
            </span>
            <div role="radiogroup" aria-labelledby={`${id}-modo`} className="flex flex-wrap gap-2">
              {MODOS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={b.modo === m.id} className={claseChip(b.modo === m.id)} onClick={() => cambiar("modo", m.id)} title={m.hint}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Desde" hint="Antes no sale">
              <input type="time" className={CAMPO_ALTO} value={b.desde} onChange={(e) => cambiar("desde", e.target.value)} required />
            </Field>
            <Field label="Hasta" hint="Después tampoco">
              <input type="time" className={CAMPO_ALTO} value={b.hasta} onChange={(e) => cambiar("hasta", e.target.value)} required />
            </Field>
          </div>

          <div className="space-y-2">
            <span id={`${id}-dias`} className="block text-sm font-semibold text-[var(--text-secondary)]">
              Qué días
            </span>
            <BotonesDias
              dias={b.dias}
              rotuloId={`${id}-dias`}
              onAlternar={(d) => cambiar("dias", b.dias.includes(d) ? b.dias.filter((x) => x !== d) : [...b.dias, d].sort((x, y) => x - y))}
            />
          </div>

          <div className="space-y-2">
            <Opcion marcado={b.aSuHora} onCambiar={(v) => cambiar("aSuHora", v)} titulo="También a la hora de cada actividad" texto="La de aserrío de las 17:00 sale a las 17:00" />
            <Opcion marcado={b.atrasadas} onCambiar={(v) => cambiar("atrasadas", v)} titulo="Con lo atrasado" texto="Lo que quedó sin hacer de los últimos 7 días" />
            <Opcion
              marcado={b.notificacion}
              onCambiar={(v) => void alternarSistema(v)}
              titulo="Aviso del sistema"
              texto="Te avisa aunque estés en otra ventana o con el navegador minimizado"
            />
            <Opcion marcado={b.sonido} onCambiar={(v) => cambiar("sonido", v)} titulo="Con sonido" texto="Dos notas cortas cuando sale" />
          </div>
        </fieldset>

        <SeccionCelular />
        <SeccionTelegram />
      </div>
    </AdminModal>
  );
}

function Opcion({ marcado, onCambiar, titulo, texto }: { marcado: boolean; onCambiar: (v: boolean) => void; titulo: string; texto: ReactNode }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-primary)]">
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={marcado} onChange={(e) => onCambiar(e.target.checked)} />
      <span className="min-w-0">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-[var(--text-tertiary)]">{texto}</span>
      </span>
    </label>
  );
}

/** «Cada 1 hora · lun, mar, mié, jue, vie, sáb · 07:00–20:00». */
function Resumen({ c }: { c: AvisoPantalla }) {
  if (!c.activo) return <span>Apagado: no sale solo</span>;
  const dias = ORDEN_SEMANA.filter((d) => c.dias.includes(d));
  const textoDias = dias.length === 7 ? "todos los días" : dias.map((d) => DIAS_LARGOS[d].slice(0, 3)).join(", ");
  return (
    <span>
      Cada {textoCada(c.cadaMin)} · {textoDias || "ningún día"} · {c.desde}–{c.hasta}
    </span>
  );
}
