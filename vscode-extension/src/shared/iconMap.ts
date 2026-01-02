// Карта иконок для типов/категорий узлов
import controlIcon from '../../media/icons/control.svg';
import loopIcon from '../../media/icons/loop.svg';
import variableIcon from '../../media/icons/variable.svg';
import mathIcon from '../../media/icons/math.svg';
import logicIcon from '../../media/icons/logic.svg';
import ioIcon from '../../media/icons/io.svg';

export const ICON_MAP: Record<string, string> = {
  flow: controlIcon,
  function: controlIcon,
  variable: variableIcon,
  math: mathIcon,
  comparison: mathIcon,
  logic: logicIcon,
  io: ioIcon,
  // fallback
  other: controlIcon,
  loop: loopIcon,
};

export function getIconForCategory(category: string): string | undefined {
  return ICON_MAP[category] ?? ICON_MAP.other;
}
