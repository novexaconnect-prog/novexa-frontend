const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const frontendDir = __dirname;
const backendDir = path.resolve(frontendDir, '..', 'backend');
const backendPackage = path.join(backendDir, 'package.json');
const backendModules = path.join(backendDir, 'node_modules', 'express');

if (!fs.existsSync(backendPackage)) {
  console.error('Novexa backend was not found at:', backendDir);
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!fs.existsSync(backendModules)) {
  console.log('Backend dependencies are missing. Installing them now...');
  const result = spawnSync(npm, ['install', '--prefix', backendDir], {
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    console.error('Backend dependency installation failed. Run: npm --prefix ../backend install');
    process.exit(result.status || 1);
  }
}

console.log('Starting Novexa from the frontend folder...');
console.log('Server: http://localhost:3000');
console.log('Press Ctrl+C to stop Novexa.');

const child = spawn(npm, ['start', '--prefix', backendDir], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false
});

child.on('error', (err) => {
  console.error('Could not start the Novexa backend:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

function shutdown(signal) {
  if (!child.killed) child.kill(signal);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
