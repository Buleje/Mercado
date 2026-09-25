"use client";

/**
 * Apartar madera: reservarla para alguien, con plazo.
 *
 * ## El hueco que tapa
 *
 * En el libro real de Blas, **9 de 14 corridas** salieron del stock por «marcar
 * como usado» —sin guía y sin cliente— y entre que el operador tilda los
 * paquetes y registra la GTF no existía ningún estado: nada impedía que otro
 * despachara los mismos paquetes.
 *
 * Apartar **no saca la madera del patio**: sigue disponible, sigue contando en
 * los m³ y sigue apareciendo en Productos disponibles. Sólo dice que está
 * comprometida, para quién y hasta cuándo. Lo contrario de «marcar como usado»,
 * que sí la esconde.
 *
 * El destinatario es texto libre porque todavía no está enlazado al directorio
 * forestal; el `<datalist>` ofrece los ya usados y el formulario lo dice en vez
 * de esconderlo. Y con varias filas tildadas se llama al API una vez por fila:
 * si 1 de 3 rebota (ya estaba apartada), se dice cuál y por qué — eso no es
 * «listo» ni tira abajo las otras dos.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Loader2, Unlock } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { limaDateKey } from "@/lib/utils";
import { Btn, I, ModalBody, ModalFooter } from "./ctp-shared";
import {
  diaConNombre,
  plazoDeApartado,
  sumarDias,
  type ApartadoDeFila,
} from "./ctp-celda-apartado";
import { contarFilas, resumirFilas, useApartado, type FilaAApartar } from "./hooks/use-apartado";
import { formatNumber } from "@/lib/format";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";

/* Los pedidos al API, la cuenta de «entraron 2 de 3» y el resumen de lo elegido
   viven con el tipo de la fila, en el hook. */
export type { FilaAApartar };

export interface CtpApartarModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Las filas a apartar: sirve para UNA fila o para la selección múltiple. */
  filas: readonly FilaAApartar[];
  /** Un apartado ya vivo, cuando se abre para cambiarlo o liberarlo. */
  apartadoActual?: ApartadoDeFila | null;
  /**
   * Los nombres para los que YA se apartó algo en esta pantalla: van como
   * `<datalist>` del campo. Sin ellos el campo funciona igual (texto libre).
   */
  destinatariosConocidos?: readonly string[];
  /**
   * Recargar la tabla y mostrar arriba el resumen de lo que pasó.
   *
   * **Nunca con un mensaje de éxito si algo falló**: con una fila rechazada el
   * modal se queda abierto diciendo cuál, y el aviso —que dice «2 de 3»— se
   * manda recién al cerrar, para que la tabla no quede con datos viejos.
   */
  onListo: (mensaje: string) => void;
  /** El «hoy» del plazo. Por defecto el reloj; se pasa para poder probarlo. */
  ahora?: Date;
}

const nf = (n: number) => formatNumber(n);

/** Etiqueta + campo + pie de ayuda, la misma forma en los tres campos. */
function Campo({
  id,
  label,
  hint,
  malo,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  malo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
      <p
        className={`mt-1 text-sm ${malo ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"}`}
      >
        {hint}
      </p>
    </div>
  );
}

/* El contenido va aparte y sólo se monta cuando está abierto: así cada apertura
   arranca en blanco (un `hasta` tipeado y descartado no reaparece en la fila
   siguiente). */
export default function CtpApartarModal(props: CtpApartarModalProps) {
  if (!props.abierto) return null;
  return <Contenido {...props} />;
}

