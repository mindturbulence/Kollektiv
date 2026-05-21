const fs = require('fs');
let code = fs.readFileSync('services/llmService.ts', 'utf8');

// remove isOpenRouter from anywhere it's wrongly inserted
code = code.replace(/    const isOpenRouter = settings\.activeLLM === 'openrouter';\n/g, '');

// insert it specifically in streamChat
code = code.replace(
    /    const isOpenClaw = settings\.activeLLM === 'openclaw';\n\n    \/\/ Process text attachments from messages/g,
    `    const isOpenClaw = settings.activeLLM === 'openclaw';\n    const isOpenRouter = settings.activeLLM === 'openrouter';\n\n    // Process text attachments from messages`
);

fs.writeFileSync('services/llmService.ts', code);
