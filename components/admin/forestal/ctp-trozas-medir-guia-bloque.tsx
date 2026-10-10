"use client";

/**
 * Una guía dentro de «Traer de la guía (SERFOR)»: si el ingreso ya guarda la
 * ficha, la vista previa sale sola (sin red); si no, pide el N° de registro —el
 * del QR, con guiones— o el enlace del QR, y consulta SERFOR desde el servidor.
 * «Guardar las N de la guía» escribe sólo sobre vacío (`POST …/medidas-guia`).
 *
 * 05-10, «Completar Blas con el QR»:
 *   · «Escanear QR» abre la cámara (`CamaraEscaneo`, la del escáner de trozas),
 *     lee el QR de la GTF de papel (`leerQrDeGuia`) y dispara la vista previa
 *     sin tipear. Si el QR es de OTRA guía de la lista, ofrece llevarlo allá;
 *   · la vista previa trae también el título habilitante de la ficha: si falta
 *     en el libro, se declara junto con las medidas (lo decide el servidor);
 *   · `activo` = la planilla le pasó el turno (guía tras guía): se trae a la
 *     vista y el foco va a «Escanear QR».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "@buleje/design-system/icons";
import {
  guiaQueCorresponde,
  leerQrDeGuia,
  type EstadoGuiaMedidas,
  type RespuestaMedidasGuia,
} from "@/lib/forestal/medidas-desde-guia";
import { Btn, I } from "./ctp-shared";
import { CamaraEscaneo } from "./escaner-trozas-partes";
import CtpTrozasMedirGuiaResumen, { bloqueoDeGuia } from "./ctp-trozas-medir-guia-resumen";
import CtpTrozasMedirGuiaTitulo, { tituloSeDeclara } from "./ctp-trozas-medir-guia-titulo";
import { useMedidasDeGuia } from "./hooks/use-medidas-trozas";

const OK = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

const plural = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

type Aplicado = NonNullable<RespuestaMedidasGuia["aplicado"]>;

/** La línea que queda arriba de la planilla después de guardar. */
function mensajeGuardado(gtf: string, a: Aplicado): string {
  const t = a.titulo;
  return (
    `Guía ${gtf}: ${plural(a.escritas.length, "pieza llenada", "piezas llenadas")} desde SERFOR` +
    (a.omitidas.length ? ` · ${a.omitidas.length} ya las había anotado otra pantalla` : "") +
    (t && t.declarados > 0 ? ` · título ${t.codigo} declarado` : "") +
    (t && t.declarados === 0 && t.motivo ? ` · el título quedó afuera: ${t.motivo}` : "") +
    (a.fichaGuardadaEn ? " · ficha guardada en el ingreso" : "") +
    "."
  );
}

function etiquetaGuardar(llenar: number, conTitulo: boolean): string {
  const piezas = llenar === 1 ? "la 1" : `las ${llenar}`;
  if (llenar > 0) return conTitulo ? `Guardar ${piezas} y el título` : `Guardar ${piezas} de la guía`;
  return conTitulo ? "Declarar el título" : "Nada para llenar";
}

