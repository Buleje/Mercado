"use client";

/**
 * «Despachar con guía» — la sección Despacho de trozas del Libro TH hace la GTF
 * completa ahí mismo, igual que el despacho del CTP (Brandon 28-09-2026: «se
 * despachará igual como CTP, poniendo del propietario, destinatario,
 * transportista, datos del permiso, resumen de especies, lista de trozas»).
 *
 * Dos pestañas, como el CTP: los casilleros de la guía en el orden del papel y
 * la lista de trozas con su detalle por especie. Registrar es UN acto: la guía y
 * una línea de Despacho por troza, todo o nada (`ForestLothDB.despacharConGuia`).
 * Antes eran dos pantallas y de ahí salían las guías «declaradas en el libro y
 * no emitidas».
 */

import { useCallback, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Truck, Wand2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { detallePorEspecie, guiaEsDePlantacion, rotuloDelTitulo, totalM3 } from "@/lib/forestal/loth-guia-despacho";
import { papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";
import { useDespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { useEspeciesConCatalogo } from "./ctp-especie-campo";
import type { ValorParte } from "./CtpParteBarra";
import CtpDocumentoVisor, { type DocumentoImprimible } from "./CtpDocumentoVisor";
import LothGuiaDatos from "./LothGuiaDatos";
import LothGuiaTrozas from "./LothGuiaTrozas";
import LothGuiaRegistrada, { useCapaEncimaDelModal } from "./LothGuiaRegistrada";
import AvisoTrozasDeAntes, { useTrozasDeAntes, type TrozasIniciales } from "./LothGuiaTrozasDeAntes";
import { Btn } from "./ctp-shared";

type Pestana = "guia" | "trozas";

/** De la libreta al relleno: la parte guardada con los nombres que usa la guía. */
const aGuardada = (p: Parte | undefined) =>
  p
    ? {
        nombre: p.nombre,
        docTipo: p.docTipo,
        docNumero: p.docNumero,
        direccion: p.direccion,
        departamento: p.region,
        provincia: p.provincia,
        distrito: p.distrito,
        zona: p.zona,
        registroMtc: p.registroMtc,
        licencia: p.licencia,
      }
    : null;

/** `trozasIniciales`: códigos que llegan elegidos y sus permisos (Control del permiso, ADR-459; escaneo al camión). */
export default function LothDespachoGuiaModal({ onClose, onRegistrada, trozasIniciales }: { onClose: () => void; onRegistrada: () => void; trozasIniciales?: TrozasIniciales }) {
  const directorio = useDirectorioForestal();
  /* La libreta cuenta los usos recién al registrar: lo que se eligió y se
     cambió antes no sube en el orden. */
  const usados = useRef({ partes: new Set<string>(), vehiculos: new Set<string>() });
  const alRegistrar = useCallback(() => {
    directorio.marcarUso({ partes: [...usados.current.partes], vehiculos: [...usados.current.vehiculos] });
    onRegistrada();
  }, [directorio, onRegistrada]);
  const g = useDespachoGuiaLoth({ onRegistrada: alRegistrar });
  const avisoDeAntes = useTrozasDeAntes(g, trozasIniciales); // después del hook: su siembra corre antes
  const catalogo = useEspeciesConCatalogo();
  const cientificoDe = useCallback((comun: string) => catalogo.cientificoDe(comun), [catalogo]);
  const [tab, setTab] = useState<Pestana>("trozas");
  const [borrador, setBorrador] = useState<{ docs: DocumentoImprimible[]; activo: number } | null>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  useCapaEncimaDelModal(cuerpo, borrador != null);

  const anotarParte = useCallback((p: Parte) => {
    usados.current.partes.add(p.id);
  }, []);
  const anotarVehiculo = useCallback((id: string) => {
    usados.current.vehiculos.add(id);
  }, []);
  const guardarEnLibreta = useCallback(
    async (v: ValorParte, rol: RolParte) => {
      const parte = await directorio.guardarParte({
        roles: [rol],
        nombre: v.nombre,
        docTipo: v.docTipo,
        docNumero: v.docNumero,
        direccion: v.direccion,
        registroMtc: v.registroMtc,
        region: v.departamento,
        provincia: v.provincia,
        distrito: v.distrito,
      });
      anotarParte(parte);
    },
    [directorio, anotarParte],
  );

  function rellenarConLibreta() {
    g.rellenar({
      destinatario: aGuardada(directorio.receptores()[0]),
      transportista: aGuardada(directorio.porRol("transportista")[0]),
      conductor: aGuardada(directorio.porRol("conductor")[0]),
      vehiculo: directorio.vehiculosActivos[0] ?? null,
    });
  }

  function verComoSale() {
    const p = papelesGuiaLoth({
      gtfNumber: g.gtfNumber,
      gtfDate: g.emision,
      titular: g.identidad?.titular ?? "",
      datos: g.datos,
      piezas: g.piezas,
      cientificoDe,
      borrador: true,
    });
    setBorrador({ docs: [p.gtf, p.lista], activo: 0 });
  }

  const volumen = totalM3(g.piezas);
  const especies = detallePorEspecie(g.piezas).length;
  const faltanGuia = g.faltan.filter((f) => f.seccion !== "trozas");
  const d = g.datos;
  const esPlantacion = Boolean(g.identidad?.esPlantacion) || guiaEsDePlantacion(d);

  /* Cargando o sin datos: sólo se puede cerrar. Un «Faltan 10» o un «Rellenar»
     activos sobre un modal vacío dicen algo que todavía no se sabe. */
  const footer = g.cargando || g.errorCarga ? (
    <ModalFooter nota={g.cargando ? "Preparando la guía…" : null}>
      <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
    </ModalFooter>
  ) : g.registrada ? (
    <ModalFooter
      nota={
        <span>
          <b className="text-[var(--text-primary)]">{g.registrada.lineas}</b> {g.registrada.lineas === 1 ? "línea" : "líneas"} de despacho en el libro
        </span>
      }
    >
      <Btn variant="primary" onClick={onClose}>Cerrar y volver al libro</Btn>
    </ModalFooter>
  ) : (
    <ModalFooter
      error={g.error}
      aviso={
        g.pregunta ? (
          <span className="flex flex-wrap items-center gap-2 text-[var(--text-primary)]">
            {g.pregunta.mensaje}
            <Btn size="sm" variant="secondary" onClick={() => void g.registrar(g.pregunta?.tipo)} disabled={g.enviando}>Sí, usar ese número</Btn>
            <Btn size="sm" variant="ghost" onClick={g.cancelarPregunta}>Corregirlo</Btn>
          </span>
        ) : null
      }
      nota={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <b className="text-[var(--text-primary)]">{g.piezas.length}</b> {g.piezas.length === 1 ? "troza" : "trozas"}
            {especies > 0 && ` · ${especies} ${especies === 1 ? "especie" : "especies"}`} ·{" "}
            <span className="font-mono tabular-nums">{fmtM3(volumen)} m³</span>
          </span>
          {g.faltan.length > 0 && (
            <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Falta{g.faltan.length === 1 ? "" : "n"} {g.faltan.length} para registrar: {g.faltan[0]?.campo}
            </span>
          )}
        </span>
      }
    >
      <Btn variant="ghost" onClick={onClose} disabled={g.enviando}>Cerrar</Btn>
      <Btn
        variant="secondary"
        onClick={rellenarConLibreta}
        disabled={g.enviando || directorio.cargando}
        title="Completa destinatario, transportista, chofer y camión con los más usados del Directorio, sólo donde está vacío"
      >
        <Wand2 className="h-4 w-4" aria-hidden="true" /> Rellenar con la libreta
      </Btn>
      <Btn variant="secondary" onClick={verComoSale} disabled={!g.identidad} title="Mira la guía y la lista antes de registrar: salen marcadas como borrador">
        <FileText className="h-4 w-4" aria-hidden="true" /> Ver cómo sale
      </Btn>
      <Btn variant="primary" onClick={() => void g.registrar()} disabled={g.enviando || g.faltan.length > 0 || !g.identidad}>
        {g.enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Truck className="h-4 w-4" aria-hidden="true" />}
        {g.enviando ? "Registrando…" : `Registrar despacho y guía${g.piezas.length > 1 ? ` (${g.piezas.length} trozas)` : ""}`}
      </Btn>
    </ModalFooter>
  );

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      title="Despachar trozas con guía"
      description="Libro TH · la guía de transporte forestal y su lista de trozas, en un solo registro"
      icon={Truck}
      className="sm:w-[min(96vw,100rem)] sm:max-w-none sm:max-h-[95vh]"
      footer={footer}
    >
      <div ref={cuerpo} className="space-y-3 px-5 py-4 sm:px-6">
        {g.cargando ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Trayendo el plan, la carátula y las trozas del libro…
          </div>
        ) : g.errorCarga ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {g.errorCarga}
            <Btn size="sm" variant="secondary" onClick={() => void g.recargar()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
            </Btn>
          </div>
        ) : (
          <>
            {/* La franja del formato: con qué título sale la madera y cuánto se mueve. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border-2 border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-4 py-3 lg:grid-cols-5 dark:bg-[var(--data-warning-500)]/10">
              <DatoFranja label={esPlantacion ? "Titular de la plantación" : "Titular del título"} valor={g.identidad?.titular || "—"} />
              <DatoFranja label="Documento" valor={d.propietario.esElCtp ? d.propietario.docNumero || "—" : "—"} mono />
              <DatoFranja label={rotuloDelTitulo(esPlantacion)} valor={d.titulos[0] || "—"} mono />
              <DatoFranja label={esPlantacion ? "Constancia" : "Resolución"} valor={d.guia.resolucion || "—"} />
              <DatoFranja label="Volumen a movilizar" valor={`${fmtM3(volumen)} m³`} mono />
            </div>

            {g.registrada ? (
              <LothGuiaRegistrada r={g.registrada} cientificoDe={cientificoDe} />
            ) : (
              <>
                <AvisoTrozasDeAntes aviso={avisoDeAntes} />
                <div className="flex flex-wrap gap-1 border-b-2 border-[var(--rule-base)]" role="group" aria-label="Partes de la guía">
                  <PestanaGuia activa={tab === "guia"} onClick={() => setTab("guia")} label="Datos de la guía" pendiente={faltanGuia.length} />
                  <PestanaGuia activa={tab === "trozas"} onClick={() => setTab("trozas")} label="Lista de trozas" contador={g.piezas.length} />
                </div>
                {tab === "guia" ? (
                  <LothGuiaDatos
                    g={g}
                    directorio={directorio}
                    onAnotarParte={anotarParte}
                    onAnotarVehiculo={anotarVehiculo}
                    onGuardarEnLibreta={guardarEnLibreta}
                  />
                ) : (
                  <LothGuiaTrozas g={g} cientificoDe={cientificoDe} />
                )}
              </>
            )}
          </>
        )}
      </div>
      {borrador && (
        <CtpDocumentoVisor
          documentos={borrador.docs}
          activo={borrador.activo}
          onActivo={(i) => setBorrador((b) => (b ? { ...b, activo: i } : b))}
          onClose={() => setBorrador(null)}
        />
      )}
    </AdminModal>
  );
}

function DatoFranja({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{label}</div>
      {/* Un código (registro, título) se lee ENTERO: se parte en vez de cortarse con «…». */}
      <div className={`text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums [overflow-wrap:anywhere]" : "truncate"}`} title={valor}>
        {valor}
      </div>
    </div>
  );
}

/** Las dos pestañas del despacho, como las del CTP. */
function PestanaGuia({
  activa,
  onClick,
  label,
  contador,
  pendiente,
}: {
  activa: boolean;
  onClick: () => void;
  label: string;
  contador?: number;
  pendiente?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`inline-flex h-11 items-center gap-2 rounded-t-xl border-2 border-b-0 px-4 text-sm font-semibold transition-colors ${
        activa
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
      }`}
    >
      {label}
      {contador != null && contador > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums ${activa ? "bg-white/25" : "bg-[var(--surface-raised)]"}`}>{contador}</span>
      )}
      {!activa && pendiente != null && pendiente > 0 && (
        <span role="img" className="h-2 w-2 rounded-full bg-[var(--data-warning-500)]" aria-label="tiene datos pendientes" />
      )}
    </button>
  );
}
