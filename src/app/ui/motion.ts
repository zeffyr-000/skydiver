/**
 * Should the kit skip its animations? The app publishes the player's choice on
 * `<html data-motion>`; without it (specs, before boot) the OS preference rules.
 */
export function reducedMotion(): boolean {
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset['motion'] : '';
  if (attr) {
    return attr === 'reduced';
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
