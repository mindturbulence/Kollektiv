const fs = require('fs');
const files = [
    './components/LlmStatusPanel.tsx',
    './components/Footer.tsx',
    './components/LlmStatusSwitcher.tsx',
    './components/SetupPage.tsx',
    './components/LLMChatPanel.tsx',
    './utils/settingsStorage.ts',
    './services/hermesService.ts',
    './services/llmService.ts',
    './contexts/SettingsContext.tsx',
    './vite.config.ts',
    './types.ts'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/openclaw/g, 'hermes');
        content = content.replace(/OpenClaw/g, 'Hermes');
        content = content.replace(/OPENCLAW/g, 'HERMES');
        
        fs.writeFileSync(file, content);
        console.log(`Replaced in ${file}`);
    } else {
        console.log(`File not found: ${file}`);
    }
}
