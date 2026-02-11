/**
 * CodePreviewPanel — панель предпросмотра сгенерированного C++ кода
 * 
 * Особенности:
 * - Подсветка синтаксиса (базовая, на CSS)
 * - Синхронная подсветка строки при наведении на узел
 * - Копирование кода в буфер обмена
 * - Статистика генерации
 */

import React, { useMemo, useState, useCallback } from 'react';
import type { BlueprintGraphState } from '../shared/blueprintTypes';
import { NODE_TYPE_DEFINITIONS } from '../shared/blueprintTypes';
import { UnsupportedLanguageError, createUnsupportedLanguageError } from '../codegen/factory';
import { getLanguageSupportInfo } from '../codegen/languageSupport';
import { isLanguageSupported } from '../codegen/languageSupport';
import { CodeGenErrorCode } from '../codegen/types';
import type { CodeGenerationResult } from '../codegen/types';
import { getTranslation } from '../shared/translations';
import {
  resolveCodePreviewGenerator,
  type PackageRegistrySnapshot,
} from './codePreviewGenerator';

// ============================================
// Стили
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e2e',
    borderLeft: '1px solid #313244',
    minWidth: 300,
    maxWidth: 500,
  } as React.CSSProperties,
  
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#313244',
    borderBottom: '1px solid #45475a',
  } as React.CSSProperties,
  
  title: {
    color: '#cdd6f4',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,
  
  headerActions: {
    display: 'flex',
    gap: 8,
  } as React.CSSProperties,
  
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: '#cdd6f4',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  
  codeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: 0,
    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
    fontSize: 12,
    lineHeight: 1.6,
  } as React.CSSProperties,
  
  codeTable: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  
  lineNumber: {
    color: '#6c7086',
    textAlign: 'right',
    paddingRight: 16,
    paddingLeft: 12,
    userSelect: 'none',
    width: 40,
    minWidth: 40,
    verticalAlign: 'top',
  } as React.CSSProperties,
  
  lineContent: {
    color: '#cdd6f4',
    paddingRight: 16,
    whiteSpace: 'pre',
    verticalAlign: 'top',
  } as React.CSSProperties,
  
  lineHighlighted: {
    backgroundColor: 'rgba(137, 180, 250, 0.15)',
  } as React.CSSProperties,
  
  stats: {
    padding: '8px 16px',
    backgroundColor: '#181825',
    borderTop: '1px solid #313244',
    fontSize: 11,
    color: '#6c7086',
    display: 'flex',
    gap: 16,
  } as React.CSSProperties,
  
  statItem: {
    display: 'flex',
    gap: 4,
  } as React.CSSProperties,
  
  errorContainer: {
    padding: 16,
    color: '#f38ba8',
  } as React.CSSProperties,
  
  warningContainer: {
    padding: '8px 16px',
    backgroundColor: 'rgba(249, 226, 175, 0.1)',
    borderTop: '1px solid #313244',
    fontSize: 11,
    color: '#f9e2af',
    maxHeight: 100,
    overflow: 'auto',
  } as React.CSSProperties,
  
  copySuccess: {
    color: '#a6e3a1',
  } as React.CSSProperties,
};

// ============================================
// Подсветка синтаксиса C++
// ============================================

interface TokenSpan {
  text: string;
  className: string;
}

const cppKeywords = new Set([
  'int', 'float', 'double', 'char', 'bool', 'void', 'auto', 'const',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
  'break', 'continue', 'return', 'true', 'false', 'nullptr',
  'class', 'struct', 'public', 'private', 'protected',
  'include', 'using', 'namespace', 'std',
]);

const tokenizeLine = (line: string): TokenSpan[] => {
  const tokens: TokenSpan[] = [];
  let remaining = line;
  
  while (remaining.length > 0) {
    // Комментарий
    if (remaining.startsWith('//')) {
      tokens.push({ text: remaining, className: 'code-comment' });
      break;
    }
    
    // Строка
    const stringMatch = remaining.match(/^"([^"\\]|\\.)*"/);
    if (stringMatch) {
      tokens.push({ text: stringMatch[0], className: 'code-string' });
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }
    
    // Препроцессор
    if (remaining.startsWith('#')) {
      const match = remaining.match(/^#\w+/);
      if (match) {
        tokens.push({ text: match[0], className: 'code-preprocessor' });
        remaining = remaining.slice(match[0].length);
        continue;
      }
    }
    
    // Число
    const numberMatch = remaining.match(/^\d+(\.\d+)?/);
    if (numberMatch) {
      tokens.push({ text: numberMatch[0], className: 'code-number' });
      remaining = remaining.slice(numberMatch[0].length);
      continue;
    }
    
    // Идентификатор или ключевое слово
    const wordMatch = remaining.match(/^[a-zA-Z_]\w*/);
    if (wordMatch) {
      const word = wordMatch[0];
      const className = cppKeywords.has(word) ? 'code-keyword' : 'code-identifier';
      tokens.push({ text: word, className });
      remaining = remaining.slice(word.length);
      continue;
    }
    
    // Оператор или пунктуация
    const opMatch = remaining.match(/^[+\-*/%=<>!&|^~?:;,.()[\]{}]+/);
    if (opMatch) {
      tokens.push({ text: opMatch[0], className: 'code-operator' });
      remaining = remaining.slice(opMatch[0].length);
      continue;
    }
    
    // Пробелы
    const spaceMatch = remaining.match(/^\s+/);
    if (spaceMatch) {
      tokens.push({ text: spaceMatch[0], className: '' });
      remaining = remaining.slice(spaceMatch[0].length);
      continue;
    }
    
    // Остальное
    tokens.push({ text: remaining[0], className: '' });
    remaining = remaining.slice(1);
  }
  
  return tokens;
};

