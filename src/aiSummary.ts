import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { log, logError } from './logger';
import { TrackingRepo } from './trackingRepo';
import { FlauntConfig } from './types';

const DAILY_REL = (date: string) => path.join('journal', 'daily', `${date}.md`);

export async function generateDailySummary(
  repo: TrackingRepo,
  cfg: FlauntConfig,
  entries: string[]
): Promise<string | undefined> {
  if (!cfg.aiSummaryEnabled || !cfg.anthropicApiKey) {return undefined;}
  if (entries.length === 0) {return undefined;}

  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(repo.localPath, DAILY_REL(today));
  if (fs.existsSync(target)) {
    log(`AI summary already exists for ${today}; skipping.`);
    return DAILY_REL(today);
  }

  const prompt = [
    'You are writing a short private journal entry summarizing a developer\'s coding activity for the day.',
    'Rules: 2-3 sentences max. Past tense. Mention languages and themes inferred from file paths. Do NOT fabricate features you cannot infer. No emoji, no exclamation marks.',
    '',
    'Activity log:',
    entries.slice(-400).join('\n')
  ].join('\n');

  let summary: string;
  try {
    summary = await callAnthropic(cfg.anthropicApiKey, cfg.aiModel, prompt);
  } catch (e) {
    logError('AI summary request failed', e);
    return undefined;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const header = `# ${today}\n\n`;
  fs.writeFileSync(target, header + summary.trim() + '\n', 'utf8');
  return DAILY_REL(today);
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const body = JSON.stringify({
    model,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-length': Buffer.byteLength(body)
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(raw) as AnthropicResponse;
            if (parsed.error) {
              return reject(new Error(parsed.error.message ?? raw));
            }
            const text = parsed.content?.[0]?.text;
            if (!text) {return reject(new Error('Empty response'));}
            resolve(text);
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
