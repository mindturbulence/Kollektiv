import express from "express";

const router = express.Router();

// Proxy for local Ollama gateway
router.use("/ollama-local", async (req, res) => {
  try {
    const subPath = req.url;
    const targetUrl = `http://127.0.0.1:11434${subPath}`;

    const fetchOptions: any = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
      }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (err: any) {
      console.warn('Ollama IPv4 proxy failed, trying localhost fallback...', err.message);
      try {
        const fallbackUrl = `http://localhost:11434${subPath}`;
        response = await fetch(fallbackUrl, fetchOptions);
      } catch (fallbackErr: any) {
        console.warn('Ollama localhost proxy failed, trying IPv6 fallback...', fallbackErr.message);
        const ipv6Url = `http://[::1]:11434${subPath}`;
        response = await fetch(ipv6Url, fetchOptions);
      }
    }

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    if (!response.body) {
      res.end();
      return;
    }

    const reader = (response.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    console.error('Ollama Local Proxy Error:', err);
    if (!res.headersSent) {
      const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
      const customMessage = isCloudEnv
        ? "Connection refused to 127.0.0.1:11434. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http 11434') and update the secure URL in settings."
        : `Connection refused. Please make sure your Ollama instance is running locally on port 11434: ${err.message}`;
      res.status(502).json({
        error: 'Ollama proxy failed',
        message: customMessage,
        code: 'ECONNREFUSED'
      });
    }
  }
});

// Proxy for local Llama.cpp gateway
router.use("/llamacpp-local", async (req, res) => {
  try {
    const subPath = req.url;
    const targetUrl = `http://127.0.0.1:8080${subPath}`;

    const fetchOptions: any = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
      }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (err: any) {
      try {
        const fallbackUrl = `http://localhost:8080${subPath}`;
        response = await fetch(fallbackUrl, fetchOptions);
      } catch (fallbackErr: any) {
        const ipv6Url = `http://[::1]:8080${subPath}`;
        response = await fetch(ipv6Url, fetchOptions);
      }
    }

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    if (!response.body) {
      res.end();
      return;
    }

    const reader = (response.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    const isConnRefused = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED';
    if (!isConnRefused) {
      console.error('Llama.cpp Local Proxy Error:', err);
    }
    if (!res.headersSent) {
      const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
      const customMessage = isCloudEnv
        ? "Connection refused to 127.0.0.1:8080. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http 8080') and update the secure URL in settings."
        : `Connection refused. Please make sure your llama.cpp server is running locally on port 8080: ${err.message}`;
      res.status(502).json({
        error: 'Llama.cpp proxy failed',
        message: customMessage,
        code: 'ECONNREFUSED'
      });
    }
  }
});

// Proxy for local ComfyUI gateway
router.use("/comfy-local", async (req, res) => {
  try {
    const subPath = req.url;
    const comfyPort = parseInt(process.env.COMFY_UI_PORT || "8188", 10);
    const targetUrl = `http://127.0.0.1:${comfyPort}${subPath}`;

    const fetchOptions: any = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
      }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (err: any) {
      console.warn('ComfyUI IPv4 proxy failed, trying localhost fallback...', err.message);
      try {
        const fallbackUrl = `http://localhost:${comfyPort}${subPath}`;
        response = await fetch(fallbackUrl, fetchOptions);
      } catch (fallbackErr: any) {
        console.warn('ComfyUI localhost proxy failed, trying IPv6 fallback...', fallbackErr.message);
        const ipv6Url = `http://[::1]:${comfyPort}${subPath}`;
        response = await fetch(ipv6Url, fetchOptions);
      }
    }

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    if (!response.body) {
      res.end();
      return;
    }

    const reader = (response.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    console.error('ComfyUI Local Proxy Error:', err);
    if (!res.headersSent) {
      const comfyPort = parseInt(process.env.COMFY_UI_PORT || "8188", 10);
      const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
      const customMessage = isCloudEnv
        ? `Connection refused to 127.0.0.1:${comfyPort}. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http ${comfyPort}') and update the secure URL in settings.`
        : `Connection refused. Please make sure your ComfyUI instance is running locally on port ${comfyPort} with its API enabled: ${err.message}`;
      res.status(502).json({
        error: 'ComfyUI proxy failed',
        message: customMessage,
        code: 'ECONNREFUSED'
      });
    }
  }
});

// Proxy for local A1111 / Forge Neo gateway
router.use("/a1111-local", async (req, res) => {
  try {
    const subPath = req.url;
    const a1111Port = parseInt(process.env.A1111_PORT || "7860", 10);
    const targetUrl = `http://127.0.0.1:${a1111Port}${subPath}`;

    const fetchOptions: any = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
      }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (err: any) {
      console.warn('A1111 IPv4 proxy failed, trying localhost fallback...', err.message);
      try {
        const fallbackUrl = `http://localhost:${a1111Port}${subPath}`;
        response = await fetch(fallbackUrl, fetchOptions);
      } catch (fallbackErr: any) {
        console.warn('A1111 localhost proxy failed, trying IPv6 fallback...', fallbackErr.message);
        const ipv6Url = `http://[::1]:${a1111Port}${subPath}`;
        response = await fetch(ipv6Url, fetchOptions);
      }
    }

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    if (!response.body) {
      res.end();
      return;
    }

    const reader = (response.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    console.error('A1111 Local Proxy Error:', err);
    if (!res.headersSent) {
      const a1111Port = parseInt(process.env.A1111_PORT || "7860", 10);
      const isCloudEnv = process.env.NODE_ENV === 'production' || req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1');
      const customMessage = isCloudEnv
        ? `Connection refused to 127.0.0.1:${a1111Port}. Because Kollektiv is hosted on a remote cloud server, it cannot connect directly to a localhost service running on your computer. Please configure a secure public tunnel (like ngrok, e.g., 'ngrok http ${a1111Port}') and update the secure URL in settings.`
        : `Connection refused. Please make sure your A1111 / Forge Neo instance is running locally on port ${a1111Port} with its API enabled: ${err.message}`;
      res.status(502).json({
        error: 'A1111 proxy failed',
        message: customMessage,
        code: 'ECONNREFUSED'
      });
    }
  }
});

export default router;
