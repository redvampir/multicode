import * as vscode from 'vscode';
import { GraphPanel } from './panel/GraphPanel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[MultiCode] ========================================');
  console.log('[MultiCode] Extension ACTIVATION started');
  console.log('[MultiCode] extensionPath:', context.extensionPath);
  console.log('[MultiCode] ========================================');
  
  const outputChannel = vscode.window.createOutputChannel('MultiCode');
  outputChannel.appendLine('[MultiCode] Extension activated!');
  outputChannel.appendLine(`[MultiCode] Timestamp: ${new Date().toISOString()}`);

  const ensurePanel = (): GraphPanel => GraphPanel.createOrShow(context, outputChannel);

  console.log('[MultiCode] Registering command: multicode.openEditor');
  const openEditor = vscode.commands.registerCommand('multicode.openEditor', () => {
    console.log('[MultiCode] Command multicode.openEditor executed!');
    outputChannel.appendLine('[MultiCode] Opening visual editor...');
    ensurePanel();
  });

  console.log('[MultiCode] Registering command: multicode.newGraph');
  const newGraph = vscode.commands.registerCommand('multicode.newGraph', () => {
    const panel = ensurePanel();
    panel.resetGraph();
  });

  console.log('[MultiCode] Registering command: multicode.saveGraph');
  const saveGraph = vscode.commands.registerCommand('multicode.saveGraph', () => {
    const panel = ensurePanel();
    void panel.saveGraph();
  });

  console.log('[MultiCode] Registering command: multicode.loadGraph');
  const loadGraph = vscode.commands.registerCommand('multicode.loadGraph', () => {
    const panel = ensurePanel();
    void panel.loadGraph();
  });

  console.log('[MultiCode] Registering command: multicode.generateCode');
  const generateCode = vscode.commands.registerCommand('multicode.generateCode', () => {
    const panel = ensurePanel();
    void panel.handleGenerateCode();
  });

  console.log('[MultiCode] Registering command: multicode.translateGraph');
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
  
  console.log('[MultiCode] All commands registered successfully!');
  console.log('[MultiCode] Registered commands:', [
    'multicode.openEditor',
    'multicode.newGraph', 
    'multicode.saveGraph',
    'multicode.loadGraph',
    'multicode.generateCode',
    'multicode.translateGraph'
  ]);
  outputChannel.appendLine('[MultiCode] Extension activation complete!');
}

export function deactivate(): void {
  console.log('[MultiCode] Extension DEACTIVATION');
  // Nothing to dispose explicitly: GraphPanel cleans up after itself.
}
