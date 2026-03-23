#!/usr/bin/env node

import { run } from './cli.js';

try {
  process.exitCode = await run(process.argv);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Fatal error:', message);
  process.exitCode = 1;
}
