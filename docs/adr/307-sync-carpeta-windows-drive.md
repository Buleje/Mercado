# ADR-307 — Sincronizar una carpeta de Windows con el Drive del panel

- **Estado:** aceptado
- **Fecha:** 2026-07-28
- **Decide:** Brandon
- **Área:** documentos / drive · integración de escritorio

## Contexto

El Drive del panel (`/admin?tab=documentos`) se maneja solo por navegador: arrastrar
archivos, subirlos de a uno o importar una carpeta. Brandon pidió trabajar **al revés**:
tener una carpeta en su Windows y que lo que haga ahí —crear, editar, renombrar, mover,
borrar— aparezca en el panel, y que lo que suba desde el panel o el celular baje a esa
carpeta.

Restricciones reales del terreno:

1. **El navegador no puede vigilar una carpeta del disco.** La File System Access API pide
   permiso por sesión, solo anda en Chrome/Edge y muere al cerrar la pestaña. No sirve para
   algo que tiene que correr siempre.
2. **WSL no recibe eventos de `/mnt/c`.** inotify no se entera de los cambios que hace
   Windows sobre esa ruta; habría que pollear el árbol entero. Un agente que corra del lado
   de Windows sí recibe eventos nativos e instantáneos.
3. **`requireAdmin` es solo cookie + CSRF.** Un proceso de escritorio no tiene sesión de
   navegador. Existe `lib/api-keys.ts` (`validateApiKey`, modelo `ApiKey`) y `proxy.ts` ya
   deja pasar `Bearer sk_`, pero **ningún endpoint lo usa todavía**.
4. Los archivos viven en Supabase Storage, no en disco local.

## Decisión

**Un agente local que corre en Windows y habla con endpoints `/api/sync/*` autenticados por
API key.**

### 1. Autenticación separada, sin tocar `requireAdmin`

`requireAdmin` y `proxy.ts` son zona de peligro (auth + CSP + rate limit + multi-tenant). En
vez de extenderlos, los endpoints de sync usan `lib/sync/auth-agente.ts`, que valida
`Bearer sk_…` contra `validateApiKey()` y devuelve `tenantId`. El blast radius de un error
queda contenido en `/api/sync/*` y no puede debilitar el login del panel.

CSRF no aplica: es double-submit cookie, defensa contra un navegador con sesión abierta. Un
agente sin cookies no es vulnerable a CSRF, y su credencial es el Bearer.

### 2. Sin cambios de schema

La tentación era agregar `syncHash`/`syncPath` a `Document`. Se descartó: `prisma/schema.prisma`
son 189 modelos en zona de peligro y las migraciones contra el pooler necesitan
`DIRECT_URL`, que en esta red falla por DNS.

En su lugar, la **firma de cambio** sale de lo que ya existe:

| Lado | Cómo detecta que algo cambió |
|---|---|
| Local (Windows) | SHA-256 del archivo, comparado contra el hash guardado en el manifiesto local |
| Remoto (panel) | `Document.updatedAt` + `size`, comparados contra los del manifiesto local |

El agente guarda su estado en `.buleje-sync.json` dentro de la carpeta. Si ese archivo se
pierde, el mapeo se reconstruye por ruta lógica (`carpeta/sub/nombre.pdf`), que es
determinística.

### 3. La ruta de Windows es la ruta del Drive

`Boletas/2026/enero.pdf` en la carpeta ⇄ carpeta `Boletas` → `2026` → documento `enero.pdf`.
Las carpetas intermedias se crean con `DocumentsDB.createFolderTree`, que ya deduplica por
`(padre, nombre en minúscula)`.

### 4. Editar = versión nueva, borrar = papelera

- Editar un archivo en Windows llama a `DocumentsDB.addVersion`: **el contenido anterior no
  se pierde**, queda en el historial de versiones del Drive.
- Borrar en Windows llama a `DocumentsDB.softDelete` (`deletedAt`), **no** `hardDelete`.
  Decisión explícita de Brandon: si el agente se equivoca o Windows hace algo raro, los
  documentos del negocio se recuperan desde la papelera.

### 5. Conflictos: no se pisa nada

Si el mismo documento cambió de los dos lados entre dos corridas, el agente **no elige
ganador**. Sube el local como versión nueva y deja el remoto en un archivo hermano
`nombre (del panel).ext`. Las dos versiones sobreviven y la persona decide.

## Consecuencias

**A favor**
- Funciona con la carpeta cerrada y el navegador cerrado.
- Editar en Windows deja historial de versiones en el panel, gratis.
- Cablea `validateApiKey`, que estaba construido y sin usar.
- Cero cambios en schema, `requireAdmin` y `proxy.ts`.

**En contra / riesgos**
- Hay que instalar y mantener un proceso en la PC de Brandon.
- Una API key filtrada da acceso de escritura al Drive de ese tenant. Mitigación: las keys se
  revocan desde el panel (`revokeApiKey`) y se ven con prefijo + último uso.
- El primer arranque sube toda la carpeta: por eso se eligió una carpeta nueva y vacía
  (`C:\Users\Usuario\Buleje-Drive`) en vez de vincular Documentos o Escritorio.
- Sin bloqueo distribuido: dos agentes apuntando a la misma carpeta se pisarían. Un solo
  equipo por ahora.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **WebDAV** (montar el Drive como unidad `Z:`) | No hay copia local: sin internet no hay archivos. El cliente WebDAV de Windows es lento con archivos grandes y quisquilloso con la auth. Además exigiría implementar el protocolo entero sobre Supabase Storage. |
| **File System Access API** en el navegador | Muere al cerrar la pestaña; sin eventos reales de filesystem. No es "trabajar en la carpeta", es "tener la pestaña abierta". |
| **Agente en WSL sobre `/mnt/c`** | inotify no ve los cambios de Windows; obligaría a polling permanente del árbol. |
| **Extender `requireAdmin` con API keys** | Toca la zona de peligro de auth para todo el sistema, cuando solo lo necesitan 5 endpoints. |

## Referencias

- `lib/api-keys.ts` — `validateApiKey`, `createApiKey`, `revokeApiKey`
- `lib/db/documents.db.ts` — `createFolderTree`, `addVersion`, `softDelete`
- `proxy.ts` §5 — pass-through de `Bearer sk_`
- ADR-306 — límites del importador de carpetas del Drive
