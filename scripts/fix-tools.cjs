const fs = require('fs');
let content = fs.readFileSync('services/assistantTools.ts', 'utf8');

// 3. fetch_url - remove the webSearchResults emit
content = content.replace(
    "// Emit to web panel\n            appEventBus.emit('webSearchResults', [{\n                title: doc.title || url,\n                url,\n                markdown,\n                source: 'fetch',\n                timestamp: Date.now(),\n            }]);\n            return markdown;",
    "return markdown;"
);

// 4. open_web_page - remove the webSearchResults emit
content = content.replace(
    "// Emit to web panel\n            appEventBus.emit('webSearchResults', [{\n                title: doc.title || url,\n                url,\n                markdown,\n                source: 'fetch',\n                timestamp: Date.now(),\n            }]);\n            return `Fetched and displayed ${url} in the Web tab.`;",
    "return `Fetched and displayed ${url} in the Web tab.`;"
);

fs.writeFileSync('services/assistantTools.ts', content);
console.log('Done');