Iniciar una nueva feature con branch aislada en Bodega San Martín.

## Pasos

1. **Preguntar** el nombre de la feature (si no se proporcionó como argumento)

2. **Crear branch** desde main/master:
   ```bash
   git checkout master && git pull
   git checkout -b feat/<nombre-feature>
   ```

3. **Diagnosticar** qué archivos se verán afectados:
   - Leer skills relevantes de `.github/skills/`
   - Identificar componentes, API routes, DB classes involucrados
   - Verificar si toca alguna zona de peligro

4. **Proponer plan** de implementación al usuario antes de codificar

## Reglas
- Siempre crear branch desde master actualizado
- Nombrar branch: `feat/<nombre>`, `fix/<nombre>`, `refactor/<nombre>`
- Diagnosticar antes de codificar
- Si toca zona de peligro, advertir al usuario
