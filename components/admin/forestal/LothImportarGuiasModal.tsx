"use client";

/**
 * «Importar guías despachadas» — Libro TH (ADR-461, Brandon 02-10-2026: «subir
 * guías o poner guías que ya se despacharon; según la guía se identifica a qué
 * permiso pertenece y se agrega a los permisos ya creados o se creará uno
 * nuevo; con el número de registro traerse las guías y su lista de trozas a la
 * sección Trozas, y en la tala lo referencial según el código de trozas»).
 *
 * Tres pasos en el mismo modal: elegir las guías (ya recibidas en el
 * aserradero · N° de registro SERFOR · foto o PDF) → vista previa por permiso
 * → resultado con enlaces. La lógica vive en `hooks/use-importar-guias.ts`; el
 * servidor arma y asienta todo (una transacción por guía).
 */

import { ArrowLeft, Eye, FileDown } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { IMPORTAR_GUIAS_MAX, IMPORTAR_SERFOR_POR_PEDIDO } from "@/lib/forestal/loth-importar-guia-tipos";
import { registrosDelTexto, type PestanaFuente } from "./hooks/importar-guias-pantalla";
import { useImportarGuias, type ImportarGuias } from "./hooks/use-importar-guias";
import LothImportarGuiasRecibidas from "./LothImportarGuiasRecibidas";
import LothImportarGuiasRegistros from "./LothImportarGuiasRegistros";
import LothImportarGuiasFoto from "./LothImportarGuiasFoto";
import LothImportarGuiasVista from "./LothImportarGuiasVista";
import LothImportarGuiasResultado from "./LothImportarGuiasResultado";
import { Btn } from "./ctp-shared";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function LothImportarGuiasModal({
  onClose,
  onImportadas,
  onVerGuia,
  onVerPermiso,
}: {
  onClose: () => void;
  /** Entró algo al libro: recargarlo. */
  onImportadas: () => void;
  onVerGuia: (gtfNumber: string) => void;
  /** El plan al que fue la guía (lo abre el libro en el Control del permiso). */
  onVerPermiso: (planId: string) => void;
}) {
  const s = useImportarGuias({ onImportadas });

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      title="Importar guías despachadas"
      description="Libro TH · las guías que ya salieron, con sus trozas, su tala referencial y su permiso"
      icon={FileDown}
      className="sm:w-[min(96vw,76rem)] sm:max-w-none sm:max-h-[95vh]"
      footer={<Pie s={s} onClose={onClose} />}
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {s.fase === "elegir" && <Elegir s={s} />}
        {s.fase === "vista" && <LothImportarGuiasVista s={s} />}
        {s.fase === "resultado" && (
          <LothImportarGuiasResultado
            respuesta={s.respuesta}
            avance={s.envio.enviando ? { actual: s.envio.actual, total: s.envio.total } : null}
            onVerGuia={onVerGuia}
            onVerPermiso={onVerPermiso}
            onDeshecha={onImportadas}
          />
        )}
      </div>
    </AdminModal>
  );
}

function Elegir({ s }: { s: ImportarGuias }) {
  const porRegistro = registrosDelTexto(s.texto).validos.length + s.leidos.length;
  const recibidas = s.candidatas.datos?.total ?? 0;
  return (
    <>
      {/* Una fila siempre: a 400 px los rótulos se acortan y, si no entran, la fila se desliza. */}
      <div
        className="flex items-end gap-1 overflow-x-auto border-b-2 border-[var(--rule-base)]"
        role="group"
        aria-label="De dónde salen las guías"
      >
        <Pestana
          id="recibidas"
          s={s}
          label="Ya recibidas en el aserradero"
          corto="Recibidas"
          contador={s.elegidas.size ? `${s.elegidas.size}/${recibidas}` : recibidas || undefined}
        />
        <Pestana
          id="registro"
          s={s}
          label="Por N° de registro SERFOR"
          corto="Registro"
          contador={porRegistro || undefined}
        />
        <Pestana
          id="foto"
          s={s}
          label="Foto o PDF"
          corto="Foto/PDF"
          contador={s.leidos.length || undefined}
        />
        <InfoTip
          className="mb-2 ml-1"
          title="Importar guías despachadas"
          what="Trae guías que ya salieron y las asienta en el libro: sus trozas en Trozado, la tala referencial por árbol (si corresponde) y el despacho con esa guía."
          affects="Cada guía va al permiso que dice su título habilitante: al que ya está en el libro o a uno nuevo con los datos de la guía. Antes de importar ves todo en una vista previa."
          example="Pegas 1-10-0474633 → la GTF 010-001-0000014 con sus 5 trozas de Copaiba → se suma al PMFI 10-HUA-PUE/PER-FMP-2026-007."
          side="left"
        />
      </div>
      {s.pestana === "recibidas" && <LothImportarGuiasRecibidas s={s} />}
      {s.pestana === "registro" && (
        <LothImportarGuiasRegistros
          texto={s.texto}
          onTexto={s.setTexto}
          leidosDeFoto={s.leidos}
          onQuitarLeido={s.quitarLeido}
        />
      )}
      {/* Montado siempre: lo leído (y lo que se está leyendo) no se pierde al cambiar de pestaña. */}
      <div hidden={s.pestana !== "foto"}>
        <LothImportarGuiasFoto onRegistro={s.sumarLeido} />
      </div>
    </>
  );
}

