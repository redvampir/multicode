/**
 * PackageManagerPanel — панель управления пакетами узлов
 * 
 * Функционал:
 * - Просмотр загруженных пакетов (имя, версия, кол-во узлов)
 * - Выгрузка пакетов (кроме @multicode/std)
 * - Загрузка новых пакетов из JSON
 * - Локализация RU/EN
 */

import React, { useState, useCallback, useRef } from 'react';

// ============================================
// Стили (Catppuccin Mocha)
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e2e',
    borderLeft: '1px solid #313244',
    minWidth: 320,
    maxWidth: 400,
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
  
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#cdd6f4',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  } as React.CSSProperties,
  
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  } as React.CSSProperties,
  
  sectionTitle: {
    color: '#6c7086',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  } as React.CSSProperties,
  
  packageCard: {
    backgroundColor: '#181825',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px solid #313244',
    transition: 'border-color 0.15s',
  } as React.CSSProperties,
  
  packageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  } as React.CSSProperties,
  
  packageInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as React.CSSProperties,
  
  packageName: {
    color: '#cdd6f4',
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,
  
  packageVersion: {
    color: '#6c7086',
    fontSize: 11,
  } as React.CSSProperties,
  
  packageStats: {
    display: 'flex',
    gap: 12,
    marginTop: 4,
  } as React.CSSProperties,
  
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: '#6c7086',
    fontSize: 11,
  } as React.CSSProperties,
  
  statValue: {
    color: '#89b4fa',
    fontWeight: 600,
  } as React.CSSProperties,
  
  unloadButton: {
    background: 'transparent',
    border: '1px solid #f38ba8',
    color: '#f38ba8',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    transition: 'all 0.15s',
  } as React.CSSProperties,
  
  unloadButtonHover: {
    backgroundColor: 'rgba(243, 139, 168, 0.15)',
  } as React.CSSProperties,
  
  unloadButtonDisabled: {
    borderColor: '#45475a',
    color: '#45475a',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  
  loadSection: {
    borderTop: '1px solid #313244',
    paddingTop: 16,
    marginTop: 8,
  } as React.CSSProperties,
  
  textarea: {
    width: '100%',
    minHeight: 120,
    padding: 12,
    backgroundColor: '#11111b',
    border: '1px solid #313244',
    borderRadius: 6,
    color: '#cdd6f4',
    fontSize: 12,
    fontFamily: '"Fira Code", "Consolas", monospace',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.15s',
  } as React.CSSProperties,
  
  textareaFocused: {
    borderColor: '#89b4fa',
  } as React.CSSProperties,
  
  buttonRow: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  } as React.CSSProperties,
  
  primaryButton: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: '#89b4fa',
    color: '#1e1e2e',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.15s',
  } as React.CSSProperties,
  
  primaryButtonHover: {
    backgroundColor: '#b4befe',
  } as React.CSSProperties,
  
  primaryButtonDisabled: {
    backgroundColor: '#45475a',
    color: '#6c7086',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  
  secondaryButton: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: 'all 0.15s',
  } as React.CSSProperties,
  
  message: {
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 12,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  } as React.CSSProperties,
  
  successMessage: {
    backgroundColor: 'rgba(166, 227, 161, 0.15)',
    color: '#a6e3a1',
    border: '1px solid rgba(166, 227, 161, 0.3)',
  } as React.CSSProperties,
  
  errorMessage: {
    backgroundColor: 'rgba(243, 139, 168, 0.15)',
    color: '#f38ba8',
    border: '1px solid rgba(243, 139, 168, 0.3)',
  } as React.CSSProperties,
  
  emptyState: {
    textAlign: 'center',
    color: '#6c7086',
    fontSize: 12,
    padding: '24px 16px',
  } as React.CSSProperties,
  
  fileInput: {
    display: 'none',
  } as React.CSSProperties,
  
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '12px 0',
    color: '#6c7086',
    fontSize: 11,
  } as React.CSSProperties,
  
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#313244',
  } as React.CSSProperties,
};

// ============================================
// Типы
// ============================================

export interface PackageInfo {
  name: string;
  version: string;
  displayName: string;
  nodeCount: number;
}

