const fs = require('fs');
let content = fs.readFileSync('services/assistantTools.ts', 'utf8');

// Fix 1: web_search first emit
content = content.replace(
    'appEventBus.emit("webSearchResults", results);\n                        return JSON.stringify(data);',
    '// Return raw data to assistant for synthesis\n                        return JSON.stringify(data);'
);

// Fix 2: google-gemini fallback
content = content.replace(
    'appEventBus.emit("webSearchResults", results);\n                    }\n                } catch {}\n                return geminiResult;',
    'return geminiResult;'
);

// Fix 3: fetch_url
content = content.replace(
    "// Emit to web panel\n            appEventBus.emit('webSearchResults', [{\n                title: doc.title || url,\n                url,\n                markdown,\n                source: 'fetch',\n                timestamp: Date.now(),\n            }]);\n            return markdown;",
    'return markdown;'
);

// Fix 4: open_web_page
content = content.replace(
    "// Emit to web panel\n            appEventBus.emit('webSearchResults', [{\n                title: doc.title || url,\n                url,\n                markdown,\n                source: 'fetch',\n                timestamp: Date.now(),\n            }]);\n            return `Fetched and displayed ${url} in the Web tab.`;",
    'return `Fetched and displayed ${url} in the Web tab.`;'
);

fs.writeFileSync('services/assistantTools.ts', content);
console.log('Done');