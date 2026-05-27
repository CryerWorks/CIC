/** The bounded set of Domain colors (FR-015), mirroring the `--color-domain-1..5` theme tokens.
 *  A fixed palette keeps domains visually coherent and legible (no free-form picker). */
export interface PaletteColor {
  label: string;
  hex: string;
}

export const DOMAIN_PALETTE: PaletteColor[] = [
  { label: "Purple", hex: "#8b6cef" },
  { label: "Blue", hex: "#4c8dff" },
  { label: "Green", hex: "#44cf6e" },
  { label: "Amber", hex: "#e0a72e" },
  { label: "Red", hex: "#fb464c" },
];

export const PALETTE_HEXES = DOMAIN_PALETTE.map((c) => c.hex);

export const DEFAULT_DOMAIN_COLOR = DOMAIN_PALETTE[0].hex;
