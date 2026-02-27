/**
 * Цель: безопасный парсинг и патчинг блоков multicode:begin/end в исходных файлах.
 * Инварианты:
 * - Маркеры должны идти парами begin/end без вложенности.
 * - Внутренний сегмент блока заменяется целиком, внешние строки не меняются.
 * - Идентификатор блока (id) у begin/end должен совпадать, если указан с обеих сторон.
 * Риски:
 * - Нестандартные/повреждённые маркеры приводят к ошибке вместо частичной перезаписи.
 * - Разный стиль переноса строк (LF/CRLF) должен сохраняться.
 * Проверка:
 * - npm run test:unit -- src/panel/codeBinding.test.ts
 */

export interface ParsedBindingBlock {
  id?: string;
  beginLine: number;
  endLine: number;
  beginLineText: string;
  endLineText: string;
  contextPreview: string;
}

export interface BindingParseError {
  kind:
    | 'ORPHAN_END'
    | 'NESTED_BEGIN'
    | 'UNCLOSED_BEGIN'
    | 'MISMATCHED_IDS';
  line: number;
  message: string;
}

export interface BindingParseResult {
  success: boolean;
  blocks: ParsedBindingBlock[];
  error?: BindingParseError;
}

interface OpenBlock {
  id?: string;
  beginLine: number;
  beginLineText: string;
}

const beginPattern = /^\s*\/\/\s*multicode:begin(?:\s+(.+?))?\s*$/;
const endPattern = /^\s*\/\/\s*multicode:end(?:\s+(.+?))?\s*$/;

const parseMarkerId = (raw: string | undefined): string | undefined => {
  const normalized = raw?.trim();
  return normalized ? normalized : undefined;
};

export const parseBindingBlocks = (sourceText: string): BindingParseResult => {
  const lines = sourceText.split(/\r?\n/);
  const blocks: ParsedBindingBlock[] = [];
  let openBlock: OpenBlock | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const beginMatch = line.match(beginPattern);

    if (beginMatch) {
      if (openBlock) {
        return {
          success: false,
          blocks,
          error: {
            kind: 'NESTED_BEGIN',
            line: index + 1,
            message: `Найден вложенный маркер begin на строке ${index + 1}. Сначала закройте блок на строке ${openBlock.beginLine}.`
          }
        };
      }

      openBlock = {
        id: parseMarkerId(beginMatch[1]),
        beginLine: index + 1,
        beginLineText: line
      };
      continue;
    }

    const endMatch = line.match(endPattern);
    if (!endMatch) {
      continue;
    }

    if (!openBlock) {
      return {
        success: false,
        blocks,
        error: {
          kind: 'ORPHAN_END',
          line: index + 1,
          message: `Найден маркер end без begin на строке ${index + 1}.`
        }
      };
    }

    const endId = parseMarkerId(endMatch[1]);
    if (openBlock.id && endId && openBlock.id !== endId) {
      return {
        success: false,
        blocks,
        error: {
          kind: 'MISMATCHED_IDS',
          line: index + 1,
          message: `ID маркеров не совпадает: begin="${openBlock.id}", end="${endId}" (строка ${index + 1}).`
        }
      };
    }

    const beginLineIndex = openBlock.beginLine - 1;
    const endLineIndex = index;
    const contextLine = lines
      .slice(beginLineIndex + 1, endLineIndex)
      .map((value) => value.trim())
      .find((value) => value.length > 0);

    blocks.push({
      id: openBlock.id ?? endId,
      beginLine: openBlock.beginLine,
      endLine: index + 1,
      beginLineText: openBlock.beginLineText,
      endLineText: line,
      contextPreview: contextLine ?? '(пустой блок)'
    });

    openBlock = undefined;
  }

  if (openBlock) {
    return {
      success: false,
      blocks,
      error: {
        kind: 'UNCLOSED_BEGIN',
        line: openBlock.beginLine,
        message: `Маркер begin на строке ${openBlock.beginLine} не закрыт маркером end.`
      }
    };
  }

  return {
    success: true,
    blocks
  };
};

const detectEol = (sourceText: string): string => (sourceText.includes('\r\n') ? '\r\n' : '\n');

const normalizeGeneratedCode = (generatedCode: string): string[] => {
  const normalized = generatedCode.replace(/\r\n/g, '\n').trimEnd();
  if (!normalized) {
    return [];
  }
  return normalized.split('\n');
};

const buildReplacement = (
  lines: string[],
  block: ParsedBindingBlock,
  generatedCode: string
): string[] => {
  const beginLineIndex = block.beginLine - 1;
  const endLineIndex = block.endLine - 1;
  const generatedLines = normalizeGeneratedCode(generatedCode);

  return [
    ...lines.slice(0, beginLineIndex + 1),
    ...generatedLines,
    ...lines.slice(endLineIndex)
  ];
};

export const patchBindingBlock = (
  sourceText: string,
  block: ParsedBindingBlock,
  generatedCode: string
): string => {
  const eol = detectEol(sourceText);
  const lines = sourceText.split(/\r?\n/);
  const patchedLines = buildReplacement(lines, block, generatedCode);
  const hadTrailingNewline = /\r?\n$/.test(sourceText);
  const result = patchedLines.join(eol);
  return hadTrailingNewline ? `${result}${eol}` : result;
};

export const appendBindingBlock = (
  sourceText: string,
  blockId: string,
  generatedCode: string
): string => {
  const eol = detectEol(sourceText);
  const lines = sourceText.split(/\r?\n/);
  const generatedLines = normalizeGeneratedCode(generatedCode);
  const normalizedId = blockId.trim();

  const hasContent = sourceText.trim().length > 0;
  const prefixGap = hasContent ? ['', ''] : [];
  const blockLines = [
    `// multicode:begin ${normalizedId}`,
    ...generatedLines,
    `// multicode:end ${normalizedId}`
  ];
  const mergedLines = [...lines, ...prefixGap, ...blockLines];
  const result = mergedLines.join(eol);
  return `${result}${eol}`;
};

export const findBlocksById = (
  blocks: ParsedBindingBlock[],
  blockId: string | undefined
): ParsedBindingBlock[] => {
  const normalizedId = blockId?.trim();
  if (!normalizedId) {
    return blocks;
  }
  return blocks.filter((block) => (block.id ?? '').trim() === normalizedId);
};
