"use client";

import { useMemo, useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CardTitle } from "@buleje/design-system";
import { Link2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { leerVinculo, nombrePorDefecto, type NombreTercero } from "@/lib/documentos/terceros-vinculo";
import { vinculosDeCarpetaSistema, type VinculoSistema } from "@/lib/documentos/vinculos-sistema";
import { olvidarNombresLigados } from "../esenciales/use-tercero-en-el-sistema";
import BuscarTercero from "./BuscarTercero";
import FilaVinculo from "./FilaVinculo";
import { ponerNombreVinculo, refrescarNombresVinculos, useNombresVinculos } from "./use-nombres-vinculos";
import { useVinculosCarpeta } from "./use-vinculos-carpeta";

const LISTA = "divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]";

/**
 * «Vínculos con el sistema…» de una carpeta (Brandon 24-10): a qué está ligada,
 * en qué página vive, el enlace, desde cuándo y qué trae; y cambiar, quitar,
 * ligar otro o ponerle un nombre propio. Ligar y quitar son etiquetas (ADR-502)
 * y van por `folders/bulk`; el nombre propio, por `documents/vinculos`.
 */
export default function VinculosCarpetaModal({ carpeta, carpetas, onClose, onCambiar }: {
  /** La carpeta como está AHORA (se relee de la lista tras cada cambio). */
  carpeta: DbDocumentFolder;
  /** Todas las carpetas visibles: para saber si una madre es de un módulo. */
  carpetas: readonly DbDocumentFolder[];
  onClose: () => void;
  onCambiar: (accion: "addTags" | "removeTags", clave: string) => Promise<unknown>;
}) {
  const porId = useMemo(() => new Map(carpetas.map((c) => [c.id, c])), [carpetas]);
  const vinculos = useMemo(() => vinculosDeCarpetaSistema(carpeta, porId), [carpeta, porId]);
  const ligados = useMemo(() => vinculos.filter((v) => v.origen === "ligado"), [vinculos]);
  const delSistema = useMemo(() => vinculos.filter((v) => v.origen === "modulo"), [vinculos]);
  const claves = useMemo(() => ligados.map((v) => v.clave), [ligados]);
  const nombres = useNombresVinculos(claves);
  const { dato, fallo, reintentar, ponerAlias } = useVinculosCarpeta(carpeta.id, (carpeta.tags ?? []).join(","));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<VinculoSistema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeEditar = dato?.puedeEditar ?? false;
  const yaVinculados = useMemo(() => new Set(claves), [claves]);

  const aliasDe = (clave: string): string | null => (dato ? dato.alias[clave] ?? null : nombres[clave]?.alias ?? null);
  const nombreRealDe = (v: VinculoSistema): string => {
    const n = nombres[v.clave]?.nombre?.trim();
    if (n) return n;
    const t = leerVinculo(v.clave);
    return v.nombreFijo ?? (t ? nombrePorDefecto(t.tipo, t.id) : v.clave);
  };

  /** Corre un cambio con el spinner en su fila y deja los nombres al día en el árbol y en Esenciales. */
  const hacer = async (clave: string, paso: () => Promise<unknown>) => {
    setOcupado(clave);
    setError(null);
    try {
      await paso();
      olvidarNombresLigados();
      void refrescarNombresVinculos();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Prueba de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  const elegir = (clave: string, nombre?: NombreTercero) => {
    const viejo = cambiando;
    void hacer(clave, async () => {
      await onCambiar("addTags", clave);
      if (nombre) ponerNombreVinculo(clave, nombre);
      // Re-ligar = el nuevo entra primero y el viejo sale después: si algo falla a la mitad, no queda sin vínculo.
      if (viejo && viejo.clave !== clave) await onCambiar("removeTags", viejo.clave);
      setCambiando(null);
    });
  };

  const renombrar = async (clave: string, alias: string | null) => {
    const guardado = await ponerAlias(clave, alias);
    ponerNombreVinculo(clave, { alias: guardado });
    olvidarNombresLigados();
  };

  const fila = (v: VinculoSistema) => {
    const alias = v.origen === "ligado" ? aliasDe(v.clave) : null;
    const real = nombreRealDe(v);
    return (
      <FilaVinculo
        key={v.clave}
        v={v}
        carpetaId={carpeta.id}
        nombre={alias || real}
        nombreReal={alias ? real : null}
        alias={alias}
        registro={dato?.registro[v.clave] ?? null}
        conRegistro={!!dato}
        puedeEditar={puedeEditar}
        ocupado={ocupado === v.clave}
        onRenombrar={(a) => renombrar(v.clave, a)}
        onCambiar={() => setCambiando(v)}
        onQuitar={() => void hacer(v.clave, () => onCambiar("removeTags", v.clave))}
      />
    );
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Vínculos con el sistema"
      description={carpeta.name}
      icon={Link2}
      size="lg"
      claveVentana="vinculos-sistema"
      ayuda={
        <InfoTip
          what="A qué parte del sistema está atada esta carpeta: un tercero (comunidad, proveedor, cliente, colaborador, persona) o el módulo que la creó."
          affects="Con un vínculo, la carpeta sale en la ficha del tercero y en Archivo › Terceros, con su marca en el árbol. El nombre propio sólo cambia cómo se ve acá: la ficha no se toca."
          example="«CCNN Santa Rosa» ligada a la comunidad «COMUNIDAD NATIVA SANTA ROSA DE CHIVIS», con nombre propio «Santa Rosa»."
        />
      }
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Listo</button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-5", MODAL_BODY)} data-qa="vinculos-modal">
        {vinculos.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Esta carpeta no está ligada a nada del sistema.</p>}

        {ligados.length > 0 && (
          <section className="space-y-2">
            <CardTitle>Ligada a</CardTitle>
            <ul className={LISTA}>{ligados.map(fila)}</ul>
          </section>
        )}

        {delSistema.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5">
              <CardTitle>Lo puso el sistema</CardTitle>
              <InfoTip
                what="Carpetas que creó un módulo para guardar sus papeles: el Libro CTP sus guías, el Libro TH su plan, Equipo los pagos."
                affects="El módulo la vuelve a buscar por su nombre o su etiqueta: si la renombras o la mueves, crea otra. Se cambia desde ese módulo."
                example="«Guías forestales (GTF)» → Forestal › Libro CTP › Ingresos."
              />
            </div>
            <ul className={LISTA}>{delSistema.map(fila)}</ul>
          </section>
        )}

        {fallo && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            No cargó quién lo ligó ni si puedes cambiarlo.
            <button type="button" onClick={reintentar} className={button({ variant: "ghost", size: "sm" })}>Prueba de nuevo</button>
          </p>
        )}

        {puedeEditar && (
          cambiando ? (
            <BuscarTercero
              key={`cambiar:${cambiando.clave}`}
              titulo={`Cambiar «${aliasDe(cambiando.clave) || nombreRealDe(cambiando)}» por…`}
              reemplaza={aliasDe(cambiando.clave) || nombreRealDe(cambiando)}
              tipoInicial={leerVinculo(cambiando.clave)?.tipo}
              yaVinculados={yaVinculados}
              ocupado={ocupado}
              onElegir={elegir}
              onCancelar={() => setCambiando(null)}
            />
          ) : (
            <BuscarTercero
              key="nuevo"
              titulo={ligados.length > 0 ? "Ligar a otro" : "¿De quién son estos papeles?"}
              yaVinculados={yaVinculados}
              ocupado={ocupado}
              onElegir={elegir}
            />
          )
        )}
      </div>
    </AdminModal>
  );
}