export interface PackageManagerPanelProps {
  visible: boolean;
  displayLanguage: 'ru' | 'en';
  onClose: () => void;
  packages: PackageInfo[];
  onUnloadPackage: (name: string) => boolean;
  onLoadPackage: (jsonData: unknown) => { success: boolean; errors?: string[] };
}

// ============================================
// Основной компонент
// ============================================

export const PackageManagerPanel: React.FC<PackageManagerPanelProps> = ({
  visible,
  displayLanguage,
  onClose,
  packages,
  onUnloadPackage,
  onLoadPackage,
}) => {
  const [jsonInput, setJsonInput] = useState('');
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [hoveredUnload, setHoveredUnload] = useState<string | null>(null);
  const [hoveredPrimary, setHoveredPrimary] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Локализация
  const t = {
    title: displayLanguage === 'ru' ? 'Пакеты узлов' : 'Node Packages',
    loadedPackages: displayLanguage === 'ru' ? 'Загруженные пакеты' : 'Loaded Packages',
    loadPackage: displayLanguage === 'ru' ? 'Загрузить пакет' : 'Load Package',
    nodes: displayLanguage === 'ru' ? 'узлов' : 'nodes',
    unload: displayLanguage === 'ru' ? 'Выгрузить' : 'Unload',
    corePackage: displayLanguage === 'ru' ? 'Базовый пакет' : 'Core Package',
    jsonPlaceholder: displayLanguage === 'ru' 
      ? 'Вставьте JSON пакета или загрузите файл...' 
      : 'Paste package JSON or load a file...',
    load: displayLanguage === 'ru' ? 'Загрузить' : 'Load',
    fromFile: displayLanguage === 'ru' ? 'Из файла' : 'From File',
    clear: displayLanguage === 'ru' ? 'Очистить' : 'Clear',
    or: displayLanguage === 'ru' ? 'или' : 'or',
    noPackages: displayLanguage === 'ru' 
      ? 'Нет загруженных пакетов' 
      : 'No packages loaded',
    loadSuccess: displayLanguage === 'ru' 
      ? 'Пакет успешно загружен!' 
      : 'Package loaded successfully!',
    unloadSuccess: displayLanguage === 'ru' 
      ? 'Пакет выгружен' 
      : 'Package unloaded',
    invalidJson: displayLanguage === 'ru' 
      ? 'Ошибка: Некорректный JSON' 
      : 'Error: Invalid JSON',
    close: displayLanguage === 'ru' ? 'Закрыть' : 'Close',
  };
  
  // Скрыть сообщение через 3 секунды
  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);
  
  // Загрузка пакета из JSON
  const handleLoadPackage = useCallback(() => {
    const trimmed = jsonInput.trim();
    if (!trimmed) return;
    
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      showMessage('error', t.invalidJson);
      return;
    }
    
    const result = onLoadPackage(parsed);
    
    if (result.success) {
      showMessage('success', t.loadSuccess);
      setJsonInput('');
    } else {
      const errorText = result.errors?.join('; ') ?? 'Unknown error';
      showMessage('error', errorText);
    }
  }, [jsonInput, onLoadPackage, showMessage, t.invalidJson, t.loadSuccess]);
  
  // Выгрузка пакета
  const handleUnloadPackage = useCallback((name: string) => {
    const success = onUnloadPackage(name);
    if (success) {
      showMessage('success', t.unloadSuccess);
    }
  }, [onUnloadPackage, showMessage, t.unloadSuccess]);
  
  // Загрузка из файла
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setJsonInput(content);
      }
    };
    reader.readAsText(file);
    
    // Сброс input для повторного выбора того же файла
    e.target.value = '';
  }, []);
  
  // Проверка, является ли пакет базовым (не может быть выгружен)
  const isCorePackage = useCallback((name: string) => {
    return name === '@multicode/std';
  }, []);
  
  if (!visible) return null;
  
  return (
    <div style={styles.container} data-testid="package-manager-panel">
      {/* Заголовок */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>📦</span>
          <span>{t.title}</span>
        </div>
        <button
          style={styles.closeButton}
          onClick={onClose}
          title={t.close}
          aria-label={t.close}
        >
          ×
        </button>
      </div>
      
      {/* Контент */}
      <div style={styles.content as React.CSSProperties}>
        {/* Сообщение */}
        {message && (
          <div 
            style={{
              ...styles.message,
              ...(message.type === 'success' ? styles.successMessage : styles.errorMessage),
            }}
            role="alert"
          >
            <span>{message.type === 'success' ? '✓' : '!'}</span>
            <span>{message.text}</span>
          </div>
        )}
        
        {/* Список пакетов */}
        <div style={styles.section as React.CSSProperties}>
          <div style={styles.sectionTitle}>{t.loadedPackages}</div>
          
          {packages.length === 0 ? (
            <div style={styles.emptyState as React.CSSProperties}>{t.noPackages}</div>
          ) : (
            packages.map((pkg) => (
              <div 
                key={pkg.name} 
                style={styles.packageCard as React.CSSProperties}
                data-testid={`package-card-${pkg.name}`}
              >
                <div style={styles.packageHeader}>
                  <div style={styles.packageInfo as React.CSSProperties}>
                    <div style={styles.packageName}>{pkg.displayName}</div>
                    <div style={styles.packageVersion}>
                      {pkg.name} • v{pkg.version}
                    </div>
                  </div>
                  
                  <button
                    style={{
                      ...styles.unloadButton,
                      ...(isCorePackage(pkg.name) 
                        ? styles.unloadButtonDisabled 
                        : hoveredUnload === pkg.name 
                          ? styles.unloadButtonHover 
                          : {}),
                    }}
                    onClick={() => !isCorePackage(pkg.name) && handleUnloadPackage(pkg.name)}
                    onMouseEnter={() => setHoveredUnload(pkg.name)}
                    onMouseLeave={() => setHoveredUnload(null)}
                    disabled={isCorePackage(pkg.name)}
                    title={isCorePackage(pkg.name) ? t.corePackage : t.unload}
                    aria-label={`${t.unload} ${pkg.displayName}`}
                  >
                    {isCorePackage(pkg.name) ? t.corePackage : t.unload}
                  </button>
                </div>
                
                <div style={styles.packageStats}>
                  <div style={styles.stat}>
                    <span style={styles.statValue}>{pkg.nodeCount}</span>
                    <span>{t.nodes}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Секция загрузки */}
        <div style={{ ...styles.section as React.CSSProperties, ...styles.loadSection }}>
          <div style={styles.sectionTitle}>{t.loadPackage}</div>
          
          <textarea
            style={{
              ...styles.textarea,
              ...(textareaFocused ? styles.textareaFocused : {}),
            }}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            onFocus={() => setTextareaFocused(true)}
            onBlur={() => setTextareaFocused(false)}
            placeholder={t.jsonPlaceholder}
            aria-label={t.jsonPlaceholder}
            data-testid="package-json-input"
          />
          
          <div style={styles.buttonRow}>
            <button
              style={{
                ...styles.primaryButton,
                ...(jsonInput.trim() 
                  ? (hoveredPrimary ? styles.primaryButtonHover : {})
                  : styles.primaryButtonDisabled),
              }}
              onClick={handleLoadPackage}
              onMouseEnter={() => setHoveredPrimary(true)}
              onMouseLeave={() => setHoveredPrimary(false)}
              disabled={!jsonInput.trim()}
              data-testid="load-package-button"
            >
              {t.load}
            </button>
            
            {jsonInput && (
              <button
                style={styles.secondaryButton}
                onClick={() => setJsonInput('')}
              >
                {t.clear}
              </button>
            )}
          </div>
          
          <div style={styles.orDivider}>
            <div style={styles.dividerLine} />
            <span>{t.or}</span>
            <div style={styles.dividerLine} />
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={styles.fileInput}
            onChange={handleFileSelect}
            data-testid="file-input"
          />
          
          <button
            style={styles.secondaryButton}
            onClick={() => fileInputRef.current?.click()}
            data-testid="load-from-file-button"
          >
            📁 {t.fromFile}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageManagerPanel;
