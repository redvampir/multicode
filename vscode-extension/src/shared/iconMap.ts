// Карта иконок для типов/категорий узлов
// Пути относительно media/ — для webview разрешаются через __MULTICODE_MEDIA_BASE_URI__

const ICON_PATHS: Record<string, string> = {
  flow: 'icons/control.svg',
  function: 'icons/control.svg',
  variable: 'icons/variable.svg',
  math: 'icons/math.svg',
  comparison: 'icons/math.svg',
  logic: 'icons/logic.svg',
  io: 'icons/io.svg',
  other: 'icons/control.svg',
  loop: 'icons/loop.svg',
};

declare global {
  interface Window {
    __MULTICODE_MEDIA_BASE_URI__?: string;
  }
}

function resolveIconUri(relativePath: string): string {
  const base = (typeof window !== 'undefined' && window.__MULTICODE_MEDIA_BASE_URI__) || 'media';
  return `${base}/${relativePath}`;
}

/** @deprecated Используй ICON_PATHS напрямую для обратной совместимости */
export const ICON_MAP: Record<string, string> = new Proxy(ICON_PATHS, {
  get(target, prop: string) {
    const path = target[prop] ?? target.other;
    return path ? resolveIconUri(path) : undefined;
  }
});

export function getIconForCategory(category: string): string | undefined {
  const path = ICON_PATHS[category] ?? ICON_PATHS.other;
  return path ? resolveIconUri(path) : undefined;
}