// ============================================
// Компоненты
// ============================================

interface CodeLineProps {
  lineNumber: number;
  content: string;
  highlighted: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const CodeLine: React.FC<CodeLineProps> = ({
  lineNumber,
  content,
  highlighted,
  onMouseEnter,
  onMouseLeave,
}) => {
  const tokens = useMemo(() => tokenizeLine(content), [content]);
  
  return (
    <tr
      style={highlighted ? styles.lineHighlighted : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <td style={styles.lineNumber}>{lineNumber}</td>
      <td style={styles.lineContent}>
        {tokens.map((token, i) => (
          <span key={i} className={token.className}>
            {token.text}
          </span>
        ))}
      </td>
    </tr>
  );
};

// ============================================
// Основной компонент
// ============================================

export interface CodePreviewPanelProps {
  graph: BlueprintGraphState;
  displayLanguage: 'ru' | 'en';
  visible: boolean;
  onClose: () => void;
  highlightedNodeId?: string | null;
  onLineHover?: (nodeId: string | null) => void;
  packageRegistrySnapshot?: Partial<PackageRegistrySnapshot>;
}

export const CodePreviewPanel: React.FC<CodePreviewPanelProps> = ({
  graph,
  displayLanguage,
  visible,
  onClose,
  highlightedNodeId,
  onLineHover,
  packageRegistrySnapshot,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [hoveredLineNodeId, setHoveredLineNodeId] = useState<string | null>(null);
  
  // Генерируем код
  const previewWarnings = useMemo(() => {
    const fallbackWithoutRegistry = !packageRegistrySnapshot
      || !Array.isArray(packageRegistrySnapshot.packageNodeTypes)
      || packageRegistrySnapshot.packageNodeTypes.length === 0;

    if (!fallbackWithoutRegistry) {
      return [] as string[];
    }

    const hasUnknownNodes = graph.nodes.some((node) => !(node.type in NODE_TYPE_DEFINITIONS));
    if (!hasUnknownNodes) {
      return [] as string[];
    }

    return [getTranslation(displayLanguage, 'codegen.registryUnavailable')];
  }, [displayLanguage, graph.nodes, packageRegistrySnapshot]);

  const result: CodeGenerationResult = useMemo(() => {
    try {
      const { generator, diagnostics } = resolveCodePreviewGenerator(graph.language, packageRegistrySnapshot);
      if (diagnostics.fallbackReason) {
        console.debug('[CodePreviewPanel] fallback generator selected', diagnostics);
      } else {
        console.debug('[CodePreviewPanel] package-aware generator selected', diagnostics);
      }

      return generator.generate(graph, {
        includeHeaders: true,
        generateMainWrapper: true,
        includeRussianComments: true,
        includeSourceMarkers: true,
      });
    } catch (error) {
      if (error instanceof UnsupportedLanguageError) {
        const languageError = createUnsupportedLanguageError(error.language);
        return {
          success: false,
          code: displayLanguage === 'ru'
            ? `// Предпросмотр недоступен: ${languageError.message}`
            : `// Preview unavailable: ${languageError.messageEn}`,
          errors: [languageError],
          warnings: [],
          sourceMap: [],
          stats: { nodesProcessed: 0, linesOfCode: 0, generationTimeMs: 0 },
        };
      }

      return {
        success: false,
        code: displayLanguage === 'ru' ? '// Ошибка генерации кода' : '// Code generation failed',
        errors: [{
          nodeId: '',
          code: CodeGenErrorCode.UNKNOWN_NODE_TYPE,
          message: String(error),
          messageEn: String(error),
        }],
        warnings: [],
        sourceMap: [],
        stats: { nodesProcessed: 0, linesOfCode: 0, generationTimeMs: 0 },
      } as CodeGenerationResult;
    }
  }, [graph, packageRegistrySnapshot, displayLanguage]);
  
  // Разбиваем код на строки
  const lines = useMemo(() => result.code.split('\n'), [result.code]);
  
  // Создаём карту: номер строки -> nodeId
  const lineToNodeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of result.sourceMap) {
      for (let line = entry.startLine; line <= entry.endLine; line++) {
        map.set(line, entry.nodeId);
      }
    }
    return map;
  }, [result.sourceMap]);
  