function Contenido({
  onCerrar,
  filas,
  apartadoActual,
  destinatariosConocidos = [],
  onListo,
  ahora,
}: CtpApartarModalProps) {
  const hoy = limaDateKey(ahora ?? new Date());
  const [para, setPara] = useState(apartadoActual?.para ?? "");
  const [hasta, setHasta] = useState(apartadoActual?.hasta?.slice(0, 10) ?? "");
  const [nota, setNota] = useState(apartadoActual?.nota ?? "");
  const [motivo, setMotivo] = useState("");
  const { enviando, error, setError, fallos, apartar, liberar, cambiar } = useApartado();
  /* Lo que entró mientras otra fila rebotaba: la tabla tiene que enterarse, pero
     no con un «listo» —falló algo— ni mientras el modal sigue mostrando cuál. */
  const pendiente = useRef<string | null>(null);

  /* Foco en «Para quién» sin `autoFocus` (jsx-a11y/no-autofocus): el contenido de
     AdminModal se monta en un portal DESPUÉS de este efecto y enfoca la X; en el
     cuadro siguiente ya está montado y el campo se queda el foco. */
  const paraRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => paraRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const resumen = useMemo(() => resumirFilas(filas), [filas]);
  const plazo = hasta ? plazoDeApartado(hasta, ahora) : null;
  const vencido = plazo?.estado === "vencido";
  /* El servidor sólo deja escribir a admin/dueño (el MISMO array del PATCH): el
     almacenero abre la reserva para verla, no para recibir un 403 al guardar. */
  const rol = useMiRol();
  const puedeEscribir = puedePedir("PATCH /api/admin/forestal/ctp", rol);
  const puedeGuardar =
    puedeEscribir && para.trim().length > 0 && !vencido && filas.length > 0 && !enviando;

  /** Al cerrar se avisa lo que quedó a medias, para que la tabla no mienta. */
  function cerrar() {
    /* En medio del envío no se cierra: Escape y el clic fuera son gestos baratos
       y el pedido de la fila 2 de 3 seguiría vivo con el modal desmontado. */
    if (enviando) return;
    if (pendiente.current) {
      onListo(pendiente.current);
      pendiente.current = null;
    }
    onCerrar();
  }

  async function guardar() {
    if (!para.trim()) return setError("Pon para quién se aparta esta madera.");
    if (vencido)
      return setError("El plazo ya pasó. Elige una fecha de hoy en adelante o déjalo sin plazo.");
    const quien = para.trim();
    const plazoTexto = hasta ? `hasta el ${diaConNombre(hasta)}` : "sin plazo";
    /* Una reserva viva se CAMBIA, no se vuelve a apartar: el servidor rechaza
       apartar una fila que ya tiene dueño, y hasta el 2026-09-23 «Guardar
       cambios» respondía «ya está apartada» sin cambiar nada. */
    if (apartadoActual) {
      const cambio = await cambiar(apartadoActual.id, {
        para: quien,
        hasta: hasta || null,
        nota: nota.trim() || null,
      });
      if (cambio) {
        pendiente.current = null;
        onListo(`Apartado actualizado: ahora es de ${quien}, ${plazoTexto}.`);
        onCerrar();
      }
      return;
    }
    const entraron = await apartar(filas, {
      para: quien,
      hasta: hasta || null,
      nota: nota.trim() || null,
    });
    if (entraron === filas.length) {
      const c = contarFilas(filas);
      pendiente.current = null;
      onListo(
        `${c.texto} apartad${c.genero}${filas.length === 1 ? "" : "s"} para ${quien}, ${plazoTexto}.`,
      );
      onCerrar();
      return;
    }
    // Entró algo pero no todo: el aviso sale al cerrar, y dice la verdad.
    if (entraron > 0) {
      pendiente.current = `Se apartaron ${nf(entraron)} de ${nf(filas.length)} para ${quien}; el resto quedó como estaba.`;
    }
  }

  async function soltar() {
    if (!apartadoActual) return;
    if (await liberar(apartadoActual.id, motivo.trim() || null)) {
      pendiente.current = null;
      onListo(`Apartado liberado: la madera de ${apartadoActual.para} vuelve a estar libre.`);
      onCerrar();
    }
  }

  return (
    <AdminModal
      open
      onClose={cerrar}
      /* Se abre desde la tabla y también desde la ficha del paquete, que ya es un
         modal: sin esto queda detrás y los clics no llegan. */
      aboveModals
      variant="default"
      icon={apartadoActual ? Bookmark : BookmarkPlus}
      title={apartadoActual ? "Apartado de esta madera" : "Apartar madera"}
      description="Queda reservada para alguien, con plazo. No sale del patio: sigue disponible y sigue contando en los m³."
      footer={
        /* La nota NO repite el resumen: ya está arriba, y en 400 px decirlo dos
           veces empuja los botones fuera de la vista. */
        <ModalFooter
          error={error}
          nota={
            rol != null && !puedeEscribir
              ? "Apartar, cambiar o liberar lo hace el dueño o el administrador."
              : apartadoActual
                ? "Guardar cambia a quién y hasta cuándo."
                : null
          }
        >
          <Btn onClick={cerrar} disabled={enviando !== null}>
            Cancelar
          </Btn>
          {puedeEscribir && (
            <Btn variant="primary" disabled={!puedeGuardar} onClick={() => void guardar()}>
              {enviando === "apartar" || enviando === "cambiar" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <BookmarkPlus className="h-4 w-4" aria-hidden />
              )}
              {apartadoActual
                ? "Guardar cambios"
                : `Apartar${filas.length > 1 ? ` ${nf(filas.length)}` : ""}`}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-4">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5">
          <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {resumen}
          </p>
          <p
            className="mt-1 line-clamp-2 text-xs text-[var(--text-tertiary)]"
            title={filas.map((f) => f.etiqueta).join(" · ")}
          >
            {filas.map((f) => f.etiqueta).join(" · ") || "Elige al menos una fila de la tabla."}
          </p>
        </div>

        {apartadoActual && (
          /* Color con alpha sobre la superficie, no `--accent-soft`: ese token
             es un menta claro fijo y en oscuro dejaba texto blanco sobre claro. */
          <p className="rounded-xl border-l-4 border-[var(--data-info-500)] bg-[var(--data-info-500)]/12 px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
            Hoy la tiene <strong>{apartadoActual.para}</strong>
            {apartadoActual.creadoAt ? `, desde el ${diaConNombre(apartadoActual.creadoAt)}` : ""}
            {apartadoActual.hasta
              ? ` · ${plazoDeApartado(apartadoActual.hasta, ahora).texto}`
              : " · sin plazo"}
            .
          </p>
        )}

        {/* Sin permiso de escritura los campos se leen pero no se tocan: el
            `fieldset` apaga inputs y atajos de una vez. */}
        <fieldset disabled={!puedeEscribir} className="min-w-0 space-y-4">
        <Campo
          id="apartar-para"
          label="Para quién"
          hint={`Se escribe a mano: todavía no está enlazado al directorio de clientes, así que «Maderera X» y «maderera x» quedan como dos.${destinatariosConocidos.length ? " Elige uno de la lista para no duplicar." : ""}`}
        >
          <input
            id="apartar-para"
            ref={paraRef}
            list={destinatariosConocidos.length ? "apartar-destinatarios" : undefined}
            value={para}
            onChange={(e) => setPara(e.target.value)}
            maxLength={120}
            placeholder="Ej.: Maderera Ucayali S.A.C."
            className={I}
          />
          {destinatariosConocidos.length > 0 && (
            <datalist id="apartar-destinatarios">
              {destinatariosConocidos.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          )}
        </Campo>

        <Campo
          id="apartar-hasta"
          label="Hasta (opcional)"
          malo={vencido}
          hint={
            vencido
              ? "Esa fecha ya pasó. Elige una de hoy en adelante o deja el apartado sin plazo."
              : hasta
                ? `Vence el ${diaConNombre(hasta)}${plazo?.estado === "vigente" ? "" : ` — ${plazo?.texto}`}. Al vencer no se libera sola: queda marcada en rojo para que alguien la suelte.`
                : "Sin plazo la reserva no vence nunca; ponle uno para que no congele madera en silencio."
          }
        >
          {/* En 400 px la fecha va sola y los atajos debajo: en una sola fila el
              `<input type=date>` quedaba de 90 px y no se leía ni el día. Los
              atajos son `md` (44 px) porque se tocan con el dedo en el patio. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="apartar-hasta"
              type="date"
              value={hasta}
              min={hoy}
              onChange={(e) => setHasta(e.target.value)}
              className={`${I} font-mono tabular-nums sm:w-auto sm:min-w-[10rem] sm:flex-1`}
            />
            <div className="flex flex-wrap gap-1.5">
              <Btn onClick={() => setHasta(sumarDias(hoy, 3))}>3 días</Btn>
              <Btn onClick={() => setHasta(sumarDias(hoy, 7))}>1 semana</Btn>
              <Btn onClick={() => setHasta("")}>Sin plazo</Btn>
            </div>
          </div>
        </Campo>

        <Campo
          id="apartar-nota"
          label="Nota (opcional)"
          hint={`${nota.length}/300 · queda en el historial del apartado.`}
        >
          <textarea
            id="apartar-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 300))}
            rows={2}
            maxLength={300}
            placeholder="Ej.: adelantó el 50 %, pasa a recoger el viernes."
            className="w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </Campo>
        </fieldset>

        {fallos.length > 0 && (
          <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {nf(fallos.length)} {fallos.length === 1 ? "fila quedó" : "filas quedaron"} sin
              apartar:
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-[var(--text-secondary)]">
              {fallos.map((f, i) => (
                <li key={`${f.etiqueta}-${i}`}>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {f.etiqueta}
                  </span>
                  : {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {apartadoActual && puedeEscribir && (
          /* Liberar vive acá abajo y no en el pie: en 400 px tres botones al pie
             se apilan y el destructivo termina pegado al de guardar. */
          <div className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/8 p-3">
            <p className="text-sm font-bold text-[var(--text-primary)]">Liberar el apartado</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              La madera deja de estar comprometida y vuelve a quedar libre para cualquiera. El saldo
              no se toca.
            </p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
              aria-label="Motivo de la liberación (opcional)"
              placeholder="Motivo (opcional): el cliente no vino, se vendió a otro…"
              className={`${I} mt-2`}
            />
            <Btn
              variant="danger"
              className="mt-2"
              disabled={enviando !== null}
              onClick={() => void soltar()}
            >
              {enviando === "liberar" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Unlock className="h-4 w-4" aria-hidden />
              )}
              Liberar apartado
            </Btn>
          </div>
        )}
      </ModalBody>
    </AdminModal>
  );
}
