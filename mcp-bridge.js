#!/usr/bin/env node

/**
 * Kollektiv Local MCP Bridge (Stdio to HTTP/JSON-RPC)
 * ----------------------------------------------------
 * High-performance, zero-dependency bridge to expose Docker Desktop's 
 * stdio-based MCP (Model Context Protocol) server over a local HTTP port.
 * 
 * Running this script locally allows Kollektiv's frontend (browser or remote)
 * to communicate seamlessly with your local Docker MCP servers.
 */

import { spawn } from 'child_process';
import http from 'http';
import os from 'os';

// Parse command line arguments
const cliArgs = process.argv.slice(2);
let port = 3010;
let spawnCmd = 'docker';
let spawnArgs = ['mcp', 'client', 'connect'];

for (let i = 0; i < cliArgs.length; i++) {
  if ((cliArgs[i] === '--port' || cliArgs[i] === '-p') && cliArgs[i + 1]) {
    port = parseInt(cliArgs[i + 1], 10);
    i++;
  } else if ((cliArgs[i] === '--cmd' || cliArgs[i] === '-c') && cliArgs[i + 1]) {
    spawnCmd = cliArgs[i + 1];
    i++;
  } else if ((cliArgs[i] === '--args' || cliArgs[i] === '-a') && cliArgs[i + 1]) {
    // If the next arg is surrounded by double quotes, parse it as a single string of arguments
    const argStr = cliArgs[i + 1];
    // Split on spaces but respect quotes if possible, otherwise simple split is fine
    spawnArgs = argStr.match(/(?:[^\s"]+|"[^"]*")+/g) || argStr.split(' ');
    // Remove outermost quotes from each argument
    spawnArgs = spawnArgs.map(arg => arg.replace(/^"|"$/g, ''));
    i++;
  } else if (cliArgs[i] === '--help' || cliArgs[i] === '-h') {
    console.log(`
Kollektiv Local MCP Bridge
Usage: node mcp-bridge.js [options]

Options:
  -p, --port <number>   Local port to listen on (default: 3010)
  -c, --cmd <string>    Command to launch the MCP stdio server (default: docker)
  -a, --args <string>   Space-separated arguments for the command (default: mcp client connect)
  -h, --help            Show this help guide

Examples:
  • Default (Use Docker CLI plugin):
    node mcp-bridge.js

  • Connect to a custom Docker container (e.g. mcp-gateway image):
    node mcp-bridge.js --cmd "docker" --args "run -i --rm -v //./pipe/docker_engine://./pipe/docker_engine docker/desktop-mcp-gateway"

  • Connect to any local stdio MCP server (e.g. node-managed server):
    node mcp-bridge.js --cmd "npx" --args "-y @modelcontextprotocol/server-everything"
`);
    process.exit(0);
  }
}

// OS Socket Detection
const isWindows = os.platform() === 'win32';

console.log('--------------------------------------------------');
console.log('🤖 KOLLEKTIV LOCAL MCP BRIDGE');
console.log('--------------------------------------------------');
console.log(`• OS Detected:     ${os.type()} (${os.platform()})`);
console.log(`• Local Port:      http://localhost:${port}`);
console.log(`• Command:         ${spawnCmd}`);
console.log(`• Arguments:       ${spawnArgs.join(' ')}`);
console.log('--------------------------------------------------');

let childProcess = null;
const pendingRequests = new Map();
let stdoutBuffer = '';

function startMcpProcess() {
  console.log(`⚙️ Starting Local MCP process:`);
  console.log(`  > ${spawnCmd} ${spawnArgs.join(' ')}\n`);

  childProcess = spawn(spawnCmd, spawnArgs, {
    shell: isWindows // On Windows, shell ensures CMD environment wraps spawn securely
  });

  childProcess.on('error', (err) => {
    console.error(`\n❌ Could not start MCP process: "${spawnCmd}"`);
    console.error(`  Please verify that "${spawnCmd}" is installed and available in your PATH.`);
    console.error(`  Error message: ${err.message}\n`);
    process.exit(1);
  });

  // Handle standard output logs
  childProcess.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

      if (line) {
        // Log all raw messages to console for easy tracing
        if (!line.startsWith('{')) {
          console.log(`[MCP Log]: ${line}`);
          continue;
        }

        try {
          const response = JSON.parse(line);
          if (response && response.id !== undefined) {
            const pending = pendingRequests.get(response.id);
            if (pending) {
              pendingRequests.delete(response.id);
              clearTimeout(pending.timeoutId);
              pending.resolve(response);
            }
          } else {
            console.log(`[MCP Notification]:`, response);
          }
        } catch (err) {
          console.log(`[MCP Stdout (Raw)]: ${line}`);
        }
      }
    }
  });

  // Handle errors / status logs on stderr
  childProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      // Print everything so the user gets visibility
      console.warn(`[Process Stderr]: ${message}`);
    }
  });

  childProcess.on('close', (code) => {
    console.log(`\n🔴 Local MCP process exited with code ${code}`);
    // Clear any unresolved pending requests
    for (const [id, req] of pendingRequests.entries()) {
      clearTimeout(req.timeoutId);
      req.reject(new Error(`Local MCP process exited unexpectedly with code ${code}`));
    }
    pendingRequests.clear();
    
    console.log('⚠️ Bridge closed. Press Ctrl+C to terminate or wait for restart.');
  });
}

// Start the subprocess
startMcpProcess();

// Create local HTTP/JSON-RPC Server
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // MCP only accepts POST requests with JSON body
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      if (!body) {
        throw new Error('Empty request body');
      }

      const payload = JSON.parse(body);
      
      // Validation of JSON-RPC format
      if (!payload.method) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON-RPC: Missing "method"' }));
        return;
      }

      // If no ID is supplied, create one so we can match the stdout response.
      // Notifications (method starting with "notifications/") must NOT have an id.
      const isNotification = typeof payload.method === 'string' && payload.method.startsWith('notifications/');
      const requestId = payload.id !== undefined ? payload.id : (isNotification ? undefined : Date.now());
      if (!isNotification) payload.id = requestId;
      else delete payload.id;

      if (!childProcess || childProcess.exitCode !== null) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'MCP backend service is offline.' }));
        return;
      }

      // Send the single line JSON message to container stdio
      const message = JSON.stringify(payload) + '\n';
      childProcess.stdin.write(message);

      // Notifications get no response from the MCP process; acknowledge immediately.
      if (isNotification) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Create Promise that resolves when MCP outputs a message with this response ID
      const responsePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error(`Timeout waiting for MCP response to request ${requestId}`));
        }, 15000); // 15 seconds timeout

        pendingRequests.set(requestId, { resolve, reject, timeoutId });
      });

      // Await and return the response
      responsePromise
        .then(mcpResponse => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mcpResponse));
        })
        .catch(err => {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON. ' + err.message }));
    }
  });
});

// Start listening
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`🚀 Bridge listening at: http://localhost:${port}`);
  console.log(`👉 Enter this URL in Kollektiv Settings -> MCP Server URL to connect!\n`);
});

// Clean termination
process.on('SIGINT', () => {
  console.log('\nStopping MCP Bridge...');
  if (childProcess) {
    childProcess.kill();
  }
  server.close(() => {
    console.log('HTTP Server closed.');
    process.exit(0);
  });
});
