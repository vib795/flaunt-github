import * as vscode from 'vscode';
import { log } from './logger';

const CONSENT_KEY = 'codeTracking.consentAccepted.v1';

export async function ensureConsent(
  ctx: vscode.ExtensionContext,
  samplePreview: string
): Promise<boolean> {
  if (ctx.globalState.get<boolean>(CONSENT_KEY, false)) {
    return true;
  }

  const detail = [
    'Flaunt GitHub will push coding activity to a PRIVATE repo named "code-tracking" in your GitHub account.',
    '',
    'Example of what will be committed:',
    samplePreview,
    '',
    'You can pause tracking anytime, configure ignore patterns, or enable path redaction.'
  ].join('\n');

  const pick = await vscode.window.showInformationMessage(
    'Flaunt GitHub: allow tracking your coding activity?',
    { modal: true, detail },
    'Enable',
    'Not now'
  );

  if (pick === 'Enable') {
    await ctx.globalState.update(CONSENT_KEY, true);
    log('User accepted tracking consent.');
    return true;
  }

  log('User declined tracking consent.');
  return false;
}

export async function resetConsent(ctx: vscode.ExtensionContext): Promise<void> {
  await ctx.globalState.update(CONSENT_KEY, false);
}