  // Определяем подсвеченные строки
  const highlightedLines = useMemo(() => {
    const set = new Set<number>();
    const targetNodeId = highlightedNodeId ?? hoveredLineNodeId;
    if (targetNodeId) {
      for (const entry of result.sourceMap) {
        if (entry.nodeId === targetNodeId) {
          for (let line = entry.startLine; line <= entry.endLine; line++) {
            set.add(line);
          }
        }
      }
    }
    return set;
  }, [highlightedNodeId, hoveredLineNodeId, result.sourceMap]);
  
  // Копирование в буфер
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [result.code]);
  
  // Обработка наведения на строку
  const handleLineMouseEnter = useCallback((lineNumber: number) => {
    const nodeId = lineToNodeMap.get(lineNumber);
    if (nodeId) {
      setHoveredLineNodeId(nodeId);
      onLineHover?.(nodeId);
    }
  }, [lineToNodeMap, onLineHover]);
  
  const handleLineMouseLeave = useCallback(() => {
    setHoveredLineNodeId(null);
    onLineHover?.(null);
  }, [onLineHover]);
  
  if (!visible) return null;
  
  const supportInfo = getLanguageSupportInfo(graph.language);

  const t = {
    title: displayLanguage === 'ru'
      ? `Код (${graph.language.toUpperCase()})`
      : `Code (${graph.language.toUpperCase()})`,
    copy: displayLanguage === 'ru' ? 'Копировать' : 'Copy',
    copied: displayLanguage === 'ru' ? 'Скопировано!' : 'Copied!',
    close: displayLanguage === 'ru' ? 'Закрыть' : 'Close',
    nodes: displayLanguage === 'ru' ? 'узлов' : 'nodes',
    lines: displayLanguage === 'ru' ? 'строк' : 'lines',
    time: displayLanguage === 'ru' ? 'мс' : 'ms',
    errors: displayLanguage === 'ru' ? 'Ошибки' : 'Errors',
    warnings: displayLanguage === 'ru' ? 'Предупреждения' : 'Warnings',
    supportStatus: getTranslation(displayLanguage, 'codegen.supportStatus'),
    supportReady: getTranslation(displayLanguage, 'codegen.support.ready'),
    supportMissing: getTranslation(displayLanguage, 'codegen.support.unsupported'),
  };
  
  return (
    <div style={styles.container}>
      {/* Заголовок */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>{'</>'}</span>
          <span>{t.title}</span>
          <span style={{ fontSize: 11, color: supportInfo.supportsGenerator ? '#a6e3a1' : '#f9e2af' }}>
            {t.supportStatus}: {supportInfo.supportsGenerator ? t.supportReady : t.supportMissing}
          </span>
        </div>
        <div style={styles.headerActions}>
          <button
            style={{
              ...styles.iconButton,
              ...(copySuccess ? styles.copySuccess : {}),
            }}
            onClick={handleCopy}
            title={t.copy}
          >
            {copySuccess ? t.copied : t.copy}
          </button>
          <button
            style={styles.iconButton}
            onClick={onClose}
            title={t.close}
          >
            ×
          </button>
        </div>
      </div>
      
      {/* Ошибки */}
      {result.errors.length > 0 && (
        <div style={styles.errorContainer}>
          <strong>{t.errors}:</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
            {result.errors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Код */}
      <div style={styles.codeContainer}>
        <table style={styles.codeTable}>
          <tbody>
            {lines.map((line, index) => (
              <CodeLine
                key={index}
                lineNumber={index + 1}
                content={line}
                highlighted={highlightedLines.has(index + 1)}
                onMouseEnter={() => handleLineMouseEnter(index + 1)}
                onMouseLeave={handleLineMouseLeave}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Предупреждения */}
      {(result.warnings.length > 0 || previewWarnings.length > 0) && (
        <div style={styles.warningContainer}>
          <strong>{t.warnings}:</strong>{' '}
          {[...result.warnings.map(w => w.message), ...previewWarnings].join('; ')}
        </div>
      )}
      
      {/* Статистика */}
      <div style={styles.stats}>
        <div style={styles.statItem}>
          <span>{result.stats.nodesProcessed}</span>
          <span>{t.nodes}</span>
        </div>
        <div style={styles.statItem}>
          <span>{result.stats.linesOfCode}</span>
          <span>{t.lines}</span>
        </div>
        <div style={styles.statItem}>
          <span>{result.stats.generationTimeMs.toFixed(1)}</span>
          <span>{t.time}</span>
        </div>
      </div>
      
      {/* CSS для подсветки синтаксиса */}
      <style>{`
        .code-keyword { color: #cba6f7; }
        .code-string { color: #a6e3a1; }
        .code-number { color: #fab387; }
        .code-comment { color: #6c7086; font-style: italic; }
        .code-preprocessor { color: #f38ba8; }
        .code-operator { color: #89dceb; }
        .code-identifier { color: #cdd6f4; }
      `}</style>
    </div>
  );
};

export default CodePreviewPanel;
