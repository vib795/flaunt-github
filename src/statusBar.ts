import * as vscode from 'vscode';

export type StatusState =
  | { kind: 'initializing' }
  | { kind: 'paused' }
  | { kind: 'waiting'; nextAt: number }
  | { kind: 'committing' }
  | { kind: 'error'; message: string };

const COMMAND_ID = 'codeTracking.showMenu';

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private tick?: NodeJS.Timeout;
  private state: StatusState = { kind: 'initializing' };

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = COMMAND_ID;
    this.item.show();
    this.render();
    this.tick = setInterval(() => this.render(), 1000);
  }

  setState(state: StatusState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    switch (this.state.kind) {
      case 'initializing':
        this.item.text = '$(sync~spin) Flaunt: initializing';
        break;
      case 'paused':
        this.item.text = '$(debug-pause) Flaunt: paused';
        this.item.tooltip = 'Click to resume tracking.';
        break;
      case 'committing':
        this.item.text = '$(cloud-upload) Flaunt: committing';
        break;
      case 'error':
        this.item.text = `$(error) Flaunt: ${this.state.message}`;
        this.item.tooltip = this.state.message;
        break;
      case 'waiting': {
        const diff = Math.max(this.state.nextAt - Date.now(), 0);
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        this.item.text = `$(clock) Flaunt: next commit in ${m}m ${s}s`;
        this.item.tooltip = 'Click for Flaunt GitHub options.';
        break;
      }
    }
  }

  dispose(): void {
    if (this.tick) {clearInterval(this.tick);}
    this.item.dispose();
  }
}
