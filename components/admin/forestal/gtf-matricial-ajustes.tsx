"use client";

/**
 * Lo que es del papel y de la impresora, no de un campo: la medida de la hoja
 * del talonario, el corrimiento de la matricial (con su hoja de prueba), cómo
 * se escriben las fechas y la foto del talonario vacío de fondo. Plegados
 * (15-10): se tocan una vez por talonario, y plegados siguen mostrando su dato
 * en el renglón del título.
 */

import { useRef } from "react";
import { ChevronDown, ImagePlus, Printer, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { SeparadorFecha } from "@/lib/forestal/gtf-matricial-disposicion";
import { Btn } from "./ctp-shared";
import { Casilla, fmtMm, NumeroMm, Opciones } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { useFondoTalonario } from "./hooks/use-gtf-matricial-fondo";

/** Un bloque plegable: el título y su dato en un renglón de 48 px; abierto, sus controles. */
function Plegable({ titulo, dato, children }: { titulo: string; dato: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 font-bold text-[var(--text-primary)]">{titulo}</span>
        <span className="min-w-0 flex-1 truncate text-right tabular-nums text-[var(--text-tertiary)]">{dato}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-2 pb-2.5">{children}</div>
    </details>
  );
}

const MEDIDAS: ReadonlyArray<{ nombre: string; ancho: number; alto: number }> = [
  { nombre: "A4", ancho: 210, alto: 297 },
  { nombre: "Carta", ancho: 215.9, alto: 279.4 },
  { nombre: "A5", ancho: 148, alto: 210 },
];

const SEPARADORES: ReadonlyArray<{ value: SeparadorFecha; label: string; title: string }> = [
  { value: "/", label: "15/10", title: "15/10/2026" },
  { value: ".", label: "15.10", title: "15.10.2026" },
  { value: "-", label: "15-10", title: "15-10-2026" },
];

export default function AjustesTalonario({
  t,
  f,
  conValores,
  setConValores,
  onPrueba,
}: {
  t: EstadoGtfMatricial;
  f: ReturnType<typeof useFondoTalonario>;
  conValores: boolean;
  setConValores: (v: boolean) => void;
  onPrueba: () => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const hoja = t.hoja;
  if (!hoja) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Plegable titulo="Calibrar" dato={`X ${fmtMm(hoja.offsetXMm)} · Y ${fmtMm(hoja.offsetYMm)} mm`}>
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="Corrimiento X" value={hoja.offsetXMm} min={-50} max={50} onChange={(offsetXMm) => t.cambiarHoja({ offsetXMm })} />
          <NumeroMm label="Corrimiento Y" value={hoja.offsetYMm} min={-50} max={50} onChange={(offsetYMm) => t.cambiarHoja({ offsetYMm })} />
        </div>
        <Casilla label="Con los valores de esta guía" checked={conValores} onChange={setConValores} />
        <div className="flex items-center gap-1">
          <Btn variant="secondary" className="flex-1" onClick={onPrueba}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir prueba
          </Btn>
          <InfoTip
            icono="ayuda"
            title="Cómo calibrar"
            what={
              <span>
                1) Mide tu talonario y ponlo en «Medida de la hoja». 2) Pon una hoja en la matricial e imprime la prueba.
                3) Con una regla, mide del borde del papel al centro de cada cruz: debe dar 10 mm. 4) Si da 12 mm a la
                izquierda, pon −2 en X; si da 8 mm arriba, pon +2 en Y. Repite hasta que dé 10.
              </span>
            }
            example="En el diálogo de impresión: márgenes «Ninguno», escala 100 % y sin encabezados ni pies de página."
          />
        </div>
      </Plegable>

      <Plegable titulo="Medida" dato={`${fmtMm(hoja.anchoMm)} × ${fmtMm(hoja.altoMm)} mm`}>
        <div className="grid grid-cols-2 gap-2">
          <NumeroMm label="Ancho" value={hoja.anchoMm} min={50} max={1000} onChange={(anchoMm) => t.cambiarHoja({ anchoMm })} />
          <NumeroMm label="Alto" value={hoja.altoMm} min={50} max={1000} onChange={(altoMm) => t.cambiarHoja({ altoMm })} />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MEDIDAS.map((m) => (
            <Btn key={m.nombre} variant="ghost" onClick={() => t.cambiarHoja({ anchoMm: m.ancho, altoMm: m.alto })}>
              {m.nombre}
            </Btn>
          ))}
        </div>
        <Opciones label="Fechas" value={hoja.separadorFecha} opciones={SEPARADORES} onChange={(separadorFecha) => t.cambiarHoja({ separadorFecha })} />
      </Plegable>

      <Plegable titulo="Foto de fondo" dato={f.fondo.src ? "con foto" : "sin foto"}>
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
      </Plegable>
    </div>
  );
}
