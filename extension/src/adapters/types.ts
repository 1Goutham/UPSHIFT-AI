import type { PlatformId } from "../../../src/lib/refine/platforms";

/**
 * Everything site-specific lives behind this interface. The overlay never
 * touches a site selector directly.
 */
export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  /** The prompt box, if one is on screen. */
  findComposer(doc: Document): HTMLElement | null;
  read(el: HTMLElement): string;
  /**
   * Replace the composer's text. Resolves true only if reading the composer
   * back afterwards returns the new text (no assumed success).
   */
  write(el: HTMLElement, text: string): Promise<boolean>;
}
