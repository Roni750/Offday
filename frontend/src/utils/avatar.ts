/** One hue per user, as in the design (initials on `oklch(0.92 0.045 H)`). */
const HUES = [300, 120, 20, 230, 60, 180, 340, 90] as const;

export function hueFor(id: number): number {
  return HUES[(((id - 1) % HUES.length) + HUES.length) % HUES.length] ?? HUES[0];
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
