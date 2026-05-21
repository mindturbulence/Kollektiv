import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";

// Array to keep track of active SSE connections
let clients: express.Response[] = [];

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7500;
  const HOST = process.env.PORT ? "0.0.0.0" : "127.0.0.1";

  app.use(cors());
  app.use(express.json());

  // --- API Routes ---
  
  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // SSE endpoint for Kollektiv frontend to receive commands
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection establish event
    res.write("data: {\"type\": \"connected\"}\n\n");

    clients.push(res);

    req.on("close", () => {
      clients = clients.filter((client) => client !== res);
    });
  });

  // Endpoint for Hermes (or external agent) to send control commands
  // E.g. POST /api/hermes/control -> { "action": "navigate", "payload": "prompts" }
  app.post("/api/hermes/control", (req, res) => {
    const { action, payload } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    const commandStr = JSON.stringify({ action, payload });

    // Broadcast the command to all connected frontend clients
    clients.forEach((client) => {
      client.write(`data: ${commandStr}\n\n`);
    });

    res.json({ success: true, message: `Command '${action}' sent to ${clients.length} clients.` });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  }).on('error', (err: any) => {
    console.error('Failed to start Express server:', err);
  });
}

startServer();
