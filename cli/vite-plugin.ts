import { execSync } from 'child_process';
import chalk from 'chalk';

export default function soloknucklePlugin() {
  return {
    name: 'vite-plugin-soloknuckle',
    buildStart() {
      console.log(chalk.magenta('🛡️ [Soloknuckle Vite Plugin] Initiating pre-flight hygiene checks...'));
      try {
        // We run the CLI check command directly as a subprocess to ensure all standard outputs/gates are respected
        execSync('npx ts-node node_modules/soloknuckle/cli/index.ts check', { stdio: 'inherit', cwd: process.cwd() });
      } catch (err) {
        // If it fails locally where ts-node might not be available in the exact path (e.g. testing), fallback to standard npx
        try {
          execSync('npx soloknuckle check', { stdio: 'inherit', cwd: process.cwd() });
        } catch (fallbackErr) {
          console.log(chalk.red('❌ [Soloknuckle Vite Plugin] Quality gates failed! Halting build.'));
          throw fallbackErr;
        }
      }
      console.log(chalk.green('✅ [Soloknuckle Vite Plugin] All hygiene gates passed. Continuing build...'));
    }
  };
}
