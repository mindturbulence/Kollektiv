
export const handleGeminiError = (error: unknown, context: string): Error => {
  console.error(`Error during Gemini API call for ${context}:`, error);

  let errorMessage = `An unknown error occurred while ${context}.`;
  
  if (error instanceof Error) {
    const lowerCaseMessage = error.message.toLowerCase();

    if (lowerCaseMessage.includes("api key not valid") || lowerCaseMessage.includes("api key is missing")) {
      // FIX: Compliant error message that does not prompt for UI entry
      errorMessage = "The Gemini API key is invalid or missing. Please ensure your environment variable process.env.API_KEY is correctly configured.";
    } else if (lowerCaseMessage.includes("content is blocked") || lowerCaseMessage.includes("safety")) {
      errorMessage = `The request for ${context} was blocked due to safety settings. Please modify your input and try again.`;
    } else if (lowerCaseMessage.includes("quota")) {
      errorMessage = "You have exceeded your Gemini API quota. Please check your API usage and limits.";
    } else if (lowerCaseMessage.includes("400") || lowerCaseMessage.includes("could not be parsed") || lowerCaseMessage.includes("does not exist or is not publicly accessible")) {
        errorMessage = `The AI model could not process the provided resource (e.g., image URL). Please ensure it is correct, publicly accessible, and a supported format.`;
    } else if (lowerCaseMessage.includes("application/json is not supported")) {
        errorMessage = `The AI model configuration is incorrect. It may not support JSON output with the current settings (e.g., when Google Search is enabled).`;
    } else if (lowerCaseMessage.includes("json")) {
        // Broadly catch JSON parsing errors from either our end or the model's response
        errorMessage = `The AI returned an invalid response that could not be read. Please try again.`;
    }
    else {
      // Keep it generic but include the original message for debugging.
      errorMessage = `Failed to ${context}: ${error.message}`;
    }
  }
  
  return new Error(errorMessage);
};
