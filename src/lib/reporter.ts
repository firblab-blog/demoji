import type { EmojiContext, FileResult, Replacement, ScanResult } from './types.js';

const CONTEXT_ORDER: EmojiContext[] = [
  'COMMENT',
  'STRING_LITERAL',
  'LOG_STATEMENT',
  'IDENTIFIER',
  'OTHER',
];

const ACTION_ORDER: Replacement['action'][] = ['replace', 'remove', 'preserve', 'flag'];

const CONTEXT_LABELS: Record<EmojiContext, string> = {
  COMMENT: 'Comment',
  STRING_LITERAL: 'String',
  LOG_STATEMENT: 'Log',
  IDENTIFIER: 'Identifier',
  OTHER: 'Other',
};

const ACTION_LABELS: Record<Replacement['action'], string> = {
  replace: 'Replace',
  remove: 'Remove',
  preserve: 'Preserve',
  flag: 'Flag',
};

export function generateReport(result: ScanResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>demoji report - ${escapeHtml(result.targetPath)}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="page">
    ${renderHeader(result)}
    ${renderSummaryCards(result)}
    ${renderContextBreakdown(result)}
    ${renderFileSection(result.files)}
    ${renderFooter(result)}
  </div>
  <script>${getScript()}</script>
</body>
</html>`;
}

function renderHeader(result: ScanResult): string {
  return `<header class="panel hero">
    <div>
      <p class="eyebrow">demoji Scan Report</p>
      <h1>Scan results for ${escapeHtml(result.targetPath)}</h1>
      <p class="subtle">Generated ${escapeHtml(formatTimestamp(result.timestamp))}</p>
    </div>
    <dl class="hero-meta">
      <div>
        <dt>Mode</dt>
        <dd>${result.strict ? 'Strict' : 'Default'}</dd>
      </div>
      <div>
        <dt>Files with emoji</dt>
        <dd>${result.summary.filesWithEmoji}</dd>
      </div>
    </dl>
  </header>`;
}

function renderSummaryCards(result: ScanResult): string {
  const averageDensity = calculateAverageDensity(result.files);

  return `<section class="summary-grid" aria-label="Summary">
    ${renderSummaryCard('Total files scanned', String(result.summary.totalFiles))}
    ${renderSummaryCard('Files with emoji', String(result.summary.filesWithEmoji))}
    ${renderSummaryCard('Total emoji found', String(result.summary.totalEmoji))}
    ${renderSummaryCard('Average density', formatPercent(averageDensity))}
  </section>`;
}

function renderSummaryCard(label: string, value: string): string {
  return `<article class="panel summary-card">
    <p class="summary-label">${escapeHtml(label)}</p>
    <p class="summary-value">${escapeHtml(value)}</p>
  </article>`;
}

function renderContextBreakdown(result: ScanResult): string {
  const total = CONTEXT_ORDER.reduce((sum, context) => sum + result.summary.byContext[context], 0);
  const segments =
    total === 0
      ? '<div class="context-empty">No emoji detected</div>'
      : CONTEXT_ORDER.map((context) => {
          const count = result.summary.byContext[context];
          const width = total === 0 ? 0 : (count / total) * 100;
          const title = escapeHtml(`${CONTEXT_LABELS[context]}: ${count}`);
          return `<div class="context-segment context-${context.toLowerCase()}" style="width:${width.toFixed(2)}%" title="${title}"></div>`;
        }).join('');

  const legend = CONTEXT_ORDER.map((context) => {
    const count = result.summary.byContext[context];
    return `<li class="context-legend-item">
      <span class="context-dot context-${context.toLowerCase()}"></span>
      <span>${escapeHtml(CONTEXT_LABELS[context])}</span>
      <strong>${count}</strong>
    </li>`;
  }).join('');

  return `<section class="panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Context breakdown</p>
        <h2>Where emoji were found</h2>
      </div>
    </div>
    <div class="context-bar" role="img" aria-label="Emoji context distribution">
      ${segments}
    </div>
    <ul class="context-legend">
      ${legend}
    </ul>
  </section>`;
}

function renderFileSection(files: FileResult[]): string {
  return `<section class="panel">
    <div class="section-heading section-heading-stack">
      <div>
        <p class="eyebrow">File breakdown</p>
        <h2>Files with scan details</h2>
      </div>
      <label class="search">
        <span>Filter by path</span>
        <input id="report-filter" type="search" placeholder="Search file paths" oninput="filterTable(this.value)">
      </label>
    </div>
    <div class="table-wrap">
      <table id="report-table">
        <thead>
          <tr>
            <th scope="col">
              <button type="button" class="sort-button" onclick="sortTable(0)">File path <span class="sort-indicator"></span></button>
            </th>
            <th scope="col">
              <button type="button" class="sort-button" onclick="sortTable(1)">Emoji count <span class="sort-indicator"></span></button>
            </th>
            <th scope="col">
              <button type="button" class="sort-button" onclick="sortTable(2)">Density <span class="sort-indicator"></span></button>
            </th>
            <th scope="col">
              <button type="button" class="sort-button" onclick="sortTable(3)">Contexts found <span class="sort-indicator"></span></button>
            </th>
            <th scope="col">
              <button type="button" class="sort-button" onclick="sortTable(4)">Actions <span class="sort-indicator"></span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          ${files.map((file) => renderFileRow(file)).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderFileRow(file: FileResult): string {
  const densityClass = getDensityClass(file.emojiDensity);
  const contexts = collectContexts(file);
  const actions = countActions(file);

  return `<tr class="file-row" data-path="${escapeHtml(file.filePath.toLowerCase())}">
    <td data-sort="${escapeHtml(file.filePath.toLowerCase())}">
      <span class="file-path">${escapeHtml(file.filePath)}</span>
    </td>
    <td data-sort="${file.matches.length}">
      ${file.matches.length}
    </td>
    <td class="density-cell" data-sort="${file.emojiDensity}">
      <span class="density-pill ${densityClass}" data-density-class="${densityClass}">
        ${escapeHtml(formatPercent(file.emojiDensity))}
      </span>
    </td>
    <td data-sort="${escapeHtml(contexts.join(','))}">
      <div class="badge-row">
        ${contexts.length === 0 ? '<span class="empty-state">None</span>' : contexts.map(renderContextBadge).join('')}
      </div>
    </td>
    <td data-sort="${ACTION_ORDER.map((action) => actions[action]).join(',')}">
      <div class="action-list">
        ${ACTION_ORDER.map((action) => renderActionBadge(action, actions[action])).join('')}
      </div>
    </td>
  </tr>`;
}

function renderContextBadge(context: EmojiContext): string {
  return `<span class="badge badge-context badge-${context.toLowerCase()}">${escapeHtml(CONTEXT_LABELS[context])}</span>`;
}

function renderActionBadge(action: Replacement['action'], count: number): string {
  return `<span class="badge badge-action">${escapeHtml(ACTION_LABELS[action])}: ${count}</span>`;
}

function renderFooter(result: ScanResult): string {
  return `<footer class="footer">
    <span>Generated by demoji</span>
    <span>${escapeHtml(formatTimestamp(result.timestamp))}</span>
  </footer>`;
}

function collectContexts(file: FileResult): EmojiContext[] {
  const present = new Set(file.matches.map((match) => match.context));
  return CONTEXT_ORDER.filter((context) => present.has(context));
}

function countActions(file: FileResult): Record<Replacement['action'], number> {
  const counts = {
    replace: 0,
    remove: 0,
    preserve: 0,
    flag: 0,
  };

  for (const replacement of file.replacements) {
    counts[replacement.action] += 1;
  }

  return counts;
}

function calculateAverageDensity(files: FileResult[]): number {
  if (files.length === 0) {
    return 0;
  }

  const total = files.reduce((sum, file) => sum + file.emojiDensity, 0);
  return total / files.length;
}

function getDensityClass(density: number): 'density-low' | 'density-medium' | 'density-high' {
  if (density < 0.02) {
    return 'density-low';
  }

  if (density <= 0.05) {
    return 'density-medium';
  }

  return 'density-high';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

function getStyles(): string {
  return `
:root {
  color-scheme: light dark;
  --bg: #f5f7fb;
  --panel: #ffffff;
  --panel-border: #d6deeb;
  --text: #162033;
  --muted: #607089;
  --shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
  --comment: #2563eb;
  --string-literal: #16a34a;
  --log-statement: #ea580c;
  --identifier: #dc2626;
  --other: #6b7280;
  --density-low-bg: #dcfce7;
  --density-low-text: #166534;
  --density-medium-bg: #fef3c7;
  --density-medium-text: #92400e;
  --density-high-bg: #fee2e2;
  --density-high-text: #991b1b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --panel: #111827;
    --panel-border: #243046;
    --text: #e5edf8;
    --muted: #9fb0c8;
    --shadow: 0 22px 46px rgba(2, 6, 23, 0.45);
    --comment: #60a5fa;
    --string-literal: #4ade80;
    --log-statement: #fb923c;
    --identifier: #f87171;
    --other: #9ca3af;
    --density-low-bg: rgba(34, 197, 94, 0.18);
    --density-low-text: #86efac;
    --density-medium-bg: rgba(245, 158, 11, 0.2);
    --density-medium-text: #fcd34d;
    --density-high-bg: rgba(239, 68, 68, 0.22);
    --density-high-text: #fca5a5;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.08), transparent 260px), var(--bg);
  color: var(--text);
}

.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  box-shadow: var(--shadow);
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 28px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: clamp(1.8rem, 4vw, 2.8rem);
}

h2 {
  font-size: 1.2rem;
}

.subtle,
.summary-label,
.footer {
  color: var(--muted);
}

.hero-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 16px;
  margin: 0;
}

.hero-meta div {
  padding: 14px 16px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
}

.hero-meta dt {
  margin-bottom: 6px;
  font-size: 0.82rem;
  color: var(--muted);
}

.hero-meta dd {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.summary-card {
  padding: 20px;
}

.summary-label {
  margin: 0 0 8px;
  font-size: 0.92rem;
}

.summary-value {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.section-heading-stack {
  align-items: flex-end;
}

.context-bar {
  display: flex;
  overflow: hidden;
  min-height: 22px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
}

.context-empty {
  width: 100%;
  padding: 10px;
  text-align: center;
  color: var(--muted);
  font-size: 0.92rem;
}

.context-segment {
  min-width: 0;
}

.context-comment {
  background: var(--comment);
}

.context-string_literal {
  background: var(--string-literal);
}

.context-log_statement {
  background: var(--log-statement);
}

.context-identifier {
  background: var(--identifier);
}

.context-other {
  background: var(--other);
}

.context-legend {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  padding: 0;
  margin: 18px 0 0;
  list-style: none;
}

.context-legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.context-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 12px;
  border-top: 1px solid var(--panel-border);
  text-align: left;
  vertical-align: top;
}

thead th {
  border-top: 0;
  border-bottom: 1px solid var(--panel-border);
}

.sort-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.sort-indicator {
  color: var(--muted);
  font-size: 0.82rem;
}

.file-path {
  word-break: break-word;
}

.badge-row,
.action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  font-size: 0.84rem;
}

.badge-comment {
  border-color: color-mix(in srgb, var(--comment) 35%, var(--panel-border));
  color: var(--comment);
}

.badge-string_literal {
  border-color: color-mix(in srgb, var(--string-literal) 35%, var(--panel-border));
  color: var(--string-literal);
}

.badge-log_statement {
  border-color: color-mix(in srgb, var(--log-statement) 35%, var(--panel-border));
  color: var(--log-statement);
}

.badge-identifier {
  border-color: color-mix(in srgb, var(--identifier) 35%, var(--panel-border));
  color: var(--identifier);
}

.badge-other {
  border-color: color-mix(in srgb, var(--other) 35%, var(--panel-border));
  color: var(--other);
}

.density-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-weight: 700;
}

.density-low {
  background: var(--density-low-bg);
  color: var(--density-low-text);
}

.density-medium {
  background: var(--density-medium-bg);
  color: var(--density-medium-text);
}

.density-high {
  background: var(--density-high-bg);
  color: var(--density-high-text);
}

.search {
  display: grid;
  gap: 6px;
  min-width: min(100%, 280px);
  color: var(--muted);
  font-size: 0.9rem;
}

.search input {
  width: 100%;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: transparent;
  color: var(--text);
  font: inherit;
}

.empty-state {
  color: var(--muted);
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  font-size: 0.92rem;
}

section.panel {
  margin-top: 20px;
  padding: 24px;
}

@media (max-width: 860px) {
  .hero,
  .hero-meta,
  .summary-grid,
  .context-legend {
    grid-template-columns: 1fr 1fr;
  }

  .hero {
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .context-legend {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .page {
    padding: 20px 14px 32px;
  }

  section.panel,
  .hero {
    padding: 18px;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .context-legend,
  .hero-meta {
    grid-template-columns: 1fr;
  }

  .section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .footer {
    flex-direction: column;
  }
}
`;
}

function getScript(): string {
  return `
let activeSortColumn = 0;
let activeSortDirection = 'asc';

function updateIndicators(headers) {
  headers.forEach(function (header, index) {
    const indicator = header.querySelector('.sort-indicator');
    if (!indicator) {
      return;
    }
    if (index !== activeSortColumn) {
      indicator.textContent = '';
      return;
    }
    indicator.textContent = activeSortDirection === 'asc' ? 'ASC' : 'DESC';
  });
}

function sortTable(columnIndex) {
  const table = document.getElementById('report-table');
  if (!table) {
    return;
  }

  const body = table.tBodies[0];
  const rows = Array.from(body.rows);
  const headers = Array.from(table.tHead.rows[0].cells);

  if (activeSortColumn === columnIndex) {
    activeSortDirection = activeSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    activeSortColumn = columnIndex;
    activeSortDirection = columnIndex === 0 ? 'asc' : 'desc';
  }

  rows.sort(function (left, right) {
    const leftCell = left.cells[columnIndex];
    const rightCell = right.cells[columnIndex];
    const leftValue = leftCell.dataset.sort || leftCell.textContent || '';
    const rightValue = rightCell.dataset.sort || rightCell.textContent || '';
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    let comparison = 0;

    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      comparison = leftNumber - rightNumber;
    } else {
      comparison = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
    }

    return activeSortDirection === 'asc' ? comparison : -comparison;
  });

  rows.forEach(function (row) {
    body.appendChild(row);
  });

  updateIndicators(headers);
}

function filterTable(query) {
  const table = document.getElementById('report-table');
  if (!table) {
    return;
  }

  const normalized = query.trim().toLowerCase();
  Array.from(table.tBodies[0].rows).forEach(function (row) {
    const path = row.dataset.path || '';
    row.hidden = normalized !== '' && !path.includes(normalized);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  const table = document.getElementById('report-table');
  if (!table || !table.tHead) {
    return;
  }
  updateIndicators(Array.from(table.tHead.rows[0].cells));
});
`;
}

function escapeHtml(str: string): string {
  return str
    .replaceAll(/&/gu, '&amp;')
    .replaceAll(/</gu, '&lt;')
    .replaceAll(/>/gu, '&gt;')
    .replaceAll(/"/gu, '&quot;')
    .replaceAll(/'/gu, '&#039;');
}