function Pestana({
  id,
  s,
  label,
  corto,
  contador,
}: {
  id: PestanaFuente;
  s: ImportarGuias;
  label: string;
  /** El rótulo en el celular (el largo va como nombre accesible). */
  corto?: string;
  contador?: number | string;
}) {
  const activa = s.pestana === id;
  return (
    <button
      type="button"
      onClick={() => s.setPestana(id)}
      aria-pressed={activa}
      aria-label={corto ? `${label}${contador != null ? ` (${contador})` : ""}` : undefined}
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-xl border-2 border-b-0 px-2.5 text-sm font-semibold transition-colors sm:gap-2 sm:px-4 ${
        activa
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
      }`}
    >
      {corto ? (
        <>
          <span className="sm:hidden">{corto}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      {contador != null && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${activa ? "bg-white/25" : "bg-[var(--surface-raised)]"}`}
        >
          {contador}
        </span>
      )}
    </button>
  );
}

function Pie({ s, onClose }: { s: ImportarGuias; onClose: () => void }) {
  if (s.fase === "resultado" && s.envio.enviando)
    return (
      <ModalFooter nota="Cada guía entra entera o no entra: detener no deja nada a medias.">
        <Btn variant="secondary" onClick={s.pedirDetener}>
          Detener después de esta
        </Btn>
      </ModalFooter>
    );
  if (s.fase === "resultado")
    return (
      <ModalFooter>
        <Btn variant="secondary" onClick={s.reiniciar}>
          Importar otras
        </Btn>
        <Btn variant="primary" onClick={onClose}>
          Cerrar y volver al libro
        </Btn>
      </ModalFooter>
    );

  if (s.fase === "vista") {
    const { listas, trozas, m3, faltaPermiso } = s.plan;
    const n = listas.length;
    return (
      <ModalFooter
        nota={
          s.vista.cargando ? null : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <b className="text-[var(--text-primary)]">{plural(n, "guía", "guías")}</b> ·{" "}
                {plural(trozas, "troza nueva", "trozas nuevas")} ·{" "}
                <span className="font-mono tabular-nums">{fmtM3(m3)} m³</span> · ≈
                {fmtPt(ptAserrableDeRolliza(m3))} pt
              </span>
              {faltaPermiso.length > 0 && (
                <span className="font-semibold text-[var(--data-warning-ink)]">
                  Elige el permiso de {faltaPermiso.join(", ")} o desmarca sus guías
                </span>
              )}
            </span>
          )
        }
      >
        <Btn variant="ghost" onClick={s.volver}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </Btn>
        <Btn
          variant="primary"
          onClick={() => void s.confirmar()}
          disabled={
            n === 0 || faltaPermiso.length > 0 || s.vista.cargando || s.recalculando.size > 0
          }
        >
          <FileDown className="h-4 w-4" aria-hidden /> Importar {plural(n, "guía", "guías")}
        </Btn>
      </ModalFooter>
    );
  }

  const n = s.fuentes.length;
  /* Cada N° de registro es una consulta a SERFOR: hasta 10 por vista previa. */
  const deSerfor = s.fuentes.filter((f) => f.tipo === "serfor").length;
  const demasiadas = n > IMPORTAR_GUIAS_MAX || deSerfor > IMPORTAR_SERFOR_POR_PEDIDO;
  return (
    <ModalFooter
      nota={
        deSerfor > IMPORTAR_SERFOR_POR_PEDIDO ? (
          <span className="font-semibold text-[var(--data-warning-ink)]">
            {deSerfor} N° de registro: van hasta {IMPORTAR_SERFOR_POR_PEDIDO} por vez (cada uno se consulta en SERFOR)
          </span>
        ) : demasiadas ? (
          <span className="font-semibold text-[var(--data-warning-ink)]">
            Elegiste {n}: van hasta {IMPORTAR_GUIAS_MAX} por vez
          </span>
        ) : n > 0 ? (
          <span>
            <b className="text-[var(--text-primary)]">
              {plural(n, "guía elegida", "guías elegidas")}
            </b>
          </span>
        ) : (
          "Elige las guías o pega su N° de registro"
        )
      }
    >
      <Btn variant="ghost" onClick={onClose}>
        Cerrar
      </Btn>
      <Btn
        variant="primary"
        onClick={() => void s.pedirVistaPrevia()}
        disabled={n === 0 || demasiadas}
      >
        <Eye className="h-4 w-4" aria-hidden /> Ver vista previa{n > 0 ? ` (${n})` : ""}
      </Btn>
    </ModalFooter>
  );
}
