"use client";

/**
 * CtpParteModal — alta y edición de una parte del directorio forestal (ADR-317).
 *
 * El formulario largo (todos los campos, todos los roles) vive acá; la guía usa
 * la barra rápida. Lo que hace útil a este modal es el botón de padrón: se tipea
 * el RUC y SUNAT devuelve razón social y domicilio fiscal — que es exactamente
 * lo que va en la guía y lo que nadie recuerda de memoria.
 *
 * Por pasos (24-10, el mismo patrón que el alta del plan): una barra arriba con
 * el estado de cada paso y un paso a la vista. Los ocultos siguen montados
 * —`hidden`, no desmontados— para que lo cargado en uno (un permiso, un precio,
 * un vínculo todavía sin guardar) no se pierda al pasar al otro. «Guardar» va
 * siempre en el pie: se guarda desde cualquier paso.
 *
 * El estado vive en `hooks/use-parte-form`; cada paso en `ctp-parte-paso-*`;
 * qué pendiente va a qué paso, en `lib/forestal/directorio-pasos`.
 */

import { Loader2, Save, Users } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { AnteriorSiguiente, BarraDePasos } from "@/components/admin/shared/barra-de-pasos";
import { ROL_LABEL, type Parte, type RolParte, type Vehiculo } from "@/lib/forestal/directorio";
import { Btn, FormularioClaro, ModalBody, ModalFooter } from "./ctp-shared";
import { useParteForm, type BorradorDeParte } from "./hooks/use-parte-form";
import { ResumenDeSalud } from "./ctp-parte-salud";
import CtpPartePasoQuien from "./ctp-parte-paso-quien";
import CtpPartePasoPapel from "./ctp-parte-paso-papel";
import CtpPartePasoDonde from "./ctp-parte-paso-donde";
import CtpPartePasoPago from "./ctp-parte-paso-pago";
import CtpPartePasoPapeles from "./ctp-parte-paso-papeles";

/** Sin vehículos que listar: un arreglo fijo, para no estrenar uno en cada render. */
const SIN_VEHICULOS: readonly Vehiculo[] = [];
const SIN_PARTES: Parte[] = [];

export default function CtpParteModal({
  parte,
  rolInicial,
  existentes = SIN_PARTES,
  vehiculos: vehiculosDeLaLibreta = SIN_VEHICULOS,
  onUsarExistente,
  onGuardar,
  onClose,
  aboveModals = false,
  desdeOtroFormulario = false,
}: {
  /** `null` = alta. */
  parte: Parte | null;
  rolInicial: RolParte;
  /** La libreta de vehículos ya cargada, para listar los de este transportista. */
  vehiculos?: readonly Vehiculo[];
  /**
   * Resolver el duplicado en un clic: el aviso de «ficha parecida» deja de ser
   * sólo una advertencia y pasa a ofrecer la existente. Sin esto, evitar el
   * duplicado costaba cancelar, reabrir el picker y buscarla a mano.
   */
  onUsarExistente?: (p: Parte) => void;
  /** El resto de la libreta — para avisar si el documento ya es de otra ficha
   *  (el problema #1 que este módulo existe para evitar: "MADERERA DEL
   *  ORIENTE SAC" y "Maderera del Oriente" como dos filas distintas). */
  existentes?: Parte[];
  /**
   * Guarda y **devuelve la ficha guardada**: el modal la necesita para colgarle
   * los permisos que se cargaron durante el alta, cuando todavía no había id
   * (ADR-425). El padre ya no cierra el modal — lo cierra él mismo cuando
   * terminó de guardar todo.
   */
  onGuardar: (input: BorradorDeParte) => Promise<Parte | void>;
  onClose: () => void;
  /**
   * Se abre ENCIMA de otro modal: «Crear cuenta nueva» desde «Declarar
   * producción» (ADR-429). Sin esto se monta detrás y Radix apaga los clics de
   * toda la página (ver `AdminModal`).
   */
  aboveModals?: boolean;
  /**
   * Se abre desde el selector de otro formulario (una guía, el alta del plan):
   * la ficha no ofrece ir al Libro TH, que dejaría ese formulario a medias.
   */
  desdeOtroFormulario?: boolean;
}) {
  const form = useParteForm({
    parte,
    rolInicial,
    existentes,
    vehiculos: vehiculosDeLaLibreta,
    onGuardar,
    onClose,
    anidada: aboveModals || desdeOtroFormulario,
  });
  const { b, error, aviso, coincide, coincideBloquea, dandoDeBaja, estado, cerrar, pasos, paso, setPaso, hayPapel } = form;

  return (
    <AdminModal
      open
      onClose={cerrar}
      aboveModals={aboveModals}
      title={parte ? `Editar ${parte.nombre}` : "Agregar al directorio"}
      description={b.roles.map((r) => ROL_LABEL[r]).join(" · ")}
      icon={Users}
      variant="info"
      footer={
        <ModalFooter
          error={error}
          aviso={aviso}
          nota={coincide && !coincideBloquea ? `Ese documento ya es de ${coincide.nombre} — al guardar se combina con esa ficha, no se crea una nueva.` : undefined}
          atajo
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="primary" disabled={estado === "guardando" || (coincideBloquea && !dandoDeBaja)} onClick={() => void form.guardar()}>
            {estado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      {/* Estilo claro (26-10): cada campo con su ⓘ —qué poner, un ejemplo y
          para qué sirve— en vez de la ayuda en letra chica debajo. */}
      <FormularioClaro>
      <ModalBody ref={form.bodyRef}>
        {/* Primera hija del cuerpo: así queda pegada arriba mientras se baja. */}
        <BarraDePasos etiqueta="Pasos de la ficha" borde="modal" pasos={pasos} actual={paso} onIr={setPaso} />
        {/* Cuánto le falta a la ficha entera, en una línea: el detalle de qué
            falta va dentro de cada paso, al lado del campo. */}
        <ResumenDeSalud listo={form.listo} cuantos={form.pendientes.length} />

        <div data-paso="quien" hidden={paso !== "quien"} className="mt-4">
          <CtpPartePasoQuien form={form} onUsarExistente={onUsarExistente} />
        </div>
        {hayPapel && (
          <div data-paso="papel" hidden={paso !== "papel"} className="mt-4">
            <CtpPartePasoPapel form={form} />
          </div>
        )}
        <div data-paso="donde" hidden={paso !== "donde"} className="mt-4">
          <CtpPartePasoDonde form={form} />
        </div>
        <div data-paso="pago" hidden={paso !== "pago"} className="mt-4">
          <CtpPartePasoPago form={form} />
        </div>
        <div data-paso="papeles" hidden={paso !== "papeles"} className="mt-4">
          <CtpPartePasoPapeles form={form} />
        </div>

        <AnteriorSiguiente pasos={pasos} actual={paso} onIr={setPaso} />
      </ModalBody>
      </FormularioClaro>
    </AdminModal>
  );
}
