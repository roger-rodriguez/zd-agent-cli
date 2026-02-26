#!/usr/bin/env node

const { execSync } = require('child_process');

execSync('node --import tsx src/cli.ts --help', { stdio: 'pipe' });
execSync('node --import tsx src/cli.ts queue --help', { stdio: 'pipe' });
execSync('node --import tsx src/cli.ts auth --help', { stdio: 'pipe' });
execSync('node --import tsx src/cli.ts doctor --help', { stdio: 'pipe' });
execSync('node dist/cli.js --help', { stdio: 'pipe' });

console.log('Smoke checks passed.');
