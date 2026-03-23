/**
 * EnhancedCodePreviewPanel — улучшенная панель предпросмотра C++ кода
 * 
 * Особенности:
 * - Расширенная подсветка синтаксиса C++ (через prismjs)
 * - Интерактивная связь кода с узлами (source map)
 * - Кликабельные строки кода → переход к узлам
 * - Статистика генерации в реальном времени
 * - Визуализация проблем и предупреждений
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { BlueprintGraphState } from '../shared/blueprintTypes';
import { NODE_TYPE_DEFINITIONS } from '../shared/blueprintTypes';
import { UnsupportedLanguageError, createUnsupportedLanguageError } from '../codegen/factory';
import { getLanguageSupportInfo } from '../codegen/languageSupport';
import { CodeGenErrorCode } from '../codegen/types';
import type { CodeGenerationResult } from '../codegen/types';
import { getTranslation } from '../shared/translations';
import {
  resolveCodePreviewGenerator,
  type PackageRegistrySnapshot,
} from './codePreviewGenerator';

// ============================================
// Расширенные стили
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e2e',
    borderLeft: '1px solid #313244',
    minWidth: 400,
    maxWidth: 700,
    fontFamily: '"Fira Code", "Consolas", monospace',
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
    alignItems: 'center',
  } as React.CSSProperties,

  warningBox: {
    padding: '8px 12px',
    backgroundColor: 'rgba(249, 226, 175, 0.1)',
    borderTop: '1px solid #313244',
    color: '#f9e2af',
    fontSize: 11,
  } as React.CSSProperties,
  
  statsContainer: {
    display: 'flex',
    gap: 16,
    padding: '8px 16px',
    backgroundColor: '#181825',
    borderBottom: '1px solid #313244',
    fontSize: 11,
    color: '#a6adc8',
  } as React.CSSProperties,
  
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  } as React.CSSProperties,
  
  statLabel: {
    color: '#6c7086',
  } as React.CSSProperties,
  
  statValue: {
    color: '#a6e3a1',
    fontWeight: 600,
  } as React.CSSProperties,
  
  codeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: 0,
    backgroundColor: '#11111b',
  } as React.CSSProperties,
  
  pre: {
    margin: 0,
    padding: 0,
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  } as React.CSSProperties,
  
  // Подсветка синтаксиса C++ (расширенная)
  keyword: { color: '#cba6f7', fontWeight: 'bold' }, // purple
  string: { color: '#a6e3a1' }, // green
  comment: { color: '#6c7086', fontStyle: 'italic' }, // gray
  number: { color: '#f9e2af' }, // yellow
  function: { color: '#89b4fa' }, // blue
  type: { color: '#f38ba8' }, // red
  directive: { color: '#94e2d5' }, // teal
  operator: { color: '#fab387' }, // orange
  
  // Интерактивные строки
  codeLine: {
    padding: '0 16px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    borderLeft: '3px solid transparent',
    position: 'relative' as const,
  } as React.CSSProperties,
  
  codeLineHover: {
    backgroundColor: '#313244',
    borderLeftColor: '#585b70',
  } as React.CSSProperties,
  
  codeLineActive: {
    backgroundColor: '#313244',
    borderLeftColor: '#89b4fa',
  } as React.CSSProperties,
  
  // Подсветка связанных узлов
  highlightedLine: {
    backgroundColor: 'rgba(137, 180, 250, 0.1)',
    borderLeftColor: '#89b4fa',
  } as React.CSSProperties,
  
  // Проблемы и предупреждения
  errorLine: {
    backgroundColor: 'rgba(243, 139, 168, 0.1)',
    borderLeftColor: '#f38ba8',
  } as React.CSSProperties,
  
  warningLine: {
    backgroundColor: 'rgba(249, 226, 175, 0.1)',
    borderLeftColor: '#f9e2af',
  } as React.CSSProperties,
  
  // Tooltip для информации о узле
  // Управление окнами
  windowControls: {
    backgroundColor: '#313244',
    border: '1px solid #585b70',
    borderRadius: '4px',
    padding: '4px',
    marginBottom: '8px',
  } as React.CSSProperties,
  
  controlButton: {
    background: 'none',
    border: '1px solid #585b70',
    color: '#cdd6f4',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    marginRight: '4px',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  
  controlButtonActive: {
    backgroundColor: '#89b4fa',
    borderColor: '#89b4fa',
    color: '#1e1e2e',
  } as React.CSSProperties,
  
  controlButtonHover: {
    borderColor: '#89b4fa',
    backgroundColor: '#45475a',
  } as React.CSSProperties,
  
  tooltip: {
    position: 'absolute' as const,
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    whiteSpace: 'nowrap',
    zIndex: 1000,
    pointerEvents: 'none' as const,
    opacity: 0,
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  
  tooltipVisible: {
    opacity: 1,
  } as React.CSSProperties,
};

// ============================================
// Вспомогательные функции
// ============================================

// ============================================
// Типы для улучшенной панели
// ============================================

interface CodeLineInfo {
  line: number;
  nodeId?: string;
  nodeInstanceName?: string;
  hasError?: boolean;
  hasWarning?: boolean;
  isHighlighted?: boolean;
}

interface EnhancedCodePreviewProps {
  graph: BlueprintGraphState;
  locale: 'ru' | 'en';
  onNodeSelect?: (nodeId: string) => void;
  onGenerateComplete?: (result: CodeGenerationResult) => void;
  packageRegistrySnapshot?: Partial<PackageRegistrySnapshot>;
  layout?: 'side' | 'bottom';
}

// ============================================
// Основной компонент
// ============================================

export const EnhancedCodePreviewPanel: React.FC<EnhancedCodePreviewProps> = ({
  graph,
  locale,
  onNodeSelect,
  onGenerateComplete,
  packageRegistrySnapshot,
  layout = 'side',
}) => {
  const [result, setResult] = useState<CodeGenerationResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [lineInfos, setLineInfos] = useState<CodeLineInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipContent, setTooltipContent] = useState('');
  const [showMinimap, setShowMinimap] = useState(layout === 'side');
  const [showFunctionsPanel, setShowFunctionsPanel] = useState(false);  
  const codeRef = useRef<HTMLDivElement>(null);
  const supportInfo = getLanguageSupportInfo(graph.language);

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

    return [getTranslation(locale, 'codegen.registryUnavailable')];
  }, [graph.nodes, locale, packageRegistrySnapshot]);

  // Генерация кода
  useEffect(() => {
    const generateCode = () => {
      setIsLoading(true);
      
      try {
        const { generator, diagnostics } = resolveCodePreviewGenerator(graph.language, packageRegistrySnapshot);
        if (diagnostics.fallbackReason) {
          console.debug('[EnhancedCodePreviewPanel] fallback generator selected', diagnostics);
        } else {
          console.debug('[EnhancedCodePreviewPanel] package-aware generator selected', diagnostics);
        }
        const generationResult = generator.generate(graph);
        
        setResult(generationResult);
        onGenerateComplete?.(generationResult);
        
        // Построение информации о линиях из source map
        const lineInfos: CodeLineInfo[] = [];
        
        if (generationResult.sourceMap) {
          generationResult.sourceMap.forEach(mapping => {
            for (let line = mapping.startLine; line <= mapping.endLine; line++) {
              const node = graph.nodes.find(n => n.id === mapping.nodeId);
              lineInfos.push({
                line,
                nodeId: mapping.nodeId,
                nodeInstanceName: node?.customLabel ?? node?.label,
                hasError: generationResult.errors.some(e => e.nodeId === mapping.nodeId),
                hasWarning: generationResult.warnings.some(w => w.nodeId === mapping.nodeId),
              });
            }
          });
        }
        
        setLineInfos(lineInfos);
      } catch (error) {
        console.error('Error generating code:', error);

        if (error instanceof UnsupportedLanguageError) {
          const languageError = createUnsupportedLanguageError(error.language);
          setResult({
            success: false,
            code: locale === 'ru'
              ? `// Предпросмотр недоступен: ${languageError.message}`
              : `// Preview unavailable: ${languageError.messageEn}`,
            errors: [languageError],
            warnings: [],
            sourceMap: [],
            stats: { nodesProcessed: 0, linesOfCode: 0, generationTimeMs: 0 },
          });
          return;
        }

        setResult({
          success: false,
          code: locale === 'ru' ? '// Ошибка генерации кода' : '// Code generation failed',
          errors: [{ message: String(error), code: CodeGenErrorCode.UNKNOWN_NODE_TYPE, messageEn: 'Generation error', nodeId: '' }],
          warnings: [],
          sourceMap: [],
          stats: { nodesProcessed: 0, linesOfCode: 0, generationTimeMs: 0 },
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    generateCode();
  }, [graph, locale, onGenerateComplete, packageRegistrySnapshot]);

  // Клик на строку кода
  const handleLineClick = useCallback((lineInfo: CodeLineInfo) => {
    if (lineInfo.nodeId) {
      setSelectedNodeId(lineInfo.nodeId);
      onNodeSelect?.(lineInfo.nodeId);
    }
  }, [onNodeSelect]);

  // Наведение на строку кода
  const handleLineHover = useCallback((lineInfo: CodeLineInfo, isHovered: boolean) => {
    setHoveredLine(isHovered ? lineInfo.line : null);
    
    if (isHovered && lineInfo.nodeInstanceName) {
      setTooltipContent(`${locale === 'ru' ? 'Узел:' : 'Node:'} ${lineInfo.nodeInstanceName}`);
      setShowTooltip(true);
    } else {
      setShowTooltip(false);
    }
  }, [locale]);

  // Копирование кода
  const handleCopy = useCallback(() => {
    if (result?.code) {
      navigator.clipboard.writeText(result.code);
    }
  }, [result?.code]);

  // Стили для линии кода
  const getLineStyle = useCallback((lineNumber: number): React.CSSProperties => {
    const lineInfo = lineInfos.find(info => info.line === lineNumber);
    const baseStyle = { ...styles.codeLine };
    
    // Подсветка при наведении
    if (hoveredLine === lineNumber) {
      Object.assign(baseStyle, styles.codeLineHover);
    }
    
    // Подсветка выбранного узла
    if (selectedNodeId && lineInfo?.nodeId === selectedNodeId) {
      Object.assign(baseStyle, styles.codeLineActive);
    }
    
    // Подсветка ошибок и предупреждений
    if (lineInfo?.hasError) {
      Object.assign(baseStyle, styles.errorLine);
    } else if (lineInfo?.hasWarning) {
      Object.assign(baseStyle, styles.warningLine);
    }
    
    return baseStyle;
  }, [lineInfos, hoveredLine, selectedNodeId]);

  // Рендеринг кода с подсветкой
  const renderCode = useCallback(() => {
    if (!result?.code) return null;
    
    const lines = result.code.split('\n');
    return lines.map((line, index) => {
      const lineNumber = index + 1;
      const lineInfo = lineInfos.find(info => info.line === lineNumber);
      
      return (
        <div
          key={index}
          style={getLineStyle(lineNumber)}
          onClick={() => lineInfo && handleLineClick(lineInfo)}
          onMouseEnter={() => lineInfo && handleLineHover(lineInfo, true)}
          onMouseLeave={() => lineInfo && handleLineHover(lineInfo, false)}
        >
          <span style={{ 
            color: '#6c7086', 
            marginRight: '16px', 
            minWidth: '30px',
            display: 'inline-block',
            textAlign: 'right',
            userSelect: 'none' 
          }}>
            {lineNumber}
          </span>
          <span>{line}</span>
          
          {/* Tooltip с информацией о узле */}
          {showTooltip && lineInfo?.nodeInstanceName && (
            <div style={{ ...styles.tooltip, ...styles.tooltipVisible }}>
              {tooltipContent}
            </div>
          )}
        </div>
      );
    });
  }, [result, lineInfos, getLineStyle, handleLineClick, handleLineHover, showTooltip, tooltipContent]);

  // Статистика генерации
  const renderStats = () => {
    if (!result?.stats) return null;
    
    const { nodesProcessed, linesOfCode, generationTimeMs } = result.stats;
    
    return (
      <div style={styles.statsContainer}>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>{locale === 'ru' ? 'Узлов:' : 'Nodes:'}</span>
          <span style={styles.statValue}>{nodesProcessed}</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>{locale === 'ru' ? 'Строк:' : 'Lines:'}</span>
          <span style={styles.statValue}>{linesOfCode}</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>{locale === 'ru' ? 'Время:' : 'Time:'}</span>
          <span style={styles.statValue}>{generationTimeMs}ms</span>
        </div>
        {result.errors.length > 0 && (
          <div style={styles.statItem}>
            <span style={styles.statLabel}>{locale === 'ru' ? 'Ошибки:' : 'Errors:'}</span>
            <span style={{ ...styles.statValue, color: '#f38ba8' }}>{result.errors.length}</span>
          </div>
        )}
        {result.warnings.length > 0 && (
          <div style={styles.statItem}>
            <span style={styles.statLabel}>{locale === 'ru' ? 'Пред.' : 'Warn:'}</span>
            <span style={{ ...styles.statValue, color: '#f9e2af' }}>{result.warnings.length}</span>
          </div>
        )}
      </div>
    );
  };

  // Миникарта графа
  const renderMinimap = () => {
    if (!showMinimap) return null;
    
    return (
      <div style={{
        position: 'absolute' as const,
        right: '10px',
        bottom: '10px',
        width: '200px',
        height: '150px',
        backgroundColor: '#1e1e2e',
        border: '1px solid #45475a',
        borderRadius: '4px',
        padding: '8px',
        fontSize: '10px',
        color: '#6c7086',
      }}>
        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>
          {locale === 'ru' ? '🗺️ Миникарта' : '🗺️ Minimap'}
        </div>
        <div style={{
          backgroundColor: '#11111b',
          height: '100px',
          borderRadius: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {locale === 'ru' ? '📍 Узлы графа' : '📍 Graph nodes'}
        </div>
      </div>
    );
  };

  // Панель функций
  const renderFunctionsPanel = () => {
    if (!showFunctionsPanel) return null;
    
    const functions = result?.sourceMap 
      ? Array.from(new Set(result.sourceMap.map(m => m.nodeId))).length 
      : 0;
    
    return (
      <div style={{
        position: 'absolute' as const,
        right: '10px',
        bottom: '170px',
        width: '200px',
        backgroundColor: '#1e1e2e',
        border: '1px solid #45475a',
        borderRadius: '4px',
        padding: '8px',
        fontSize: '10px',
        color: '#6c7086',
      }}>
        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>
          {locale === 'ru' ? '⚙️ Функции' : '⚙️ Functions'}
        </div>
        <div style={{
          backgroundColor: '#11111b',
          height: '80px',
          borderRadius: '2px',
          padding: '8px',
        }}>
          <div style={{ marginBottom: '4px' }}>
            {locale === 'ru' ? 'Всего функций:' : 'Total functions:'} {functions}
          </div>
          <div style={{ marginBottom: '4px' }}>
            {locale === 'ru' ? 'Выполнимых узлов:' : 'Executable nodes:'} {graph.nodes.filter(n => n.type === 'Start' || n.type === 'End' || n.type === 'Branch').length}
          </div>
          <div>
            {locale === 'ru' ? 'Связей:' : 'Connections:'} {graph.edges.length}
          </div>
        </div>
      </div>
    );
  };

  const containerStyle: React.CSSProperties = layout === 'bottom'
    ? {
        ...styles.container,
        minWidth: 0,
        maxWidth: 'none',
        width: '100%',
        borderLeft: 'none',
        borderTop: '1px solid #313244',
      }
    : styles.container;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          {locale === 'ru' ? `🔍 Предпросмотр ${graph.language.toUpperCase()}` : `🔍 ${graph.language.toUpperCase()} Preview`}
          {isLoading && <span style={{ color: '#f9e2af' }}>⏳</span>}
          {result?.success === false && <span style={{ color: '#f38ba8' }}>❌</span>}
          {result?.success === true && <span style={{ color: '#a6e3a1' }}>✅</span>}
          <span style={{ fontSize: 11, color: supportInfo.supportsGenerator ? '#a6e3a1' : '#f9e2af' }}>
            {getTranslation(locale, 'codegen.supportStatus')}: {supportInfo.supportsGenerator ? getTranslation(locale, 'codegen.support.ready') : getTranslation(locale, 'codegen.support.unsupported')}
          </span>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.windowControls}>
            <button
              onClick={() => setShowMinimap(!showMinimap)}
              style={{
                ...styles.controlButton,
                ...(showMinimap ? styles.controlButtonActive : styles.controlButtonHover)
              }}
              title={showMinimap ? 'Скрыть мини-карту' : 'Показать мини-карту'}
            >
              {showMinimap ? '🗺' : '🗼'}
            </button>
            <button
              onClick={() => setShowFunctionsPanel(!showFunctionsPanel)}
              style={{
                ...styles.controlButton,
                ...(showFunctionsPanel ? styles.controlButtonActive : styles.controlButtonHover)
              }}
              title={showFunctionsPanel ? 'Скрыть функции' : 'Показать функции'}
            >
              {showFunctionsPanel ? '⚙️' : '📂'}
            </button>
          </div>
          <button
            onClick={handleCopy}
            disabled={!result?.code}
            style={{
              background: 'none',
              border: '1px solid #585b70',
              color: '#cdd6f4',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: result?.code ? 'pointer' : 'not-allowed',
              fontSize: '12px',
            }}
          >
            {locale === 'ru' ? '📋 Копировать' : '📋 Copy'}
          </button>
        </div>
      </div>


      {previewWarnings.length > 0 && (
        <div style={styles.warningBox}>
          {previewWarnings.join('; ')}
        </div>
      )}

      {/* Статистика */}
      {renderStats()}

      {/* Код с подсветкой */}
      <div style={styles.codeContainer} ref={codeRef}>
        <pre style={styles.pre}>
          {renderCode()}
        </pre>
      </div>
      
      {/* Регулируемые окна */}
      {renderMinimap()}
      {renderFunctionsPanel()}
    </div>
  );
};
