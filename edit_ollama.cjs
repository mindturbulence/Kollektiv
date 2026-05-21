const fs = require('fs');
let code = fs.readFileSync('services/ollamaService.ts', 'utf8');

// Replace usages of `const maxTokens =` with `const _maxTokens =` or similar, or just delete them.
code = code.replace(/const maxTokens = /g, 'const _maxTokens = ');
code = code.replace(/maxTokens(: number)/g, '_maxTokens$1');
code = code.replace(/, maxTokens = \d+/g, '');
code = code.replace(/let tokenLimit = /g, 'let _tokenLimit = ');
code = code.replace(/const tokenLimit = /g, 'let _tokenLimit = ');

fs.writeFileSync('services/ollamaService.ts', code);
