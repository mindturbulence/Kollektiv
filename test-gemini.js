const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
    const chat = ai.chats.create({ model: "gemini-3-flash-preview" });
    try {
        const parts = [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" } }];
        const stream = await chat.sendMessageStream({ message: parts });
        for await (const chunk of stream) {
            console.log("Chunk:", chunk.text);
        }
        console.log("Done");
    } catch(err) {
        console.error("Error:", err.message);
    }
}
run();
