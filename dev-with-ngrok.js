#!/usr/bin/env node
// dev-with-ngrok.js - Starts ngrok, captures URL, then starts dev server

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Start ngrok and capture the HTTPS URL
const ngrok = spawn('C:\\Users\\dwun2\\AppData\\Roaming\\npm\\ngrok.cmd', ['http', '7500', '--log=stdout'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});

let ngrokUrl = '';

ngrok.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('[ngrok]', output.trim());

  // Parse the HTTPS forwarding URL
  const match = output.match(/https:\/\/[a-z0-9-]+\.ngrok-free\.app/);
  if (match && !ngrokUrl) {
    ngrokUrl = match[0];
    console.log(`\n✅ ngrok URL: ${ngrokUrl}`);
    console.log(`📋 Add to Spotify Dashboard: ${ngrokUrl}/auth/spotify/callback\n`);
    
    // Set env var for the dev server
    process.env.NGROK_URL = ngrokUrl;
    process.env.SPOTIFY_REDIRECT_URI = `${ngrokUrl}/auth/spotify/callback`;
    
    // Start the dev server
    startDevServer();
  }
});

ngrok.stderr.on('data', (data) => {
  console.error('[ngrok err]', data.toString());
});

function startDevServer() {
  const server = spawn('npx', ['tsx', 'server.ts'], {
    stdio: 'inherit',
    env: { ...process.env, NGROK_URL: ngrokUrl },
    cwd: __dirname,
  });

  server.on('exit', (code) => {
    console.log(`Dev server exited with code ${code}`);
    ngrok.kill();
    process.exit(code);
  });
}

// Handle shutdown
process.on('SIGINT', () => {
  ngrok.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  ngrok.kill();
  process.exit(0);
});

console.log('🚀 Starting ngrok tunnel...');