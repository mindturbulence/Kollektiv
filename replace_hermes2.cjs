const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const directories = ['./components', './utils', './services', './contexts', './constants'];
let files = ['./vite.config.ts', './types.ts'];

directories.forEach(dir => {
    walkDir(dir, filePath => {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            files.push(filePath);
        }
    });
});

for (const file of files) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let oldContent = content;
        content = content.replace(/openclaw/g, 'hermes');
        content = content.replace(/OpenClaw/g, 'Hermes');
        content = content.replace(/openClaw/g, 'hermes');
        content = content.replace(/OPENCLAW/g, 'HERMES');
        content = content.replace(/isOpenClaw/g, 'isHermes');
        
        if (content !== oldContent) {
            fs.writeFileSync(file, content);
            console.log(`Replaced in ${file}`);
        }
    }
}
