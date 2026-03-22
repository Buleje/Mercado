---
name: new-feature
description: Iniciar una nueva feature con branch aislada. Usar cuando el usuario quiera crear una funcionalidad nueva, iniciar desarrollo de algo nuevo, o arrancar una tarea de feature.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
argument-hint: [nombre-de-feature]
---

# New Feature — Bodega San Martin

Iniciar una nueva feature con branch aislada en el proyecto Bodega San Martin.

## Argumentos

- `$ARGUMENTS` — nombre de la feature (ej: "filtro-por-categoria", "notificaciones-push")

Si `$ARGUMENTS` esta vacio, PREGUNTAR al usuario el nombre de la feature antes de continuar.

## Pasos

### 1. Validar nombre de feature

El nombre proporcionado es: **$ARGUMENTS**

Normalizar el nombre:
- Convertir a minusculas
- Reemplazar espacios por guiones
- Eliminar caracteres especiales

### 2. Crear branch desde master actualizado

```bash
cd bodega-san-martin
git checkout master
git pull origin master
git checkout -b feat/$ARGUMENTS
```

Si el branch ya existe, ADVERTIR al usuario y preguntar si desea continuar en ese branch o crear uno nuevo con sufijo.

### 3. Diagnosticar impacto

Antes de codificar, analizar que archivos y modulos se veran afectados:

- Buscar componentes relacionados en `components/`
- Buscar API routes relacionadas en `app/api/`
- Buscar DB classes relacionadas en `lib/db/`
- Leer skills relevantes de `.github/skills/` si existen para el dominio
- Verificar si la feature toca alguna **zona de peligro** (ver CLAUDE.md):
  - `CheckoutModal.tsx` (119 KB) — pagos, cupones, reservas
  - `role-permissions.ts` — permisos RBAC
  - `orders.db.ts` — idempotency, state machine
  - `schema.prisma` — requiere migracion
  - `cart-context.tsx` — BroadcastChannel + localStorage

Si toca zona de peligro: ADVERTIR al usuario con detalle de por que es peligroso.

### 4. Proponer plan de implementacion

Presentar al usuario un plan estructurado:

| # | Archivo/Modulo | Accion | Riesgo |
|---|---------------|--------|--------|
| 1 | ... | crear/modificar/eliminar | bajo/medio/alto |
| 2 | ... | ... | ... |

Esperar confirmacion del usuario antes de empezar a codificar.

## Reglas

- SIEMPRE crear branch desde master actualizado
- Convenciones de branch: `feat/<nombre>`, `fix/<nombre>`, `refactor/<nombre>`
- Diagnosticar ANTES de codificar — nunca al reves
- Si toca zona de peligro, advertir SIEMPRE
- Si requiere cambios en schema.prisma, incluir paso de migracion en el plan
- Seguir todas las reglas criticas de CLAUDE.md (safeParse, tenantId, DB classes, etc.)
