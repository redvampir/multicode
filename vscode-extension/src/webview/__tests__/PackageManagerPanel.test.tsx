/**
 * Тесты для PackageManagerPanel
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PackageManagerPanel, PackageInfo } from '../PackageManagerPanel';

describe('PackageManagerPanel', () => {
  const mockPackages: PackageInfo[] = [
    { name: '@multicode/std', version: '1.0.0', displayName: 'Standard Library', nodeCount: 5 },
    { name: '@multicode/math', version: '0.2.0', displayName: 'Math Package', nodeCount: 3 },
  ];
  
  const defaultProps = {
    visible: true,
    displayLanguage: 'en' as const,
    onClose: vi.fn(),
    packages: mockPackages,
    onUnloadPackage: vi.fn().mockReturnValue(true),
    onLoadPackage: vi.fn().mockReturnValue({ success: true }),
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Рендеринг', () => {
    it('рендерит панель когда visible=true', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      expect(screen.getByTestId('package-manager-panel')).toBeInTheDocument();
      expect(screen.getByText('Node Packages')).toBeInTheDocument();
    });
    
    it('не рендерит панель когда visible=false', () => {
      render(<PackageManagerPanel {...defaultProps} visible={false} />);
      
      expect(screen.queryByTestId('package-manager-panel')).not.toBeInTheDocument();
    });
    
    it('отображает все загруженные пакеты', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      expect(screen.getByText('Standard Library')).toBeInTheDocument();
      expect(screen.getByText('Math Package')).toBeInTheDocument();
      expect(screen.getByText('@multicode/std • v1.0.0')).toBeInTheDocument();
      expect(screen.getByText('@multicode/math • v0.2.0')).toBeInTheDocument();
    });
    
    it('отображает количество узлов для каждого пакета', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
    
    it('отображает сообщение когда пакетов нет', () => {
      render(<PackageManagerPanel {...defaultProps} packages={[]} />);
      
      expect(screen.getByText('No packages loaded')).toBeInTheDocument();
    });
  });
  
  describe('Локализация', () => {
    it('отображает на русском языке', () => {
      render(<PackageManagerPanel {...defaultProps} displayLanguage="ru" />);
      
      expect(screen.getByText('Пакеты узлов')).toBeInTheDocument();
      expect(screen.getByText('Загруженные пакеты')).toBeInTheDocument();
      expect(screen.getByText('Загрузить пакет')).toBeInTheDocument();
    });
    
    it('отображает на английском языке', () => {
      render(<PackageManagerPanel {...defaultProps} displayLanguage="en" />);
      
      expect(screen.getByText('Node Packages')).toBeInTheDocument();
      expect(screen.getByText('Loaded Packages')).toBeInTheDocument();
      expect(screen.getByText('Load Package')).toBeInTheDocument();
    });
  });
  
  describe('Закрытие панели', () => {
    it('вызывает onClose при клике на кнопку закрытия', () => {
      const onClose = vi.fn();
      render(<PackageManagerPanel {...defaultProps} onClose={onClose} />);
      
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Выгрузка пакетов', () => {
    it('не позволяет выгрузить @multicode/std (базовый пакет)', () => {
      const onUnloadPackage = vi.fn();
      render(<PackageManagerPanel {...defaultProps} onUnloadPackage={onUnloadPackage} />);
      
      const stdPackageCard = screen.getByTestId('package-card-@multicode/std');
      const unloadButton = stdPackageCard.querySelector('button');
      
      expect(unloadButton).toBeDisabled();
      expect(unloadButton).toHaveTextContent('Core Package');
      
      fireEvent.click(unloadButton!);
      expect(onUnloadPackage).not.toHaveBeenCalled();
    });
    
    it('позволяет выгрузить обычные пакеты', () => {
      const onUnloadPackage = vi.fn().mockReturnValue(true);
      render(<PackageManagerPanel {...defaultProps} onUnloadPackage={onUnloadPackage} />);
      
      const mathPackageCard = screen.getByTestId('package-card-@multicode/math');
      const unloadButton = mathPackageCard.querySelector('button');
      
      expect(unloadButton).not.toBeDisabled();
      expect(unloadButton).toHaveTextContent('Unload');
      
      fireEvent.click(unloadButton!);
      expect(onUnloadPackage).toHaveBeenCalledWith('@multicode/math');
    });
  });
  
  describe('Загрузка пакетов', () => {
    it('показывает textarea для ввода JSON', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      expect(screen.getByTestId('package-json-input')).toBeInTheDocument();
    });
    
    it('кнопка загрузки неактивна когда JSON пустой', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      const loadButton = screen.getByTestId('load-package-button');
      expect(loadButton).toBeDisabled();
    });
    
    it('активирует кнопку загрузки когда JSON введён', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      const textarea = screen.getByTestId('package-json-input');
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } });
      
      const loadButton = screen.getByTestId('load-package-button');
      expect(loadButton).not.toBeDisabled();
    });
    
    it('вызывает onLoadPackage с распарсенным JSON', () => {
      const onLoadPackage = vi.fn().mockReturnValue({ success: true });
      render(<PackageManagerPanel {...defaultProps} onLoadPackage={onLoadPackage} />);
      
      const textarea = screen.getByTestId('package-json-input');
      const validJson = '{"name": "@test/pkg", "version": "1.0.0"}';
      fireEvent.change(textarea, { target: { value: validJson } });
      
      fireEvent.click(screen.getByTestId('load-package-button'));
      
      expect(onLoadPackage).toHaveBeenCalledWith({ name: '@test/pkg', version: '1.0.0' });
    });
    
    it('показывает ошибку при невалидном JSON', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      const textarea = screen.getByTestId('package-json-input');
      fireEvent.change(textarea, { target: { value: 'not valid json' } });
      
      fireEvent.click(screen.getByTestId('load-package-button'));
      
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');
    });
    
    it('показывает ошибки от onLoadPackage', () => {
      const onLoadPackage = vi.fn().mockReturnValue({ 
        success: false, 
        errors: ['Package schema validation failed'] 
      });
      render(<PackageManagerPanel {...defaultProps} onLoadPackage={onLoadPackage} />);
      
      const textarea = screen.getByTestId('package-json-input');
      fireEvent.change(textarea, { target: { value: '{"invalid": true}' } });
      
      fireEvent.click(screen.getByTestId('load-package-button'));
      
      expect(screen.getByRole('alert')).toHaveTextContent('Package schema validation failed');
    });
    
    it('очищает textarea после успешной загрузки', () => {
      const onLoadPackage = vi.fn().mockReturnValue({ success: true });
      render(<PackageManagerPanel {...defaultProps} onLoadPackage={onLoadPackage} />);
      
      const textarea = screen.getByTestId('package-json-input') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } });
      
      expect(textarea.value).toBe('{"name": "test"}');
      
      fireEvent.click(screen.getByTestId('load-package-button'));
      
      expect(textarea.value).toBe('');
    });
    
    it('показывает сообщение об успешной загрузке', () => {
      const onLoadPackage = vi.fn().mockReturnValue({ success: true });
      render(<PackageManagerPanel {...defaultProps} onLoadPackage={onLoadPackage} />);
      
      const textarea = screen.getByTestId('package-json-input');
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } });
      fireEvent.click(screen.getByTestId('load-package-button'));
      
      expect(screen.getByRole('alert')).toHaveTextContent('Package loaded successfully!');
    });
  });
  
  describe('Загрузка из файла', () => {
    it('показывает кнопку загрузки из файла', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      expect(screen.getByTestId('load-from-file-button')).toBeInTheDocument();
    });
    
    it('имеет скрытый file input', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      expect(fileInput).toHaveStyle({ display: 'none' });
      expect(fileInput.accept).toBe('.json');
    });
  });
  
  describe('Кнопка очистки', () => {
    it('не показывается когда textarea пустая', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    });
    
    it('показывается когда в textarea есть текст', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      const textarea = screen.getByTestId('package-json-input');
      fireEvent.change(textarea, { target: { value: 'some text' } });
      
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });
    
    it('очищает textarea при клике', () => {
      render(<PackageManagerPanel {...defaultProps} />);
      
      const textarea = screen.getByTestId('package-json-input') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'some text' } });
      
      fireEvent.click(screen.getByText('Clear'));
      
      expect(textarea.value).toBe('');
    });
  });
});
