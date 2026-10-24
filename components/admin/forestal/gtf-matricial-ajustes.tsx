"use client";

/**
 * Lo que es del papel y de la impresora, no de un campo: la medida de la hoja
 * del talonario, el corrimiento de la matricial (con su hoja de prueba), cómo
 * se escriben las fechas, la letra de toda la hoja (`gtf-matricial-letra`),
 * las filas de la tabla con regla (cm y mm, `gtf-matricial-filas`) y la foto del talonario vacío de fondo. Plegados
 * (15-10): se tocan una vez por talonario, y plegados siguen mostrando su dato
 * en el renglón del título.
 */

import { useRef } from "react";
import { ImagePlus, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { MEDIDAS_PAPEL, moverRecuadro } from "@/lib/forestal/gtf-matricial-calibracion";
import type { SeparadorFecha } from "@/lib/forestal/gtf-matricial-disposicion";
import { MARCO_PLANTILLA } from "@/lib/forestal/gtf-talonario-plantilla";
import { PERFIL_OFICINA_ID } from "@/lib/forestal/gtf-salida-tipos";
import { Btn } from "./ctp-shared";
import Plegable from "@/components/admin/shared/Plegable";
import { Casilla, fmtMm, NumeroMm, Opciones } from "./gtf-matricial-controles";
import FilasDeLaTabla, { datoDeLasFilas } from "./gtf-matricial-filas";
import LetraDeLaHoja, { datoDeLaLetra } from "./gtf-matricial-letra";
import ImpresoraTalonario, { type TipoPrueba } from "./gtf-matricial-impresora";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { useFondoTalonario } from "./hooks/use-gtf-matricial-fondo";
import type { EstadoPerfilesTalonario, useSalidaTalonario } from "./hooks/use-gtf-matricial-perfiles";

/** Un bloque plegable: el título y su dato en un renglón; abierto, sus controles. */
function BloqueAjuste({ titulo, dato, children }: { titulo: string; dato: string; children: React.ReactNode }) {
  return (
    <Plegable clave={`forestal:gtf-matricial:${titulo}`} titulo={titulo} resumen={dato} resumenAbierto montarAlAbrir={false}>
      <div className="flex flex-col gap-2">{children}</div>
    </Plegable>
  );
}

const SEPARADORES: ReadonlyArray<{ value: SeparadorFecha; label: string; title: string }> = [
  { value: "/", label: "15/10", title: "15/10/2026" },
  { value: ".", label: "15.10", title: "15.10.2026" },
  { value: "-", label: "15-10", title: "15-10-2026" },
];

export default function AjustesTalonario({
  t,
  f,
  imp,
  salida,
  conValores,
  setConValores,
  onPrueba,
}: {
  t: EstadoGtfMatricial;
  f: ReturnType<typeof useFondoTalonario>;
  imp: EstadoPerfilesTalonario;
  salida: ReturnType<typeof useSalidaTalonario>;
  conValores: boolean;
  setConValores: (v: boolean) => void;
  onPrueba: (tipo?: TipoPrueba) => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const hoja = t.hoja;
  if (!hoja) return null;
  const p = imp.elegido;
  const propio = p && p.id !== PERFIL_OFICINA_ID;
  const [dx, dy] = propio ? [p.corrimientoXmm, p.corrimientoYmm] : [hoja.offsetXMm, hoja.offsetYMm];
  const marco = hoja.marco ?? MARCO_PLANTILLA;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <BloqueAjuste titulo="Calibrar" dato={`${p?.nombre ?? "Oficina"} · X ${fmtMm(dx)} · Y ${fmtMm(dy)} mm`}>
        <ImpresoraTalonario t={t} imp={imp} salida={salida} conValores={conValores} setConValores={setConValores} onPrueba={onPrueba} />
      </BloqueAjuste>

      <BloqueAjuste titulo="Letra" dato={datoDeLaLetra(t)}>
        <LetraDeLaHoja t={t} />
      </BloqueAjuste>

      <BloqueAjuste titulo={t.formato === "lista" ? "Filas de la lista" : "Filas del cuadro (34)"} dato={datoDeLasFilas(t)}>
        <FilasDeLaTabla t={t} />
      </BloqueAjuste>

      <BloqueAjuste
        titulo="Medida"
        dato={`${fmtMm(hoja.anchoMm)} × ${fmtMm(hoja.altoMm)} mm${hoja.marco ? ` · recuadro ${fmtMm(marco.x)} / ${fmtMm(marco.y)}` : ""}`}
      >
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="Ancho" value={hoja.anchoMm} min={50} max={1000} onChange={(anchoMm) => t.cambiarHoja({ anchoMm })} />
          <NumeroMm label="Alto" value={hoja.altoMm} min={50} max={1000} onChange={(altoMm) => t.cambiarHoja({ altoMm })} />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {MEDIDAS_PAPEL.map((m) => (
            <Btn key={m.nombre} variant="ghost" onClick={() => t.cambiarHoja({ anchoMm: m.ancho, altoMm: m.alto })}>
              {m.nombre}
            </Btn>
          ))}
        </div>
        <div className="flex items-end gap-1">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <NumeroMm
              label="Recuadro · izquierda"
              value={marco.x}
              min={0}
              max={200}
              onChange={(x) => t.editar((h) => moverRecuadro(h, x, (h.marco ?? MARCO_PLANTILLA).y), "recuadro")}
              qa="medida-recuadro-x"
            />
            <NumeroMm
              label="Recuadro · arriba"
              value={marco.y}
              min={0}
              max={200}
              onChange={(y) => t.editar((h) => moverRecuadro(h, (h.marco ?? MARCO_PLANTILLA).x, y), "recuadro")}
              qa="medida-recuadro-y"
            />
          </div>
          <div className="pb-1">
            <InfoTip
              title="Dónde cae el formulario en tu hoja"
              what="Con la regla, desde el borde izquierdo del papel hasta la raya del recuadro impreso, y desde el borde de arriba hasta la raya de arriba."
              affects="Mueve el formulario dibujado y todos los valores juntos, sin cambiar su lugar dentro del recuadro. Se deshace con Ctrl + Z."
              example={`Recuadro de ${fmtMm(marco.ancho)} × ${fmtMm(marco.alto)} mm.`}
            />
          </div>
        </div>
        <Opciones label="Fechas" value={hoja.separadorFecha} opciones={SEPARADORES} onChange={(separadorFecha) => t.cambiarHoja({ separadorFecha })} />
      </BloqueAjuste>

      <BloqueAjuste
        titulo="Fondo"
        dato={[f.fondo.impreso ? "formato impreso" : "sin formato", f.fondo.src ? "con foto" : "sin foto"].join(" · ")}
      >
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <Casilla label="Formato impreso del talonario" checked={f.fondo.impreso} onChange={f.setImpreso} />
          </div>
          <InfoTip
            title="Sólo en pantalla"
            what="Dibuja debajo de los valores el talonario de la imprenta (rayas, rótulos, N°) con el titular, el RUC y el N° de esta guía, para ver dónde cae cada valor."
            affects="No se imprime: el papel ya lo trae. Apágalo para acomodar sobre la foto o la cuadrícula."
          />
        </div>
        <input
          ref={archivo}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Subir foto del talonario"
          onChange={(e) => {
            const a = e.target.files?.[0];
            if (a) void f.subir(a);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-1">
          <Btn variant="secondary" className="flex-1" onClick={() => archivo.current?.click()}>
            <ImagePlus className="h-4 w-4" aria-hidden /> {f.fondo.src ? "Cambiar" : "Subir foto"}
          </Btn>
          {f.fondo.src && (
            <Btn variant="ghost" onClick={f.quitar} aria-label="Quitar la foto de fondo">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Btn>
          )}
          <InfoTip
            title="Sólo en pantalla"
            what="Sube una foto o un escaneo del talonario vacío, recortado al borde de la hoja, para acomodar los campos a ojo. No se imprime."
            affects="Queda guardada en este navegador, una para la guía y otra para la lista."
          />
        </div>
        {f.fondo.src && (
          <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Transparencia · {Math.round(f.fondo.opacidad * 100)} %</span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(f.fondo.opacidad * 100)}
              onChange={(e) => f.setOpacidad(Number(e.target.value) / 100)}
              className="h-12 w-full accent-[var(--accent-dark)]"
            />
          </label>
        )}
        <Casilla label="Cuadrícula de 10 mm" checked={f.fondo.cuadricula} onChange={f.setCuadricula} />
        {f.aviso && <span className="text-sm font-semibold text-[var(--data-warning-ink)]">{f.aviso}</span>}
      </BloqueAjuste>
    </div>
  );
}
