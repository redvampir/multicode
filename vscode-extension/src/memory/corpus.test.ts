// @vitest-environment node

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractCodeNotesFromText, parseActiveDocumentLinks } from './corpus';

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'multicode-memory-corpus-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('memory/corpus', () => {
  it('парсит только активные markdown-ссылки из docs manifest', async () => {
    const workspaceRoot = await makeTempDir();
    const docsReadmePath = path.join(workspaceRoot, 'Документы', 'README.md');
    const markdown = `# Документация

## Актуальные документы
| Файл | Назначение |
| --- | --- |
| [README](../README.md) | Обзор |
| [Архитектура](Архитектура/README.md) | Карта |

## Архив
| [Old](Архив/old.md) | Старое |
`;

    const paths = parseActiveDocumentLinks(markdown, docsReadmePath, workspaceRoot);

    expect(paths).toEqual([
      path.join(workspaceRoot, 'README.md'),
      path.join(workspaceRoot, 'Документы', 'Архитектура', 'README.md'),
    ]);
  });

  it('достаёт top comment, jsdoc и marker notes из code file', () => {
    const text = `// Цель: хранить правила сериализации .multicode
// NOTE: top level contract

/**
 * Source of truth для schemaVersion.
 */
export const GRAPH_SCHEMA_VERSION = 3;

/* DANGER: не менять без миграции */
const hidden = true;
`;

    const chunks = extractCodeNotesFromText(text);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].headingPath).toEqual(['top-of-file']);
    expect(chunks.some((chunk) => chunk.headingPath[0] === 'GRAPH_SCHEMA_VERSION')).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes('DANGER'))).toBe(true);
  });
});
