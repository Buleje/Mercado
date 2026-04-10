import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SKILLS_DIR = path.resolve(__dirname, '../../.github/skills')
const AGENTS_DIR = path.resolve(__dirname, '../../.github/agents')

const skillsDirExists = fs.existsSync(SKILLS_DIR)

describe('Skills structure validation', () => {
  const skillFiles = skillsDirExists
    ? fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.instructions.md'))
    : []

  it('should have .github/skills directory', () => {
    expect(skillsDirExists).toBe(true)
  })

  it('should have at least 15 skill files', () => {
    if (!skillsDirExists) return
    expect(skillFiles.length).toBeGreaterThanOrEqual(15)
  })

  skillFiles.forEach(file => {
    describe(`Skill: ${file}`, () => {
      const filePath = path.join(SKILLS_DIR, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const stats = fs.statSync(filePath)

      it('should not be empty', () => {
        expect(content.trim().length).toBeGreaterThan(0)
      })

      it('should contain a level-1 heading', () => {
        expect(content).toMatch(/^# .+/m)
      })

      it('should contain a blockquote with trigger pattern info', () => {
        expect(content).toMatch(/^> .+/m)
      })

      it('should contain a "Contexto" section', () => {
        const hasContexto =
          /^## Contexto del proyecto/m.test(content) ||
          /^## Contexto/m.test(content)
        expect(hasContexto).toBe(true)
      })

      it('should contain a "Reglas" section', () => {
        const hasReglas =
          /^## Reglas fundamentales/m.test(content) ||
          /^## Reglas/m.test(content)
        expect(hasReglas).toBe(true)
      })

      it('should contain a "Patrones" section', () => {
        const hasPatrones =
          /^## Patrones aprobados/m.test(content) ||
          /^## Patrones/m.test(content)
        expect(hasPatrones).toBe(true)
      })

      it('should contain a "Checklist" section', () => {
        expect(content).toMatch(/^## Checklist/m)
      })

      it('should be between 1KB and 20KB', () => {
        expect(stats.size).toBeGreaterThanOrEqual(1024)
        expect(stats.size).toBeLessThanOrEqual(20 * 1024)
      })
    })
  })
})

describe('Agents structure validation', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent.md'))

  it('should have at least 10 agent files', () => {
    expect(agentFiles.length).toBeGreaterThanOrEqual(10)
  })

  agentFiles.forEach(file => {
    describe(`Agent: ${file}`, () => {
      const filePath = path.join(AGENTS_DIR, file)
      const content = fs.readFileSync(filePath, 'utf-8')

      it('should not be empty', () => {
        expect(content.trim().length).toBeGreaterThan(0)
      })

      it('should contain a level-1 heading', () => {
        expect(content).toMatch(/^# .+/m)
      })

      it('should contain a "Rol" section', () => {
        const hasRol =
          /^## Rol/m.test(content) ||
          /^# Rol/m.test(content) ||
          /^# Role/m.test(content)
        expect(hasRol).toBe(true)
      })

      it('should contain a "Responsabilidades" section', () => {
        const hasResponsabilidades =
          /^## Responsabilidades/m.test(content) ||
          /^# Mission/m.test(content)
        expect(hasResponsabilidades).toBe(true)
      })

      it('should contain a "Skills vinculados" section', () => {
        const hasSkills =
          /^## Skills vinculados/m.test(content) ||
          /^# Skills vinculados/m.test(content)
        expect(hasSkills).toBe(true)
      })

      it('should contain a "Cuando invocar" or "Criterios" section', () => {
        const hasCuando =
          /^## Cuándo invocar/m.test(content) ||
          /^## Criterios/m.test(content) ||
          /^## Criterios de éxito/m.test(content) ||
          /^# Doctrine/m.test(content)
        expect(hasCuando).toBe(true)
      })
    })
  })
})
