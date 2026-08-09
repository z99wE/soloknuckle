/**
 * FeatureFlag.tsx — drop-in React component.
 *
 * Wrap any UI like:
 *   <FeatureFlag flag="export-csv">
 *     <ExportButton />
 *   </FeatureFlag>
 *
 * The flag is OFF by default. Turn it on for yourself via:
 *   localStorage.setItem('ff:export-csv', 'on')
 * or via the Flagsmith/GrowthBook dashboard.
 */
import React from "react";

type Props = {
  flag: string;
  userEmail?: string;
  allowlist?: string[]; // emails that always see this flag ON
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

const FOUNDER_EMAIL = process.env.NEXT_PUBLIC_FOUNDER_EMAIL || "";

export function FeatureFlag({
  flag,
  userEmail,
  allowlist = [],
  fallback = null,
  children,
}: Props) {
  // Local override (fastest path — open browser console and run):
  //   localStorage.setItem('ff:' + 'export-csv', 'on')
  const localOverride =
    typeof window !== "undefined"
      ? localStorage.getItem(`ff:${flag}`)
      : null;

  if (localOverride === "on") return <>{children}</>;
  if (localOverride === "off") return <>{fallback}</>;

  // Founder / allowlist always sees it
  const emails = [FOUNDER_EMAIL, ...allowlist].filter(Boolean);
  if (userEmail && emails.includes(userEmail)) return <>{children}</>;

  // Remote flag service (Flagsmith / GrowthBook)
  // Falls back to OFF if service unreachable.
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/flags/${flag}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setEnabled(!!d.enabled))
      .catch(() => !cancelled && setEnabled(false));
    return () => {
      cancelled = true;
    };
  }, [flag]);

  return enabled ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook version for inline logic (not just UI):
 *
 *   const canExport = useFeatureFlag('export-csv', user.email);
 *   if (canExport) doExport();
 */
export function useFeatureFlag(flag: string, userEmail?: string): boolean {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const local = localStorage.getItem(`ff:${flag}`);
      if (local === "on") {
        setEnabled(true);
        return;
      }
      if (local === "off") {
        setEnabled(false);
        return;
      }
    }
    const emails = [FOUNDER_EMAIL].filter(Boolean);
    if (userEmail && emails.includes(userEmail)) {
      setEnabled(true);
      return;
    }
    fetch(`/api/flags/${flag}`)
      .then((r) => r.json())
      .then((d) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false));
  }, [flag, userEmail]);

  return enabled;
}