export default function CtpTrozasMedirGuiaBloque({
  gtfNumber, codigos, estado, activo, hecha, otras, entrega, onLlevarA, onGuardado,
}: {
  gtfNumber: string;
  /** Códigos de las piezas de esta guía sin D1 ni D2. */
  codigos: readonly string[];
  estado: EstadoGuiaMedidas | undefined;
  /** Le toca a esta guía (guía tras guía): a la vista y con el foco. */
  activo: boolean;
  /** Ya se guardó en esta sesión (puede quedar alguna pieza para anotar a mano). */
  hecha: boolean;
  /** Las otras guías pendientes de la planilla: si el QR es de una de ellas, se ofrece llevarlo. */
  otras: readonly string[];
  /** Un N° de registro leído en otra guía que era de ésta: se consulta solo. */
  entrega: { registro: string; n: number } | null;
  onLlevarA: (gtf: string, registroOEnlace: string) => void;
  /** Después de escribir: la línea de resultado (la planilla relee el patio). */
  onGuardado: (mensaje: string) => void;
}) {
  const { consultar, cargando, error } = useMedidasDeGuia();
  const [texto, setTexto] = useState("");
  const [r, setR] = useState<RespuestaMedidasGuia | null>(null);
  const [camara, setCamara] = useState(false);
  /** Lo que leyó la cámara no es el QR de una guía: el porqué. */
  const [lectura, setLectura] = useState<string | null>(null);
  const automatica = useRef(false);
  const entregaVista = useRef(0);
  const caja = useRef<HTMLLIElement>(null);

  const ver = useCallback(
    async (valor: string) => {
      setLectura(null);
      const res = await consultar({ gtfNumber, registroOEnlace: valor });
      if (res) setR(res);
    },
    [consultar, gtfNumber],
  );

  /* Con la ficha guardada, la vista previa va sola (una vez). */
  useEffect(() => {
    if (!estado?.fichaGuardada || automatica.current) return;
    automatica.current = true;
    void consultar({ gtfNumber }).then((res) => res && setR(res));
  }, [estado?.fichaGuardada, gtfNumber, consultar]);

  /* Le toca a ésta: a la vista y el foco en «Escanear QR» (o en «Guardar» si ya está lista). */
  useEffect(() => {
    if (!activo) return;
    const el = caja.current;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.querySelector<HTMLButtonElement>("[data-escanear-qr], [data-guardar-guia]")?.focus({ preventScroll: true });
  }, [activo]);

  /* Un QR leído en otra guía era de ésta. */
  useEffect(() => {
    if (!entrega || entrega.n === entregaVista.current) return;
    entregaVista.current = entrega.n;
    setTexto(entrega.registro);
    void ver(entrega.registro);
  }, [entrega, ver]);

  const alLeer = (leido: string) => {
    setCamara(false);
    const l = leerQrDeGuia(leido);
    if (!l.ok) {
      setLectura(l.motivo);
      return;
    }
    setTexto(l.registro);
    void ver(l.registro);
  };

  const guardar = async () => {
    const res = await consultar({ gtfNumber, registroOEnlace: r?.fuente === "serfor" ? texto : undefined, aplicar: true });
    if (!res?.aplicado) return;
    setR(res);
    onGuardado(mensajeGuardado(gtfNumber, res.aplicado));
  };

  const llenar = r?.plan?.llenar.length ?? 0;
  const lista = r?.estado === "lista" ? r : null;
  const bloqueo = lista ? bloqueoDeGuia(lista) : null;
  const otraGuia = lista?.relacionGuia === "distinta";
  const destino = otraGuia ? guiaQueCorresponde(otras, lista?.guiaSerfor) : null;
  const conTitulo = tituloSeDeclara(lista?.titulo);
  /* El campo se ve salvo cuando la ficha guardada ya respondió bien (o se está leyendo). */
  const pideRegistro = r
    ? r.estado !== "lista" || r.fuente === "serfor" || bloqueo != null
    : !estado?.fichaGuardada || (!cargando && error != null);
  const idInput = `medir-guia-${gtfNumber.replace(/[^\w-]/g, "")}`;
  const t = r?.aplicado?.titulo;

  return (
    <li
      ref={caja}
      className={`space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 ${activo ? "ring-2 ring-[var(--accent)]" : ""}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <b className="font-mono text-[var(--text-primary)]">{gtfNumber}</b>
        <span className="line-clamp-2 text-[var(--text-secondary)] sm:line-clamp-none">
          {plural(codigos.length, "pieza", "piezas")} sin D1/D2: {codigos.slice(0, 8).join(", ")}
          {codigos.length > 8 ? "…" : ""}
        </span>
        {hecha && (
          <span className={`rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold ${OK}`}>
            Guardada · {plural(codigos.length, "queda", "quedan")} para anotar abajo
          </span>
        )}
        {estado?.fichaGuardada && !hecha && (
          <span className={`rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold ${OK}`}>
            Ficha SERFOR guardada{estado.numeroRegistro ? ` · ${estado.numeroRegistro}` : ""}
          </span>
        )}
      </div>

      {pideRegistro && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]" htmlFor={idInput}>
            N° de registro (el del QR, con guiones) o pega el enlace del QR
            <input
              id={idInput}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && texto.trim()) { e.preventDefault(); void ver(texto); } }}
              placeholder="1-19-0313629"
              inputMode="text"
              autoComplete="off"
              className={`${I} mt-1 font-mono`}
            />
          </label>
          <div className="flex gap-2">
            <Btn data-escanear-qr variant={activo ? "primary" : "secondary"} onClick={() => setCamara(true)} disabled={cargando} className="flex-1 sm:flex-none">
              <QrCode className="h-4 w-4" aria-hidden="true" /> Escanear QR
            </Btn>
            <Btn onClick={() => void ver(texto)} disabled={cargando || texto.trim() === ""} className="flex-1 sm:flex-none">
              {cargando ? "Consultando…" : "Ver qué trae"}
            </Btn>
          </div>
        </div>
      )}

      {lectura && <p className={`text-sm font-semibold ${AVISO}`} role="alert">{lectura}</p>}
      {cargando && estado?.fichaGuardada && !r && (
        <p className="text-sm text-[var(--text-tertiary)]" role="status">Leyendo la ficha guardada…</p>
      )}
      {error && <p className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" role="alert">{error}</p>}
      {r && r.estado !== "lista" && r.mensaje && <p className={`text-sm ${AVISO}`} role="status">{r.mensaje}</p>}

      {lista && !lista.aplicado && (
        <>
          <CtpTrozasMedirGuiaResumen r={lista} />
          {!bloqueo && <CtpTrozasMedirGuiaTitulo t={lista.titulo} />}
          {otraGuia ? (
            <div className="flex flex-wrap justify-end gap-2">
              {destino && (
                <Btn variant="primary" onClick={() => onLlevarA(destino, texto)}>
                  Usarlo en la guía {destino}
                </Btn>
              )}
              <Btn data-escanear-qr onClick={() => setCamara(true)}>
                <QrCode className="h-4 w-4" aria-hidden="true" /> Escanear el de la {gtfNumber}
              </Btn>
            </div>
          ) : (
            <div className="flex justify-end">
              <Btn
                data-guardar-guia
                variant="primary"
                onClick={() => void guardar()}
                disabled={cargando || bloqueo != null || (llenar === 0 && !conTitulo)}
              >
                {cargando ? "Guardando…" : bloqueo ? "No es esta guía" : etiquetaGuardar(llenar, conTitulo)}
              </Btn>
            </div>
          )}
        </>
      )}
      {r?.aplicado && (
        <p className={`text-sm font-semibold ${OK}`} role="status">
          {plural(r.aplicado.escritas.length, "pieza llenada", "piezas llenadas")} desde la guía
          {r.aplicado.omitidas.length ? ` · ${r.aplicado.omitidas.length} ya tenían una punta` : ""}
          {t && t.declarados > 0 ? ` · título ${t.codigo} declarado` : ""}.
        </p>
      )}
      {t && t.declarados === 0 && t.motivo && (
        <p className={`text-sm ${AVISO}`} role="status">El título {t.codigo} quedó afuera: {t.motivo}.</p>
      )}

      {camara && (
        <CamaraEscaneo
          onLectura={alLeer}
          onCerrar={() => setCamara(false)}
          pie={
            <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">
              Apunta al QR impreso en la GTF <b className="font-mono text-[var(--text-primary)]">{gtfNumber}</b>. ¿No lo
              lee? Ábrelo con la cámara del teléfono, copia el enlace y pégalo en el campo.
            </p>
          }
        />
      )}
    </li>
  );
}
