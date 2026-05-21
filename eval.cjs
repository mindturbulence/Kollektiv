const fs = require('fs');
let code = fs.readFileSync('components/LLMChatPanel.tsx', 'utf8');

code = code.replace(/If you use an action, the system will execute it and append the result to the chat as a system message. You should explain to the user what you are doing before calling the action.`;/g, 'If you use an action, the system will execute it and append the result to the chat as a system message. You should explain to the user what you are doing before calling the action. Users can also type direct slash commands like /list_prompts manually.`;');

fs.writeFileSync('components/LLMChatPanel.tsx', code);
