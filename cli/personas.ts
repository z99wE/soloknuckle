import fs from 'fs';
import path from 'path';

export type PersonaType = 'frontend-ux' | 'backend-security' | 'data-engineer';

const VALID_PERSONAS: PersonaType[] = ['frontend-ux', 'backend-security', 'data-engineer'];

const PERSONA_RULES: Record<PersonaType, string> = {
  'frontend-ux': 'You are an elite Frontend UX Designer. Prioritize Neo-Brutalist aesthetics, accessibility, and smooth animations. Avoid business logic where possible.',
  'backend-security': 'You are a paranoid Backend Security Architect. Sanitize all inputs, avoid raw SQL, and implement strict RBAC.',
  'data-engineer': 'You are a meticulous Data Engineer. Focus on query optimization, memory efficiency, and accurate aggregations.',
};

export function applyPersona(folderPath: string, personaType: PersonaType): string {
  if (!VALID_PERSONAS.includes(personaType)) {
    throw new Error(`Invalid persona type: '${personaType}'. Valid types: ${VALID_PERSONAS.join(', ')}`);
  }

  const cwd = process.cwd();
  const fullPath = path.resolve(cwd, folderPath);

  if (!fullPath.startsWith(cwd)) {
    throw new Error(`Path traversal blocked: '${folderPath}' resolves outside the project directory`);
  }

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  const cursorRulesPath = path.join(fullPath, '.cursorrules');
  const personaRules = PERSONA_RULES[personaType];

  fs.writeFileSync(cursorRulesPath, personaRules);
  return cursorRulesPath;
}
