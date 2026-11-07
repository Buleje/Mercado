"use client";

import { CardTitle, BlockTitle } from "@buleje/design-system";
import { PLANTILLAS } from "@/lib/contratos/plantillas";
import { cn } from "@/lib/utils";
import { Eye, Edit3 } from "@buleje/design-system/icons";
import type { EstadoContratos } from "./use-contratos";
export default function VistaEditor({ arch }: { arch: EstadoContratos }) {
  const { editorTemplate, setEditorTemplate, setEditorText, setEditorPreview, editorPreview, editorText } = arch;
  return (
    <>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Editor de Plantillas</CardTitle>
                  <select
                    aria-label="Elegir plantilla a editar"
                    value={editorTemplate?.id || ""}
                    onChange={e => {
                      const tpl = PLANTILLAS.find(p => p.id === e.target.value);
                      if (tpl) {
                        setEditorTemplate(tpl);
                        setEditorText(tpl.clausulas.join("\n\n"));
                        setEditorPreview(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Seleccionar plantilla...</option>
                    {PLANTILLAS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {editorTemplate && (
                    <button
                      onClick={() => setEditorPreview(!editorPreview)}
                      className={cn("flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                        editorPreview ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" /> {editorPreview ? "Editando" : "Preview"}
                    </button>
                  )}
                </div>

                {!editorTemplate ? (
                  <div className="text-center py-12">
                    <Edit3 className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-secondary)]">Selecciona una plantilla para editar sus clausulas</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Editor */}
                    <div className="space-y-3">
                      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
                        <p className="text-xs font-bold text-[var(--text-secondary)] mb-2">Campos disponibles (clic para insertar):</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {editorTemplate.fields.map(f => (
                            <button
                              key={f.key}
                              onClick={() => setEditorText(prev => prev + ` {{${f.key}}}`)}
                              className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20 transition-colors"
                            >
                              {`{{${f.key}}}`}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={editorText}
                          onChange={e => setEditorText(e.target.value)}
                          rows={20}
                          className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-sm text-[var(--text-primary)] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                          placeholder="Escribe o edita las clausulas del contrato..."
                        />
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 max-h-[70vh] overflow-y-auto">
                      <BlockTitle className="mb-4">Vista Previa</BlockTitle>
                      <div className="font-serif space-y-3">
                        {editorText.split("\n\n").filter(p => p.trim()).map((para, i) => (
                          <p key={i} className="text-sm text-[var(--text-secondary)] text-justify leading-relaxed">
                            {para.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                              const field = editorTemplate.fields.find(f => f.key === key);
                              return `[${field?.label || key}]`;
                            })}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
    </>
  );
}