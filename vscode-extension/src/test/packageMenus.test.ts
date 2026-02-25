import packageJson from '../../package.json';
import { describe, expect, it } from 'vitest';

interface MenuEntry {
  command: string;
  when?: string;
}

const EXPECTED_MENU_COMMANDS = [
  'multicode.openEditor',
  'multicode.newGraph',
  'multicode.loadGraph',
  'multicode.saveGraph',
  'multicode.generateCode',
  'multicode.translateGraph'
] as const;

const LANGUAGE_WHEN = 'editorLangId == cpp || editorLangId == rust';

const getMenuEntries = (menuName: 'editor/title' | 'editor/context'): MenuEntry[] => {
  const menus = packageJson.contributes?.menus as Record<string, MenuEntry[] | undefined> | undefined;
  const entries = menus?.[menuName];
  return Array.isArray(entries) ? entries : [];
};

describe('package.json menus', () => {
  it('editor/title содержит все команды MultiCode с ожидаемым when', () => {
    const titleMenu = getMenuEntries('editor/title');

    for (const command of EXPECTED_MENU_COMMANDS) {
      const entry = titleMenu.find((item) => item.command === command);
      expect(entry, `Команда ${command} должна быть в editor/title`).toBeDefined();
      expect(entry?.when).toBe(LANGUAGE_WHEN);
    }
  });

  it('editor/context содержит все команды MultiCode с ожидаемым when', () => {
    const contextMenu = getMenuEntries('editor/context');

    for (const command of EXPECTED_MENU_COMMANDS) {
      const entry = contextMenu.find((item) => item.command === command);
      expect(entry, `Команда ${command} должна быть в editor/context`).toBeDefined();
      expect(entry?.when).toBe(LANGUAGE_WHEN);
    }
  });
});
