// Карта иконок для типов/категорий узлов
// Храним относительные пути к файлам иконок внутри расширения
export const ICON_MAP: Record<string, string> = {
  flow: 'media/icons/control.svg',
  function: 'media/icons/control.svg',
  variable: 'media/icons/variable.svg',
  math: 'media/icons/math.svg',
  comparison: 'media/icons/math.svg',
  logic: 'media/icons/logic.svg',
  io: 'media/icons/io.svg',
  // fallback
  other: 'media/icons/control.svg',
  loop: 'media/icons/loop.svg',
};

export function getIconForCategory(category: string): string | undefined {
  return ICON_MAP[category] ?? ICON_MAP.other;
}
