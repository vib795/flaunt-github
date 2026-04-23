import * as fs from 'fs';
import * as path from 'path';
import { MetricsService } from './metricsService';
import { PushCredentials } from './types';
import { TrackingRepo, REPO_NAME } from './trackingRepo';

const BADGE_REL = path.join('badges', 'flaunt.svg');

export interface BadgeResult {
  svgPath: string;
  markdown: string;
}

export async function generateBadge(
  repo: TrackingRepo,
  metrics: MetricsService,
  creds: PushCredentials
): Promise<BadgeResult> {
  const langs = Object.entries(metrics.getLanguageCounts())
    .sort((a, b) => b[1] - a[1]);
  const topLang = langs[0]?.[0] ?? 'none';
  const totalSaves = langs.reduce((n, [, c]) => n + c, 0);

  const svg = renderSvg(topLang, totalSaves);

  const abs = path.join(repo.localPath, BADGE_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, svg, 'utf8');

  const branch = await repo.branch();
  const url = `https://raw.githubusercontent.com/${creds.username}/${REPO_NAME}/${branch}/${BADGE_REL.replace(/\\/g, '/')}`;
  const markdown = `![Flaunt GitHub](${url})`;

  await repo.commit('[Flaunt] update badge', [BADGE_REL]);

  return { svgPath: abs, markdown };
}

function renderSvg(topLang: string, totalSaves: number): string {
  const left = `Flaunt · ${totalSaves} saves`;
  const right = topLang;
  const leftW = Math.max(left.length * 7 + 12, 92);
  const rightW = Math.max(right.length * 7 + 12, 60);
  const total = leftW + rightW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="22">
  <linearGradient id="b" x2="0" y2="100%"><stop offset="0" stop-opacity=".1" stop-color="#fff"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <mask id="m"><rect width="${total}" height="22" rx="3" fill="#fff"/></mask>
  <g mask="url(#m)">
    <rect width="${leftW}" height="22" fill="#444"/>
    <rect x="${leftW}" width="${rightW}" height="22" fill="#4c1"/>
    <rect width="${total}" height="22" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftW / 2}" y="15">${escapeXml(left)}</text>
    <text x="${leftW + rightW / 2}" y="15">${escapeXml(right)}</text>
  </g>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}
