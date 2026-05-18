import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const getApiKey = (): string => {
    const key = process.env.SCRAPE_LLM_API_KEY;
    if (!key) {
        throw new Error(
            'SCRAPE_LLM_API_KEY is not set. Set it to your Google AI API key to enable self-healing extraction.',
        );
    }
    return key;
};

export const generateText = async (prompt: string): Promise<string> => {
    const genAI = new GoogleGenerativeAI(getApiKey());
    const model = genAI.getGenerativeModel({ model: process.env.SCRAPE_LLM_MODEL ?? DEFAULT_MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text();
};
