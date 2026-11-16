import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4173;
const HOST = '127.0.0.1';

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: HOST }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error('Vite did not start in time.'));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const vite = spawn(npm, ['run', 'dev', '--', '--host', HOST, '--port', String(PORT)], {
  stdio: 'inherit',
  env: process.env,
});

let electron;
const shutdown = (code = 0) => {
  if (electron && !electron.killed) electron.kill('SIGTERM');
  if (!vite.killed) vite.kill('SIGTERM');
  process.exit(code);
};

try {
  await waitForPort(PORT);
  const electronBin = process.platform === 'win32'
    ? 'node_modules/.bin/electron.cmd'
    : 'node_modules/.bin/electron';
  const env = { ...process.env, ELECTRON_START_URL: `http://${HOST}:${PORT}` };
  delete env.ELECTRON_RUN_AS_NODE;
  electron = spawn(electronBin, ['.'], { stdio: 'inherit', env });
  electron.on('exit', (code) => shutdown(code ?? 0));
  vite.on('exit', (code) => {
    if (!electron || electron.exitCode !== null) return;
    shutdown(code ?? 0);
  });
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
