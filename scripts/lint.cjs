#!/usr/bin/env node

const { execSync } = require('child_process');

const files = execSync('find src test scripts -type f \\( -name "*.cjs" -o -name "*.js" \\)', {
  encoding: 'utf8'
})
  .trim()
  .split('\n')
  .filter(Boolean);

for (const file of files) {
  execSync(`node --check ${JSON.stringify(file)}`, { stdio: 'inherit' });
}

console.log(`Checked ${files.length} files.`);
