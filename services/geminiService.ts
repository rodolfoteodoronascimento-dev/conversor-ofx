import { GoogleGenAI, Type } from "@google/genai";
import type { Transaction } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const transactionSchema = {
  type: Type.OBJECT,
  properties: {
    date: {
      type: Type.STRING,
      description: "Transaction date in YYYY-MM-DD format.",
    },
    description: {
      type: Type.STRING,
      description: "A clean, concise description of the transaction, omitting any redundant info like dates.",
    },
    amount: {
      type: Type.NUMBER,
      description: "The transaction amount. Must be negative for debits/withdrawals/payments and positive for credits/deposits.",
    },
  },
  required: ["date", "description", "amount"],
};

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        transactions: {
            type: Type.ARRAY,
            items: transactionSchema,
            description: "An array of all transactions found in the statement portion."
        },
    },
    required: ["transactions"],
};

/**
 * Splits a large string into smaller chunks based on a character limit,
 * ensuring that splits happen at newline characters to keep lines intact.
 */
function createChunks(text: string, chunkSize: number): string[] {
    if (text.length <= chunkSize) {
        return [text];
    }
    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > chunkSize) {
            // Push the current chunk if it's not empty
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk);
            }
            // Start a new chunk with the current line
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    // Push the last remaining chunk
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}


async function extractTransactionsFromChunk(
    statementChunk: string,
    fileName: string,
    chunkNumber: number,
    totalChunks: number,
    onProgress: (message: string) => void
): Promise<Transaction[]> {
  const prompt = `
    Analyze the following portion of a financial statement from the file named "${fileName}".
    This is part ${chunkNumber} of ${totalChunks}.
    The content could be from a PDF, CSV, or TXT file.
    Your task is to meticulously extract all individual financial transactions found ONLY within this specific portion of the text.
    For each transaction, identify the date, a clean description, and the amount.
    Ensure that debits, withdrawals, and payments are represented as negative numbers, and credits or deposits are positive numbers.
    Do not include any opening or closing balance rows, summary information, or page headers/footers in the list of transactions.
    If no transactions are present in this chunk, return an empty array.
    Provide the output in the specified JSON format.

    Statement Portion:
    ---
    ${statementChunk}
    ---
  `;

  const MAX_RETRIES = 3;
  const INITIAL_BACKOFF_MS = 2000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.0,
            maxOutputTokens: 8192,
            thinkingConfig: {
                thinkingBudget: 4096,
            },
          },
        });

        const text = response.text;
        if (!text) {
            console.error("Gemini API returned an empty or blocked response:", JSON.stringify(response, null, 2));
            throw new Error("The AI model returned an empty response. This may be due to the file content or safety filters.");
        }

        const jsonStartIndex = text.indexOf('{');
        const jsonEndIndex = text.lastIndexOf('}');
        if (jsonStartIndex === -1 || jsonEndIndex === -1 || jsonEndIndex < jsonStartIndex) {
          console.error("AI response did not contain a valid JSON object:", text);
          throw new Error("The AI returned data in an unexpected format.");
        }
        const jsonString = text.substring(jsonStartIndex, jsonEndIndex + 1);
        
        const parsedJson = JSON.parse(jsonString);

        if (!parsedJson.transactions || !Array.isArray(parsedJson.transactions)) {
            return []; // Return empty if format is wrong, as per instruction
        }
        
        const validatedTransactions: Transaction[] = parsedJson.transactions.map((tx: any) => {
            if (!tx.date || !tx.description || tx.amount === undefined) return null;
            const date = new Date(tx.date);
            if (isNaN(date.getTime())) return null;
            return {
                ...tx,
                date: date.toISOString().slice(0, 10).replace(/-/g, ""),
            };
        }).filter((tx: Transaction | null): tx is Transaction => tx !== null);

        return validatedTransactions; // Success, exit the loop and return

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRateLimitError = /rate limit|429/i.test(errorMessage);

        if (isRateLimitError && attempt < MAX_RETRIES - 1) {
          const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
          const delayInSeconds = (delay / 1000).toFixed(1);
          onProgress(`API is busy. Retrying in ${delayInSeconds}s... (Attempt ${attempt + 2}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Go to the next iteration of the loop
        }

        console.error(`Error calling Gemini API for chunk (attempt ${attempt + 1}):`, error);
        throw new Error(errorMessage); // Throw the last error if retries are exhausted or it's not a rate limit error
      }
  }

  // This should not be reachable if logic is correct, but serves as a fallback.
  throw new Error("Failed to process a document chunk after multiple retries.");
};


export const extractTransactionsFromStatement = async (
    statementContent: string, 
    fileName: string,
    onProgress: (message: string) => void
): Promise<Transaction[]> => {
    
    onProgress("Analyzing statement...");
    const MAX_CHUNK_SIZE = 150000; // characters, a safe limit to stay under prompt token limits
    const chunks = createChunks(statementContent, MAX_CHUNK_SIZE);
    
    if (chunks.length > 1) {
        onProgress(`Large file detected. Splitting into ${chunks.length} parts.`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Let user read the message
    }

    const allTransactions: Transaction[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
        const isMultiChunk = chunks.length > 1;
        if (isMultiChunk) {
            onProgress(`Processing part ${i + 1} of ${chunks.length}...`);
        }
        
        try {
            const transactions = await extractTransactionsFromChunk(chunks[i], fileName, i + 1, chunks.length, onProgress);
            allTransactions.push(...transactions);
             if (isMultiChunk) {
                // Briefly show the processing message again after a retry might have occurred.
                onProgress(`Processing part ${i + 1} of ${chunks.length}... done.`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            throw new Error(`Failed to process part ${i + 1} of the document. Original error: ${message}`);
        }
    }
    
    onProgress("Finalizing conversion...");
    return allTransactions;
};