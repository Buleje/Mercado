"use client";

/**
 * CtpDespachoGuiaModal — registrar la salida como lo que es: UNA guía con VARIOS
 * productos.
 *
 * El alta anterior pedía una línea por vez (un producto, una cantidad, un
 * número de GTF) y los datos del documento se cargaban después, desde la ficha
 * del despacho. Pero un camión que sale lleva una sola guía con cinco tablas de
 * tres especies: registrarla de a una obligaba a repetir el número cinco veces y
 * a rehacer el propietario, el destinatario y el transportista en cada una.
 *
 * Acá el acto es uno solo, con la forma del formato oficial (LO-CTP del SNIFFS):
 *   · Pestaña 1 — los datos de la Guía de Transporte Forestal.
 *   · Pestaña 2 — la lista de productos, que sale del stock real de la planta.
 *
 * Al registrar se crea UNA LÍNEA DEL LIBRO POR PRODUCTO —así cada una conserva
 * su especie, su cantidad y su atribución a la corrida de la que salió (I4/I5)—
 * y todas nacen con el mismo cuerpo de guía. El libro sigue siendo el libro; lo
 * que cambia es que el operador ya no tiene que desarmar el documento a mano.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFichaCtp } from "@/hooks/use-ficha-ctp";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import { faltantesGtf, gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import {
  payloadDeFila,
  problemasDeLista,
  volumenTotal,
  rotuloDeFila,
  type FilaDespacho,
} from "@/lib/forestal/despacho-lista";
import type { ValorParte } from "./CtpParteBarra";
import { UNIT_LABELS } from "./ctp-section-shared";
import CtpGuiaDatosTab from "./CtpGuiaDatosTab";
import CtpListaProductosTab from "./CtpListaProductosTab";
import CtpProductosStockModal from "./CtpProductosStockModal";
import CtpVerificarGtfSerfor, { type SelloSerfor } from "./CtpVerificarGtfSerfor";
import { Btn, ModalFooter } from "./ctp-shared";

const hoy = () => new Date().toISOString().slice(0, 10);

export default function CtpDespachoGuiaModal({
  presetProducto,
  presetEspecie,
  onClose,
  onSaved,
}: {
  /** Producto elegido en Saldos («del patio a la guía»): abre el stock filtrado. */
  presetProducto?: string | null;
  presetEspecie?: string | null;
  onClose: () => void;
  onSaved: (r: { lineas: number; offline?: boolean }) => void;
}) {
  const ficha = useFichaCtp();
  const directorio = useDirectorioForestal();

  const [tab, setTab] = useState<"guia" | "productos">("guia");
  const [datos, setDatos] = useState<GtfDatos>(() => gtfDatosVacio());
  const [filas, setFilas] = useState<FilaDespacho[]>([]);
  const [emision, setEmision] = useState(hoy);
  const [gtfNumber, setGtfNumber] = useState("");
  const [docType, setDocType] = useState("GTF");
  const [sello, setSello] = useState<SelloSerfor | null>(null);
  const [stockAbierto, setStockAbierto] = useState(Boolean(presetProducto));
  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Uso de la libreta en ESTA guía: se cuenta recién al registrar. */
  const usados = useRef<{ partes: Set<string>; vehiculos: Set<string> }>({ partes: new Set(), vehiculos: new Set() });
  const anotarParte = useCallback((p: Parte) => { usados.current.partes.add(p.id); }, []);
  const anotarVehiculo = useCallback((id: string) => { usados.current.vehiculos.add(id); }, []);
  const guardarEnLibreta = useCallback(
    async (v: ValorParte, rol: RolParte) => {
      const parte = await directorio.guardarParte({
        roles: [rol], nombre: v.nombre, docTipo: v.docTipo, docNumero: v.docNumero,
        direccion: v.direccion, registroMtc: v.registroMtc,
      });
      anotarParte(parte);
    },
    [directorio, anotarParte],
  );

  /**
   * Autollenado con lo que el sistema ya sabe. Corre UNA vez, cuando la ficha
   * llega: repetirlo pisaría lo que el operador tipeó mientras cargaba.
   */
  const autollenado = useRef(false);
  useEffect(() => {
    if (autollenado.current || !ficha) return;
    autollenado.current = true;
    const planta = [ficha.direccion, ficha.distrito, ficha.provincia, ficha.region].filter(Boolean).join(", ");
    setDatos((p) => ({
      ...p,
      propietario: {
        ...p.propietario,
        esElCtp: true,
        nombre: p.propietario.nombre || ficha.razonSocial || ficha.nombreCtp || "",
        docTipo: "RUC",
        docNumero: p.propietario.docNumero || ficha.ruc || "",
        direccion: p.propietario.direccion || planta,
        departamento: p.propietario.departamento || ficha.region || "",
        provincia: p.propietario.provincia || ficha.provincia || "",
        distrito: p.propietario.distrito || ficha.distrito || "",
      },
      traslado: { ...p.traslado, puntoPartida: p.traslado.puntoPartida || planta, fechaInicio: p.traslado.fechaInicio || emision },
      guia: { ...p.guia, autoridad: p.guia.autoridad || ficha.arffs || "" },
      titulos: p.titulos.length ? p.titulos : (ficha.titulos ?? []).slice(0, 1).map((t) => t.codigo).filter(Boolean),
    }));
  }, [ficha, emision]);

  /** La fecha de emisión es también el arranque del traslado. */
  function cambiarEmision(v: string) {
    setEmision(v);
    setDatos((p) => ({ ...p, traslado: { ...p.traslado, fechaInicio: v } }));
  }

  const total = volumenTotal(filas);
  /** La unidad de la guía: la de sus productos (la lista no admite mezclarlas). */
  const unidadLista = UNIT_LABELS[filas[0]?.unidad ?? "m3"] ?? filas[0]?.unidad ?? "m³";
  const problemas = useMemo(() => (filas.length === 0 ? [] : problemasDeLista(filas)), [filas]);
  const faltanGuia = useMemo(() => faltantesGtf(datos), [datos]);
  const puedeRegistrar = filas.length > 0 && problemas.length === 0 && gtfNumber.trim().length > 0 && !enviando;
  /** Lo que falta para poder registrar (lo demás se puede completar después). */
  const bloqueoRegistro = enviando
    ? null
    : filas.length === 0
      ? "Agregá productos en «Creación de lista de productos»"
      : problemas.length > 0
        ? "Revisá los avisos de la lista"
        : !gtfNumber.trim()
          ? "Falta el N° de GTF"
          : null;

  /** El título elegido, para la franja de arriba (N° de recurso y resolución). */
  const titulo = useMemo(
    () => (ficha?.titulos ?? []).find((t) => t.codigo && t.codigo === datos.titulos[0]) ?? null,
    [ficha, datos.titulos],
  );

  function agregarFilas(nuevas: FilaDespacho[]) {
    setFilas((prev) => {
      const vistos = new Set(prev.map((f) => f.uid));
      return [...prev, ...nuevas.filter((f) => !vistos.has(f.uid))];
    });
    setTab("productos");
  }

  function cambiarFila(uid: string, campo: "cantidad" | "volumen", valor: number) {
    setFilas((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, [campo]: Number.isFinite(valor) ? Math.max(0, valor) : 0 } : f)),
    );
  }

  /**
   * Registra la guía: una línea del libro por producto, en SERIE.
   *
   * En serie y no en paralelo a propósito: cada alta toma un lock sobre las
   * líneas de producción para validar el stock (I3/I5), así que mandarlas juntas
   * las haría esperar igual —y con más chance de pisarse. Si una falla, las
   * anteriores YA están: se dice cuáles entraron y las que faltan quedan en la
   * lista para reintentar. Media guía registrada en silencio sería peor.
   */
  async function registrar() {
    setEnviando(true);
    setError(null);
    setAviso(null);
    const comun = {
      entryDate: new Date(emision).toISOString(),
      docType,
      gtfNumber,
      destino: datos.destinatario.nombre || null,
      observations: datos.observaciones || null,
      serforNumeroRegistro: sello?.numeroRegistro ?? null,
      serforVerificadoEn: sello?.verificadoEn ?? null,
    };
    const conGuia = { ...datos, traslado: { ...datos.traslado, fechaInicio: datos.traslado.fechaInicio || emision } };
    const payloads = filas.map((f) => payloadDeFila(f, comun, conGuia));

    /* Sin señal en el patio: queda anotado en el equipo y sube solo. El dato NO
       se pierde y NO se dice que quedó en el libro (no quedó). */
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const { anotar, URL_CTP } = await import("@/lib/forestal/patio-cola");
      for (const p of payloads) await anotar("despacho", p, URL_CTP);
      setEnviando(false);
      onSaved({ lineas: payloads.length, offline: true });
      return;
    }

    const hechas: string[] = [];
    let fallo: { rotulo: string; motivo: string } | null = null;
    for (let i = 0; i < payloads.length; i++) {
      setAvance({ hechas: i, total: payloads.length });
      try {
        const r = await fetch("/api/admin/forestal/ctp", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(payloads[i]),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        hechas.push(filas[i]!.uid);
      } catch (e) {
        fallo = { rotulo: rotuloDeFila(filas[i]!), motivo: e instanceof Error ? e.message : String(e) };
        break;
      }
    }
    setAvance(null);
    setEnviando(false);

    if (hechas.length > 0 && directorio) {
      directorio.marcarUso({ partes: [...usados.current.partes], vehiculos: [...usados.current.vehiculos] });
    }
    if (!fallo) {
      onSaved({ lineas: hechas.length });
      return;
    }
    // Lo que entró se saca de la lista: reintentar no puede duplicarlo.
    setFilas((prev) => prev.filter((f) => !hechas.includes(f.uid)));
    setError(
      `Se registraron ${hechas.length} de ${payloads.length} productos. «${fallo.rotulo}» no entró: ${fallo.motivo}. Lo que falta quedó en la lista para reintentar.`,
    );
    setTab("productos");
  }

  const yaElegidos = useMemo(() => new Set(filas.map((f) => f.uid)), [filas]);

  return (
    <>
      <AdminModal
        open
        onClose={onClose}
        variant="wide"
        title="Registro de guía de transporte forestal"
        description="Salida de producto del CTP · una guía, los productos que van en el camión"
        icon={Truck}
        className="sm:w-[min(96vw,100rem)] sm:max-w-none sm:max-h-[95vh]"
        footer={
          <ModalFooter
            error={error}
            aviso={aviso}
            nota={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <b className="text-[var(--text-primary)]">{filas.length}</b> producto{filas.length === 1 ? "" : "s"} ·{" "}
                  <span className="font-mono tabular-nums">{total.toFixed(4)} {unidadLista}</span>
                </span>
                {/* Por qué NO se puede registrar todavía. Un botón apagado sin
                    motivo manda a buscar a ojo entre dos pestañas. */}
                {bloqueoRegistro && (
                  <span className="font-bold text-[var(--text-secondary)]">{bloqueoRegistro}</span>
                )}
                {faltanGuia.length > 0 && (
                  <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    Falta{faltanGuia.length === 1 ? "" : "n"} {faltanGuia.length} dato{faltanGuia.length === 1 ? "" : "s"} para poder imprimirla ({faltanGuia[0]!.campo})
                  </span>
                )}
              </span>
            }
          >
            <Btn variant="ghost" onClick={onClose} disabled={enviando}>Cerrar</Btn>
            <Btn variant="primary" onClick={() => void registrar()} disabled={!puedeRegistrar}>
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {avance ? `Registrando ${avance.hechas + 1} de ${avance.total}…` : "Registrando…"}
                </>
              ) : (
                `Registrar despacho${filas.length > 1 ? ` (${filas.length} líneas)` : ""}`
              )}
            </Btn>
          </ModalFooter>
        }
      >
        <div className="space-y-3 px-5 py-4 sm:px-6">
          {/* La franja del formato: con qué título sale la madera y cuánto se
              mueve. El volumen es el de la lista, en vivo. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border-2 border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] px-4 py-3 lg:grid-cols-5 dark:bg-[var(--data-warning-500)]/10">
            <DatoFranja label="Titular de TH" valor={ficha?.razonSocial || ficha?.nombreCtp || "—"} />
            <DatoFranja label="Documento" valor={ficha?.ruc || "—"} mono />
            <DatoFranja label="Número de recurso" valor={datos.titulos[0] || "—"} mono />
            <DatoFranja label="Número de resolución" valor={titulo?.resolucion || "—"} />
            {/* La unidad sale de la lista: casi siempre m³, pero una guía de
                producto medido en pies tablares no dice «m³». */}
            <DatoFranja label="Volumen a movilizar" valor={`${total.toFixed(4)} ${unidadLista}`} mono />
          </div>

          <div className="flex gap-1.5">
            <Pestana activa={tab === "guia"} onClick={() => setTab("guia")} label="Datos de la guía de transporte forestal" pendiente={faltanGuia.length} />
            <Pestana activa={tab === "productos"} onClick={() => setTab("productos")} label="Creación de lista de productos" contador={filas.length} />
          </div>

          {tab === "guia" ? (
            <CtpGuiaDatosTab
              datos={datos}
              setDatos={setDatos}
              ficha={ficha}
              directorio={directorio}
              emision={emision}
              onEmision={cambiarEmision}
              gtfNumber={gtfNumber}
              onGtfNumber={setGtfNumber}
              docType={docType}
              onDocType={setDocType}
              onAnotarParte={anotarParte}
              onAnotarVehiculo={anotarVehiculo}
              onGuardarEnLibreta={guardarEnLibreta}
              slotVerificacion={
                <CtpVerificarGtfSerfor
                  gtfNumber={gtfNumber}
                  onSello={setSello}
                  onGuiaVerificada={(g) => {
                    /* Lo que la guía trae y el formulario todavía no tiene se
                       copia; lo tipeado no se pisa. */
                    if (g.gtfNumber && !gtfNumber.trim()) setGtfNumber(g.gtfNumber);
                    setDatos((p) => ({
                      ...p,
                      destinatario: {
                        ...p.destinatario,
                        nombre: p.destinatario.nombre || g.destinatario || "",
                        direccion: p.destinatario.direccion || g.destinatarioDireccion || "",
                      },
                      vehiculo: {
                        ...p.vehiculo,
                        placa: p.vehiculo.placa || g.placa || "",
                        tipo: p.vehiculo.tipo || g.tipoVehiculo || "",
                      },
                      traslado: { ...p.traslado, fechaFin: p.traslado.fechaFin || g.fechaVencimiento || "" },
                    }));
                    setAviso("Datos traídos de la guía verificada en SERFOR.");
                  }}
                />
              }
            />
          ) : (
            <CtpListaProductosTab
              filas={filas}
              onCambiarFila={cambiarFila}
              onQuitar={(uid) => setFilas((prev) => prev.filter((f) => f.uid !== uid))}
              listaNro={datos.guia.listaTrozasNro}
              onListaNro={(v) => setDatos((p) => ({ ...p, guia: { ...p.guia, listaTrozasNro: v } }))}
              observaciones={datos.observaciones}
              onObservaciones={(v) => setDatos((p) => ({ ...p, observaciones: v }))}
              onAbrirStock={() => setStockAbierto(true)}
              problemas={problemas}
            />
          )}
        </div>
      </AdminModal>

      {stockAbierto && (
        <CtpProductosStockModal
          yaElegidos={yaElegidos}
          presetProducto={presetProducto}
          presetEspecie={presetEspecie}
          onAgregar={agregarFilas}
          onCerrar={() => setStockAbierto(false)}
        />
      )}
    </>
  );
}

/** Un dato de la franja de arriba (título habilitante y volumen). */
function DatoFranja({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{label}</div>
      <div className={`truncate text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`} title={valor}>{valor}</div>
    </div>
  );
}

/** Las dos pestañas del formato. */
function Pestana({
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
  /** Datos que le faltan a la guía: un punto, no un número rojo. */
  pendiente?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`inline-flex h-11 items-center gap-2 rounded-t-xl border-2 border-b-0 px-4 text-sm font-bold transition-colors ${
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
        <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)]" aria-label="tiene datos pendientes" />
      )}
    </button>
  );
}
