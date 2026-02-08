#!/usr/bin/env node

const requiredMajor = 20;
const nodeVersion = process.versions.node || '0.0.0';
const major = Number.parseInt(nodeVersion.split('.')[0], 10);

if (!Number.isFinite(major) || major < requiredMajor) {
  console.error(
    `Node ${requiredMajor}+ is required. Detected ${nodeVersion}. Please run \`nvm use\` (or upgrade Node) and retry.`,
  );
  process.exit(1);
}
