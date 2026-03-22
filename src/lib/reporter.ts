import type { ScanResult } from './types.js';

export function generateReport(results: ScanResult[]): string {
  return `Scanned ${results.length} result set(s).`;
}
