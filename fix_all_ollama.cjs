const fs = require('fs');

let code = fs.readFileSync('services/ollamaService.ts', 'utf8');

// Replace standard generate with chat 
code = code.replace(/fetch\(`\$\{config\.baseUrl\}\/api\/generate`, \{\s*method: 'POST',\s*headers: config\.headers,\s*body: JSON\.stringify\(\{([\s\S]*?)\}\),\s*\}\);/g, (match, bodyStr) => {
    
    // Extract model, prompt, system, stream, format, options etc.
    let newBodyStr = bodyStr;
    
    // Handle Images Array inside prompt (for abstractImageOllama)
    let imagesStr = "";
    const imagesMatch = newBodyStr.match(/images:\s*\[(.*?)\]\s*,/);
    if(imagesMatch) {
       imagesStr = `, images: [${imagesMatch[1]}]`;
       newBodyStr = newBodyStr.replace(/images:\s*\[(.*?)\]\s*,\n\s*/, '');
    }

    let systemVal = null;
    let promptVal = null;
    
    // Better regex matching that doesn't over-consume
    const systemRegex = /system:\s*([^,]+?)(?=,\s*stream:|\s*\})/;
    const systemMatch = newBodyStr.match(systemRegex);
    if(systemMatch && !systemMatch[1].includes('messages:')) {
       systemVal = systemMatch[1];
       newBodyStr = newBodyStr.replace(/system:\s*([^,]+?)(?=,\s*stream:|\s*\})/, "system: REMOVE_ME");
    } else {
        const sysMatch2 = newBodyStr.match(/system:\s*(.*?),\s*stream:/);
        if(sysMatch2 && !sysMatch2[1].includes('messages:')) {
            systemVal = sysMatch2[1];
            newBodyStr = newBodyStr.replace(/system:\s*(.*?),\s*stream:/, "system: REMOVE_ME,\n                stream:");
        }
    }

    const promptRegex = /prompt:\s*([^,]+?)(?=,\s*system:|\s*,\s*stream:|\s*\})/;
    const promptMatch = newBodyStr.match(promptRegex);
    if (promptMatch && !promptMatch[1].includes('messages:')) {
        promptVal = promptMatch[1];
        newBodyStr = newBodyStr.replace(/prompt:\s*([^,]+?)(?=,\s*system:|\s*,\s*stream:|\s*\})/, 'prompt: REMOVE_ME');
    } else {
        const promptMatch2 = newBodyStr.match(/prompt:\s*(.*?),\s*(system:|stream:)/);
        if (promptMatch2 && !promptMatch2[1].includes('messages:')) {
            promptVal = promptMatch2[1];
            newBodyStr = newBodyStr.replace(/prompt:\s*(.*?),\s*(system:|stream:)/, `prompt: REMOVE_ME,\n                $2`);
        }
    }

    if(!promptVal && !systemVal) {
        // If it doesn't have prompt or system clearly, just return the original match
        // Or if it already has messages, swap endpoint
        if (newBodyStr.includes('messages:')) {
           return match.replace('/api/generate', '/api/chat');
        }
        return match; // Couldn't parse
    }

    // Replace prompt and system with messages
    if (promptVal && systemVal) {
        let replacement = `messages: [\n                    { role: 'system', content: ${systemVal} },\n                    { role: 'user', content: ${promptVal}${imagesStr} }\n                ],`;
        
        // Add messages after model: config.model,
        newBodyStr = newBodyStr.replace(/model:\s*config\.model,\s*/, `model: config.model,\n                ${replacement}\n                `);
    } else if (promptVal && !systemVal) {
        let replacement = `messages: [\n                    { role: 'user', content: ${promptVal}${imagesStr} }\n                ],`;
        newBodyStr = newBodyStr.replace(/model:\s*config\.model,\s*/, `model: config.model,\n                ${replacement}\n                `);
    }

    newBodyStr = newBodyStr.replace(/prompt:\s*REMOVE_ME,?\n?\s*/g, '');
    newBodyStr = newBodyStr.replace(/system:\s*REMOVE_ME,?\n?\s*/g, '');
    
    return `fetch(\`\$\{config.baseUrl\}/api/chat\`, {\n            method: 'POST',\n            headers: config.headers,\n            body: JSON.stringify({${newBodyStr}}),\n        });`;
});

// Fix the duplicated parse logic which was previously added and broken
code = code.replace(/if \(parsed\.response\)\s*yield\s*parsed\.response;\s*if\s*\(parsed\.message\?\.content\)\s*yield\s*parsed\.message\.content;/g, 'if (parsed.message?.content) yield parsed.message.content;');

// Update response parsing for stream handlers
code = code.replace(/if \(parsed\.response\)\s*yield\s*parsed\.response;/g, 'if (parsed.message?.content) yield parsed.message.content;');

// Update response parsing for standard endpoints
code = code.replace(/data\.response/g, 'data.message?.content');
code = code.replace(/responseData\.response/g, 'responseData.message?.content');

fs.writeFileSync('services/ollamaService.ts', code, 'utf8');
