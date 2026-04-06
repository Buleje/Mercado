---
name: commit
description: Crear un commit con mensaje Conventional Commits para los cambios actuales. Usar cuando el usuario quiera guardar cambios, hacer commit, o commitear.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: [mensaje-opcional]
---

# Commit — Buleje

Crear un commit con mensaje Conventional Commits para los cambios actuales en el proyecto Buleje.

## Argumentos

- `$ARGUMENTS` — mensaje de commit opcional. Si se proporciona, usarlo como base para el mensaje. Si esta vacio, generar automaticamente analizando los cambios.

## Pasos

### 1. Analizar cambios actuales

```bash
cd buleje
git status
git diff --staged
git diff
```

Revisar que archivos fueron modificados, agregados o eliminados.

### 2. Clasificar el tipo de cambio

Determinar el tipo segun Conventional Commits:

| Tipo | Cuando usar |
|------|-------------|
| `feat` | Nueva funcionalidad visible para el usuario |
| `fix` | Correccion de bug |
| `refactor` | Cambio interno sin comportamiento nuevo ni correccion |
| `test` | Agregar o modificar tests |
| `chore` | Mantenimiento, dependencias, configuracion |
| `docs` | Solo documentacion |
| `perf` | Mejora de rendimiento |
| `style` | Formato, espacios, nombres (sin logica) |

### 3. Identificar el scope (opcional)

Determinar el scope entre parentesis basado en los archivos modificados:
- `checkout` — archivos de checkout/pago
- `inventory` — inventario, stock, productos
- `auth` — autenticacion, permisos, roles
- `api` — route handlers
- `admin` — panel de administracion
- `cart` — carrito de compras
- `db` — schema, migraciones, DB classes
- `ui` — componentes visuales generales
- `config` — configuracion del proyecto

### 4. Construir el mensaje

Si `$ARGUMENTS` fue proporcionado, usarlo como mensaje (ajustandolo al formato si es necesario).

Si no, generar automaticamente siguiendo este formato:
```
tipo(scope): descripcion en espanol, modo imperativo
```

Reglas del mensaje:
- Maximo 72 caracteres en la primera linea
- En espanol
- Modo imperativo (agregar, corregir, actualizar — no "agregado", "corregido")
- Sin punto final

Ejemplos correctos:
- `feat(checkout): agregar validacion de cupones al paso 2`
- `fix(inventory): corregir campo expiryDate en lote FEFO`
- `refactor(auth): extraer logica de tenantId a helper`
- `chore: actualizar dependencias de seguridad`

### 5. Staging selectivo

Agregar archivos al staging de forma selectiva:

```bash
git add <archivo1> <archivo2> ...
```

**NUNCA usar `git add .` ni `git add -A` a ciegas.**

Revisar antes de agregar:
- NO agregar `.env*` ni archivos con secrets
- NO agregar archivos temporales o de cache
- Si hay duda sobre un archivo, revisar con `git diff <archivo>` primero

### 6. Crear el commit

```bash
git commit -m "tipo(scope): descripcion"
```

Si los cambios merecen un cuerpo explicativo, usar formato multi-linea:
```bash
git commit -m "tipo(scope): descripcion corta" -m "Explicacion detallada del cambio..."
```

### 7. Confirmar al usuario

Mostrar:
- Hash del commit
- Mensaje completo
- Archivos incluidos

## Reglas criticas

- **NUNCA** hacer commit de `.env*` ni archivos con secrets
- Si hay cambios en `prisma/schema.prisma`, considerar commit separado: `chore(db): actualizar schema y regenerar cliente Prisma`
- Si hay multiples cambios independientes, sugerir separarlos en commits distintos
- Usar `BREAKING CHANGE:` en el cuerpo si la API publica cambia de forma incompatible
- Si el mensaje proporcionado en `$ARGUMENTS` no sigue Conventional Commits, adaptarlo al formato correcto
