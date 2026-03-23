#!/usr/bin/env node

import { run } from './cli.js';

run(process.argv)
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Fatal error:', message);
    process.exit(1);
  });
