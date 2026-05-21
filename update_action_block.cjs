const fs = require('fs');
let code = fs.readFileSync('components/LLMChatPanel.tsx', 'utf8');

const newLogic = `const actionObj = JSON.parse(actionMatch[1].trim());
                        let result;
                        if (actionObj.type === 'navigate') {
                            result = appControlService.navigate(actionObj.page);
                        } else if (actionObj.type === 'read_prompts') {
                            result = await appControlService.getPrompts();
                        } else if (actionObj.type === 'save_prompt') {
                            result = await appControlService.savePrompt(actionObj.title || 'Untitled', actionObj.prompt || '');
                        } else if (actionObj.type === 'read_cheatsheets') {
                            result = await appControlService.getCheatsheets();
                        } else if (actionObj.type === 'read_chat_history') {
                            result = await appControlService.getChatHistory();
                        } else if (actionObj.type === 'read_discovery_collections') {
                            result = await appControlService.getDiscoveryCollections();
                        } else if (actionObj.type === 'read_discovery_prompts') {
                            result = await appControlService.getDiscoveryPrompts(actionObj.collectionId);
                        } else {
                            result = "Unknown action type: " + actionObj.type;
                        }`;

code = code.replace(/const actionObj = JSON\.parse.*?result = "Unknown action type: " \+ actionObj\.type;\s*\}/s, newLogic);

fs.writeFileSync('components/LLMChatPanel.tsx', code);
