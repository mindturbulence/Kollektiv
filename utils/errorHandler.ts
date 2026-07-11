export const handleGeminiError = (error: unknown, context: string): Error => {
  console.error(`Error during API call for ${context}:`, error);

  let errorMessage = `An unknown error occurred while ${context}.`;
  
  if (error instanceof Error) {
    const lowerCaseMessage = error.message.toLowerCase();

    if (lowerCaseMessage.includes("failed to fetch") || lowerCaseMessage.includes("networkerror")) {
        if (context.toLowerCase().includes("ollama")) {
            errorMessage = `A network error occurred while ${context}. Ensure OLLAMA_ORIGINS="*" is set and Ollama is running locally. If your site is on HTTPS, browsers block local HTTP calls (Mixed Content), so please use the desktop app or standard API.`;
        } else if (context.toLowerCase().includes("gemini")) {
            errorMessage = `A network error occurred while ${context}. Please verify your network connection, ensure you have set a valid Gemini API Key, and try again.`;
        } else {
            errorMessage = `A network error occurred while ${context}. Please ensure your API/Ollama target is reachable and your configuration is correct.`;
        }
    } else if (lowerCaseMessage.includes("api key not valid") || lowerCaseMessage.includes("api key is missing")) {
      errorMessage = "The API key is invalid or missing. Add a valid Gemini API Key in Setup -> LLM -> Gemini API Key.";
    } else if (lowerCaseMessage.includes("content is blocked") || lowerCaseMessage.includes("safety")) {
      errorMessage = `The request for ${context} was blocked due to safety settings. Please modify your input and try again.`;
    } else if (lowerCaseMessage.includes("quota")) {
      errorMessage = "You have exceeded your API quota. Please check your usage and limits.";
    } else if (lowerCaseMessage.includes("400") || lowerCaseMessage.includes("could not be parsed") || lowerCaseMessage.includes("does not exist or is not publicly accessible")) {
        errorMessage = `The AI model could not process the provided resource. Please ensure it is correct and publicly accessible.`;
    } else if (lowerCaseMessage.includes("application/json is not supported")) {
        errorMessage = `The AI model configuration is incorrect. It may not support JSON output with the current settings.`;
    } else if (lowerCaseMessage.includes("json")) {
        errorMessage = `The AI returned an invalid response that could not be read. Please try again.`;
    }
    else {
      errorMessage = `Failed to ${context}: ${error.message}`;
    }
  }
  else {
    errorMessage = `Failed to ${context}: ${String(error)}`;
  }
  
  return new Error(errorMessage);
};
