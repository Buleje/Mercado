"use client";

/**
 * El titular de un ingreso al CORREGIRLO: se elige del Directorio, igual que en
 * el alta (`WoodEntryForm`, misma `CtpParteBarra`).
 *
 * Hasta 2026-10-09 la edición dejaba el proveedor y su documento como texto
 * libre, y por ahí nacían los nombres que no coinciden con la ficha
 * («COMUNIDAD SANTA ROSA» contra «COMUNIDAD NATIVA SANTA ROSA DE CHIVIS»): la
 * ficha del proveedor busca sus guías por documento, así que un ingreso sin RUC
 * o con otro nombre no le sumaba nada. Elegir de la libreta llena nombre, tipo y
 * número juntos; escribir uno nuevo sigue permitido.
 */

import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { DOC_TIPOS, motivoDocInvalido, type DocTipo } from "@/lib/forestal/directorio";
import CtpParteBarra from "./CtpParteBarra";
import { Field, I } from "./ctp-shared";

export interface TitularIngreso {
  providerName: string;
  providerDocumentType: string;
  providerDocument: string;
}

export default function CtpIngresoTitularEdit({
  valor,
  onCambiar,
}: {
  valor: TitularIngreso;
  onCambiar: (v: Partial<TitularIngreso>) => void;
}) {
  const directorio = useDirectorioForestal();
  const docTipo = (valor.providerDocumentType || "RUC") as DocTipo;
  const docMal = motivoDocInvalido(docTipo, valor.providerDocument);

  return (
    <>
      <div className="sm:col-span-12">
        <CtpParteBarra
          rol="proveedor"
          valor={{ nombre: valor.providerName, docTipo, docNumero: valor.providerDocument, direccion: "" }}
          opciones={directorio.porRol("proveedor")}
          onAplicar={(v) => {
            const cambios: Partial<TitularIngreso> = {};
            if (v.nombre !== undefined) cambios.providerName = v.nombre;
            if (v.docNumero !== undefined) cambios.providerDocument = v.docNumero;
            if (v.docTipo !== undefined) cambios.providerDocumentType = v.docTipo;
            onCambiar(cambios);
          }}
          // Elegir de la libreta cuenta como uso: la lista se ordena por eso.
          onElegir={(parte) => directorio.marcarUso({ partes: [parte.id] })}
          onGuardar={async (v) => {
            await directorio.guardarParte({
              roles: ["proveedor"],
              nombre: v.nombre,
              docTipo: v.docTipo,
              docNumero: v.docNumero,
            });
          }}
        />
      </div>
      <Field span={12} label="Proveedor" required>
        <input
          type="text"
          className={I}
          value={valor.providerName}
          onChange={(e) => onCambiar({ providerName: e.target.value })}
        />
      </Field>
      <Field span={4} label="Tipo de documento">
        <select
          className={I}
          value={docTipo}
          onChange={(e) => onCambiar({ providerDocumentType: e.target.value })}
        >
          {DOC_TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field span={8} label="Documento del proveedor" hint={docMal ?? undefined}>
        <input
          type="text"
          className={`${I} font-mono`}
          aria-invalid={docMal ? true : undefined}
          value={valor.providerDocument}
          onChange={(e) => onCambiar({ providerDocument: e.target.value })}
        />
      </Field>
    </>
  );
}
