# ADR-089 — Auto-save del campo `image` en módulo Inventario admin

- **Status:** Accepted
- **Fecha:** 2026-05-03
- **Autores:** Brandon Buleje + Claude Opus 4.7
- **Relacionado:** `ImageBankPicker.tsx`, `InventoryTab.tsx`, `/api/upload/route.ts`, `/api/products/[id]/route.ts`
- **Supersede a:** N/A — patrón nuevo introducido tras bug report.

---

## 1. Contexto

Brandon reportó: *"al agregar imagen sea por banco o local, no se añade y demora demasiado, tengo que intentar varias veces para que se añade"*. Investigación encontró DOS bugs simultáneos:

| Bug | Causa real |
|---|---|
| **Lentitud** | `processImage()` retornaba dataUrl base64 que iba INLINE al PUT JSON (~1-5MB string) — body gigante a veces fallaba silencioso |
| **No persiste** | `editForm.image` se actualizaba pero NADA persistía hasta que el usuario clickeaba "Guardar" del modal — confusión total de UX |

## 2. Decisión

### 2.1 Upload real a Supabase Storage (no más dataUrl inline)

Reemplazar `processImage()` por nuevo helper `uploadImageFile(file)`:
- POST a `/api/upload` con `FormData`
- Backend usa Sharp + Supabase Storage
- Retorna URL pública (~200 chars)
- URL va al PUT en lugar de string base64

### 2.2 Auto-save del campo `image` apenas cambia

Nuevo helper `autoSaveImage(productId, imageUrl)`:
- Solo cuando `editModalProduct` existe (modo edit, hay productId)
- PUT inmediato a `/api/products/{id}` con `{ image: url }`
- Toast feedback ("Subiendo..." → "Imagen guardada" en <2s)
- Modal sigue abierto, usuario puede seguir editando otros campos
- Otros campos NO tienen auto-save (siguen requiring "Guardar")

### 2.3 Add modal (producto nuevo) NO usa auto-save

Razón: no hay productId aún, persiste al click "Crear producto". Solo actualiza preview + toast claro: *"Imagen seleccionada. Click Crear para guardar."*

## 3. Alternativas consideradas

| Opción | Razón de descarte |
|---|---|
| **Auto-save TODOS los campos** | Demasiado intrusivo, edits parciales se persisten antes de validación cruzada |
| **Mantener flow viejo + mejor toast** | No resolvía el bug real (lentitud + payload pesado) |
| **Solo arreglar lentitud sin auto-save** | Persistía la confusión de UX (no se aplica hasta click) |
| **Endpoint dedicado `/api/products/{id}/image`** | Overkill — PUT genérico ya soporta cambios parciales |

## 4. Consecuencias

### Positivas
- Upload local de imagen: 10-30s → **~3s** end-to-end
- Feedback inmediato (toast en cada paso)
- Banco de imágenes: sin "click Guardar" extra
- Reduce intentos múltiples por feedback poco claro

### Negativas / Riesgos
- Si `/api/upload` falla, queda preview optimista pero sin persistencia → toast lo informa
- Si `autoSaveImage` falla pero el upload OK, imagen está en Storage pero no asociada al producto → toast lo informa, el usuario puede usar "Guardar" del modal como fallback
- Más writes a la DB (1 PUT solo por imagen + 1 PUT por click "Guardar" final) — aceptable

### Patrón reutilizable
Este auto-save de campo individual puede aplicarse a otros campos que tienen UX de "preview inmediato necesario": logo del store, banner, avatar.

## 5. Verificación

- ✅ `tsc --noEmit` exit=0
- ✅ Visual: imagen se ve en preview optimista
- ✅ Toast "Imagen guardada" en ~2s
- ✅ Modal sigue abierto para seguir editando

## 6. Implementación

Commit: `7bccde52` — `fix(admin/inventario): imagen no se anadia y demoraba`

Archivos tocados:
- `components/admin/InventoryTab.tsx`: helpers `uploadImageFile()` + `autoSaveImage()`, handlers de input file (add+edit), `onPick` del ImageBankPicker
- Sin cambios en backend (`/api/upload` y `/api/products/[id]` ya soportaban este flujo)
