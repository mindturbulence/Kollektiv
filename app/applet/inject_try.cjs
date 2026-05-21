const fs = require('fs');
let code = fs.readFileSync('components/LLMChatPanel.tsx', 'utf8');

const newTryBlock = `try {
            let currentMessages = [...newMessages];
            let shouldContinue = true;

            while (shouldContinue) {
                shouldContinue = false;

                setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
                const generator = streamChat(currentMessages, settings, useWebSearch);

                let fullResponse = '';
                for await (const chunk of generator) {
                    fullResponse += chunk;
                    if (chunk.trim() && chunk.length > 0) {
                        audioService.playType();
                    }
                    setMessages(prev => {
                        const cloned = [...prev];
                        cloned[cloned.length - 1] = {
                            ...cloned[cloned.length - 1],
                            content: fullResponse
                        };
                        return cloned;
                    });
                }

                currentMessages = [...currentMessages, { role: 'assistant' as const, content: fullResponse }];

                // Final save after stream ends
                setMessages(prev => {
                    persistSession(prev, currentSessionId);
                    return prev;
                });

                // Check for action tags
                const actionMatch = fullResponse.match(/<action>([\\s\\S]*?)<\\/action>/);
                if (actionMatch) {
                    try {
                        const actionObj = JSON.parse(actionMatch[1].trim());
                        let result;
                        if (actionObj.type === 'navigate') {
                            result = appControlService.navigate(actionObj.page);
                        } else if (actionObj.type === 'read_prompts') {
                            result = await appControlService.getPrompts();
                        } else if (actionObj.type === 'read_cheatsheets') {
                            result = await appControlService.getCheatsheets();
                        } else if (actionObj.type === 'read_chat_history') {
                            result = await appControlService.getChatHistory();
                        } else {
                            result = "Unknown action type: " + actionObj.type;
                        }

                        const systemMsg = "System: Action executed. Result:\\n" + result;
                        setMessages(prev => [...prev, { role: 'system' as const, content: systemMsg }]);
                        currentMessages = [...currentMessages, { role: 'system' as const, content: systemMsg }];
                        
                        // Loop again to let assistant process result!
                        shouldContinue = true;
                    } catch (e) {
                         const sysErr = "System: Failed to parse or execute action: " + e;
                         setMessages(prev => [...prev, { role: 'system' as const, content: sysErr }]);
                         currentMessages = [...currentMessages, { role: 'system' as const, content: sysErr }];
                         shouldContinue = true;
                    }
                }
            }
        } catch (error: any) {`;

code = code.replace(/try\s*\{\s*setMessages\(prev => \[\.\.\.prev, \{ role: 'assistant', content: '' \}\]\);\s*const generator = streamChat\(newMessages, settings, useWebSearch\);\s*let fullResponse = '';\s*for await \(const chunk of generator\) \{\s*fullResponse \+= chunk;\s*if \(chunk\.trim\(\) && chunk\.length > 0\) \{\s*audioService\.playType\(\);\s*\}\s*setMessages\(prev => \{\s*const cloned = \[\.\.\.prev\];\s*cloned\[cloned\.length - 1\] = \{\s*\.\.\.cloned\[cloned\.length - 1\],\s*content: fullResponse\s*\};\s*return cloned;\s*\}\);\s*\}\s*\/\/ Final save after stream ends\s*setMessages\(prev => \{\s*persistSession\(prev, currentSessionId\);\s*return prev;\s*\}\);\s*\} catch \(error: any\) \{/s, newTryBlock);

fs.writeFileSync('components/LLMChatPanel.tsx', code);
