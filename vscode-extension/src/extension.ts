import * as vscode from 'vscode';
import { GraphPanel } from './panel/GraphPanel';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('MultiCode');

  const ensurePanel = (): GraphPanel => GraphPanel.createOrShow(context, outputChannel);

  const openEditor = vscode.commands.registerCommand('multicode.openEditor', () => {
    ensurePanel();
  });

  const newGraph = vscode.commands.registerCommand('multicode.newGraph', () => {
    const panel = ensurePanel();
    panel.resetGraph();
  });

  const saveGraph = vscode.commands.registerCommand('multicode.saveGraph', () => {
    const panel = ensurePanel();
    void panel.saveGraph();
  });

  const loadGraph = vscode.commands.registerCommand('multicode.loadGraph', () => {
    const panel = ensurePanel();
    void panel.loadGraph();
  });

  const generateCode = vscode.commands.registerCommand('multicode.generateCode', () => {
    const panel = ensurePanel();
    void panel.handleGenerateCode();
  });

  const translateGraph = vscode.commands.registerCommand('multicode.translateGraph', () => {
    const panel = ensurePanel();
    void panel.translateGraphLabels();
  });

  context.subscriptions.push(
    openEditor,
    newGraph,
    saveGraph,
    loadGraph,
    generateCode,
    translateGraph,
    outputChannel
  );
}

export function deactivate(): void {
  // Nothing to dispose explicitly: GraphPanel cleans up after itself.
}
