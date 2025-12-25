/**
 * ErrorBoundary — компонент для отлова и отображения ошибок React
 * 
 * Без этого компонента ошибки в дочерних компонентах приводят к
 * полному краху UI без какой-либо информации.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    padding: 24,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  
  errorBox: {
    maxWidth: 800,
    width: '100%',
    backgroundColor: '#313244',
    borderRadius: 8,
    padding: 24,
    border: '1px solid #f38ba8',
  },
  
  title: {
    color: '#f38ba8',
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  
  message: {
    color: '#fab387',
    fontSize: 14,
    marginBottom: 16,
    padding: '12px 16px',
    backgroundColor: 'rgba(243, 139, 168, 0.1)',
    borderRadius: 4,
    fontFamily: 'monospace',
    wordBreak: 'break-word' as const,
  },
  
  stack: {
    color: '#6c7086',
    fontSize: 12,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: 300,
    overflow: 'auto',
    padding: '12px 16px',
    backgroundColor: '#181825',
    borderRadius: 4,
    marginBottom: 16,
  },
  
  actions: {
    display: 'flex',
    gap: 12,
  },
  
  button: {
    padding: '8px 16px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  
  reloadButton: {
    backgroundColor: '#89b4fa',
    color: '#1e1e2e',
  },
  
  copyButton: {
    backgroundColor: '#45475a',
    color: '#cdd6f4',
  },
  
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: '#6c7086',
  },
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Логируем в консоль для отладки
    console.error('[MultiCode ErrorBoundary] Caught error:', error);
    console.error('[MultiCode ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Пытаемся отправить ошибку в расширение
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vscode = (window as any).acquireVsCodeApi?.();
      if (vscode) {
        vscode.postMessage({
          type: 'reportWebviewError',
          payload: {
            message: `React Error: ${error.message}\n\nStack: ${error.stack}\n\nComponent: ${errorInfo.componentStack}`,
          },
        });
      }
    } catch {
      // Ignore
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const errorText = [
      '=== MultiCode Error Report ===',
      `Date: ${new Date().toISOString()}`,
      '',
      '--- Error ---',
      error?.message ?? 'Unknown error',
      '',
      '--- Stack Trace ---',
      error?.stack ?? 'No stack trace',
      '',
      '--- Component Stack ---',
      errorInfo?.componentStack ?? 'No component stack',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      alert('Ошибка скопирована в буфер обмена');
    } catch {
      console.error('Failed to copy error');
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <div style={styles.title}>
              <span>⚠️</span>
              <span>Произошла ошибка в визуальном редакторе</span>
            </div>
            
            <div style={styles.message}>
              {error?.message ?? 'Неизвестная ошибка'}
            </div>
            
            {error?.stack && (
              <div style={styles.stack}>
                {error.stack}
              </div>
            )}
            
            {errorInfo?.componentStack && (
              <>
                <div style={{ ...styles.title, fontSize: 14, marginTop: 16 }}>
                  Стек компонентов:
                </div>
                <div style={styles.stack}>
                  {errorInfo.componentStack}
                </div>
              </>
            )}
            
            <div style={styles.actions}>
              <button
                style={{ ...styles.button, ...styles.reloadButton }}
                onClick={this.handleReload}
              >
                🔄 Перезагрузить
              </button>
              <button
                style={{ ...styles.button, ...styles.copyButton }}
                onClick={this.handleCopyError}
              >
                📋 Копировать ошибку
              </button>
            </div>
            
            <div style={styles.hint}>
              Подсказка: Откройте DevTools (F12 → Console) для дополнительной информации.
              <br />
              Также проверьте Output → MultiCode для логов расширения.
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
