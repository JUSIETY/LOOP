// Vite supplies these values at build time. The Sites build keeps same-origin
// API requests; the Pages build can point its static UI at the hosted API.
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL || "/"}${path.replace(/^\//, "")}`;
}
