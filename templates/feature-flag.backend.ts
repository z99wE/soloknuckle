/**
 * featureFlag.ts — server-side flag check for backend (Node/Express/Next API).
 *
 *   if (await isEnabled('export-csv', { userEmail: user.email })) {
 *     return generateCsv(rows);
 *   }
 */
import fs from "fs";
import path from "path";

const FLAGS_FILE = path.join(process.cwd(), "flags.json");

type FlagState = {
  enabled?: boolean;
  allowlist?: string[];
  rolloutPercent?: number;
};

function loadFlags(): Record<string, FlagState> {
  try {
    return JSON.parse(fs.readFileSync(FLAGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function isEnabled(
  flag: string,
  ctx: { userEmail?: string; userId?: string } = {}
): Promise<boolean> {
  const flags = loadFlags();
  const state = flags[flag];
  if (!state) return false;

  if (state.allowlist?.includes(ctx.userEmail || "")) return true;

  if (state.rolloutPercent && state.rolloutPercent > 0) {
    const bucket = hashToBucket(ctx.userId || ctx.userEmail || "anon") % 100;
    return bucket < state.rolloutPercent;
  }

  return !!state.enabled;
}

function hashToBucket(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
