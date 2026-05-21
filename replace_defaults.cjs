const fs = require('fs');

const files = [
    './utils/settingsStorage.ts',
    './services/hermesService.ts',
    './components/SetupPage.tsx',
    './components/LLMChatPanel.tsx'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/ollama\/kimi-k2\.5:cloud/g, 'hermes-agent');
        fs.writeFileSync(file, content);
    }
}
