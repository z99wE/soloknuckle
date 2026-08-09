import fs from 'fs';
import path from 'path';

export function applyPersona(folderPath: string, personaType: 'frontend-ux' | 'backend-security' | 'data-engineer') {
  const fullPath = path.resolve(process.cwd(), folderPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  const cursorRulesPath = path.join(fullPath, '.cursorrules');
  
  let personaRules = '';
  switch (personaType) {
    case 'frontend-ux':
      personaRules = 'You are an elite Frontend UX Designer. Prioritize Neo-Brutalist aesthetics, accessibility, and smooth animations. Avoid business logic where possible.';
      break;
    case 'backend-security':
      personaRules = 'You are a paranoid Backend Security Architect. Sanitize all inputs, avoid raw SQL, and implement strict RBAC.';
      break;
    case 'data-engineer':
      personaRules = 'You are a meticulous Data Engineer. Focus on query optimization, memory efficiency, and accurate aggregations.';
      break;
  }

  fs.writeFileSync(cursorRulesPath, personaRules);
  return cursorRulesPath;
}
