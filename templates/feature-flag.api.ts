/**
 * /api/flags/[flag].ts — Next.js API route that returns whether a flag is on.
 *
 * Reads from a simple JSON file in production. Swap for Flagsmith/GrowthBook SDK
 * when you outgrow this.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

type FlagState = {
  enabled: boolean;
  allowlist?: string[];
  rolloutPercent?: number;
};

const FLAGS_FILE = path.join(process.cwd(), "flags.json");

function loadFlags(): Record<string, FlagState> {
  if (!fs.existsSync(FLAGS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FLAGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const flag = String(req.query.flag || "");
  const userEmail = String(req.query.userEmail || "");

  const flags = loadFlags();
  const state = flags[flag];

  if (!state) {
    // Default OFF — feature is invisible until you explicitly turn it on
    return res.status(200).json({ enabled: false, reason: "no-such-flag" });
  }

  if (state.allowlist?.includes(userEmail)) {
    return res.status(200).json({ enabled: true, reason: "allowlist" });
  }

  if (state.rolloutPercent && state.rolloutPercent > 0) {
    const bucket = hashToBucket(userEmail || "anon") % 100;
    return res
      .status(200)
      .json({ enabled: bucket < state.rolloutPercent, reason: "rollout" });
  }

  return res.status(200).json({ enabled: !!state.enabled });
}

function hashToBucket(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
