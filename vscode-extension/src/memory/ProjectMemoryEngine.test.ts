// @vitest-environment node

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectMemoryEngine } from './ProjectMemoryEngine';

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'multicode-memory-engine-'));
  tempDirs.push(dir);
  return dir;
};

const writeFile = async (targetPath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const createWorkspaceFixture = async (): Promise<{
  workspaceRoot: string;
  storageRoot: string;
  architecturePath: string;
}> => {
  const workspaceRoot = await makeTempDir();
  const storageRoot = path.join(workspaceRoot, '.storage');
  const architecturePath = path.join(workspaceRoot, 'Документы', 'Архитектура', 'README.md');

  await writeFile(
    path.join(workspaceRoot, 'Документы', 'README.md'),
    `# Документация

## Актуальные документы
| Файл | Назначение |
| --- | --- |
| [ProjectStatus](ProjectStatus.md) | Статус |
| [Архитектура](Архитектура/README.md) | Карта |

## Архив
`
  );
  await writeFile(path.join(workspaceRoot, 'README.md'), '# MultiCode\n\nКраткий обзор.');
  await writeFile(path.join(workspaceRoot, 'ROADMAP.md'), '# Roadmap\n\nПлан работ.');
  await writeFile(path.join(workspaceRoot, 'AI_AGENTS_GUIDE.md'), '# Guide\n\nПрактика для агентов.');
  await writeFile(path.join(workspaceRoot, 'CODING_GUIDELINES.md'), '# Guidelines\n\nПравила кода.');
  await writeFile(path.join(workspaceRoot, 'Документы', 'ProjectStatus.md'), '# Status\n\nТекущий статус модулей.');
  await writeFile(
    architecturePath,
    `# Архитектура

## Сериализация
Источник истины сериализации .multicode находится в serializer.ts и архитектурной документации.
`
  );
  await writeFile(
    path.join(workspaceRoot, 'vscode-extension', 'src', 'shared', 'serializer.ts'),
    `// Цель: source of truth для serializer .multicode
// NOTE: изменения схемы должны сопровождаться миграцией
export const GRAPH_SCHEMA_VERSION = 3;
`
  );
  await writeFile(
    path.join(workspaceRoot, 'include', 'visprog', 'core', 'ErrorCodes.hpp'),
    `// Цель: стабильные коды ошибок
// INVARIANT: значения не менять без миграции тестов
`
  );
  await writeFile(
    path.join(workspaceRoot, 'vscode-extension', 'src', 'panel', 'dummy.ts'),
    `/**
 * Panel coordination contract.
 */
export const PANEL_DUMMY = true;
`
  );

  return { workspaceRoot, storageRoot, architecturePath };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('ProjectMemoryEngine', () => {
  it('переиспользует неизменённый индекс и перестраивает изменённый документ', async () => {
    const fixture = await createWorkspaceFixture();
    const engine = new ProjectMemoryEngine({
      workspaceRoot: fixture.workspaceRoot,
      storageRoot: fixture.storageRoot,
    });

    const first = await engine.reindex();
    const second = await engine.reindex();

    expect(first.rebuiltDocuments).toBeGreaterThan(0);
    expect(second.rebuiltDocuments).toBe(0);
    expect(second.reusedDocuments).toBeGreaterThan(0);

    await sleep(25);
    await writeFile(
      fixture.architecturePath,
      `# Архитектура

## Сериализация
Источник истины сериализации .multicode находится в serializer.ts, архитектурной документации и golden tests.
`
    );

    const third = await engine.reindex({ sourcePath: fixture.architecturePath });
    expect(third.rebuiltDocuments).toBeGreaterThanOrEqual(1);
  });

  it('возвращает canonical docs и code notes выше advisory summary', async () => {
    const fixture = await createWorkspaceFixture();
    const engine = new ProjectMemoryEngine({
      workspaceRoot: fixture.workspaceRoot,
      storageRoot: fixture.storageRoot,
    });

    await engine.reindex();
    const record = await engine.saveSessionSummary({
      title: 'Временная заметка',
      summary: 'Источник истины сериализации .multicode обсуждался в сессии и не должен перекрывать docs.',
    });

    const pack = await engine.search({
      text: 'источник истины сериализации .multicode',
      limit: 8,
    });

    expect(record.id.length).toBeGreaterThan(0);
    expect(pack.hits.length).toBeGreaterThanOrEqual(2);
    expect(pack.hits[0].authority).toBe('canonical');
    expect(pack.hits.some((hit) => hit.authority === 'advisory')).toBe(true);
    expect(pack.hits.some((hit) => hit.kind === 'code_note')).toBe(true);
  });
});
