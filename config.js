// Configuration for Batch Document Summarizer
module.exports = {
  // Folder paths
  docsFolder: './docs',
  summariesFolder: './summaries',
  
  // Ollama settings
  ollamaUrl: 'http://127.0.0.1:11434/api/generate',
  model: 'llama3.2', // Change this to your preferred model (e.g., 'mistral', 'codellama', etc.)
  
  // Processing settings
  maxSummaryLength: 2000, // Maximum characters for each summary
  maxConcurrency: 1, // Number of documents to process in parallel (start with 1)
  timeout: 300000, // 5 minutes timeout per request (in milliseconds)
  
  // Chunking settings
  chunking: {
    enabled: true, // Enable automatic chunking for large documents
    maxTokensPerChunk: 100000, // Maximum tokens per chunk (llama3.2 has 131k context window)
    chunkSizeThreshold: 400000, // Characters threshold to trigger chunking (~100k tokens)
    maxChunkSummaryLength: 1000, // Maximum length for individual chunk summaries
  },
  
  // Model parameters (optional - these are good defaults)
  modelOptions: {
    temperature: 0.7, // Controls randomness (0.0 = deterministic, 1.0 = very random)
    top_p: 0.9, // Controls diversity via nucleus sampling
  },

  // Prompt templates
  prompts: {
    // Prompt for summarizing individual chunks of large documents
    chunkSummary: (maxLength) => `Summarize this text section in maximum ${maxLength} characters. Write in flowing paragraphs, not lists or bullet points. Start directly with the key points, no introductory phrases:

{text}

Summary:`,

    // Prompt for summarizing complete documents (single chunk)
    documentSummary: (maxLength) => `Summarize this text in maximum ${maxLength} characters. Write in flowing paragraphs, not lists or bullet points. Mention the author only if it is explicitly stated in the text - do not assume that the author of the document is the author of the text. Start directly with the key points and main ideas, no introductory phrases like "Here is a summary" or "This document discusses". Write a coherent narrative summary in paragraph form.

{text}

Summary:`,

    // Prompt for creating final summary from multiple chunk summaries
    finalSummary: (maxLength) => `Create a comprehensive summary of the following text sections in maximum ${maxLength} characters. Write in flowing paragraphs, not lists or bullet points. Start directly with the key points and main ideas, no introductory phrases. Write a coherent narrative summary that flows naturally from one topic to the next:

{text}

Summary:`
  }
}; 