Crear un commit con mensaje Conventional Commits para los cambios actuales en Bodega San Martín.

## Pasos

1. **Analizar qué cambió:**
```bash
cd bodega-san-martin
git status
git diff --staged
git diff
```

2. **Clasificar el tipo de cambio:**
   - `feat` — nueva funcionalidad visible para el usuario
   - `fix` — corrección de bug
   - `refactor` — cambio interno sin comportamiento nuevo ni corrección
   - `test` — agregar o modificar tests
   - `chore` — tareas de mantenimiento, dependencias, configuración
   - `docs` — solo documentación
   - `perf` — mejora de rendimiento
   - `style` — formato, espacios, nombres (sin lógica)

3. **Identificar el scope** (opcional, entre paréntesis):
   - Ejemplos: `checkout`, `inventory`, `auth`, `api`, `admin`, `cart`, `db`

4. **Construir el mensaje** (máx 72 caracteres en la primera línea):
   ```
   tipo(scope): descripción en español, modo imperativo
   ```
   Ejemplos correctos:
   - `feat(checkout): agregar validación de cupones al paso 2`
   - `fix(inventory): corregir campo expiryDate en lote FEFO`
   - `refactor(auth): extraer lógica de tenantId a helper`
   - `chore: actualizar dependencias de seguridad`

5. **Hacer staging de archivos relevantes** — NO usar `git add .` a ciegas:
```bash
git add <archivo1> <archivo2>
# Si hay duda, revisar primero con: git diff <archivo>
```

6. **Crear el commit:**
```bash
git commit -m "tipo(scope): descripción"
```

7. **Confirmar** al usuario el commit creado con hash y mensaje.

## Reglas

- Nunca hacer commit de `.env*` ni archivos con secrets
- Si hay cambios en `prisma/schema.prisma`, incluir `chore(db): regenerar cliente Prisma` como segundo commit si aplica
- Si hay múltiples cambios independientes, sugerir separarlos en commits distintos
- `BREAKING CHANGE:` en el cuerpo si la API pública cambia de forma incompatible
