# SummarAIzer

A Node.js application that uses Ollama API to automatically generate summaries for PDF and TXT documents. The script processes documents sequentially (or in parallel), extracts text from PDFs and TXTs, and creates concise summaries using your local Ollama instance. Prompts are customizable.

## Features

- ✅ **Multi-Format Support**: Processes both PDF and TXT documents
- ✅ **Sequential Processing**: Processes one document at a time by default
- ✅ **Parallel Processing**: Configurable concurrency for faster processing
- ✅ **Resume Capability**: Continues from where it left off if interrupted
- ✅ **Progress Tracking**: Saves progress to avoid reprocessing completed files
- ✅ **Timeout Handling**: Configurable timeouts to prevent hanging
- ✅ **Error Recovery**: Graceful error handling and logging
- ✅ **Large Scale**: Designed to handle thousands of documents
- ✅ **Smart Chunking**: Automatically splits large documents into manageable chunks
- ✅ **Context Window Aware**: Respects model context limits (e.g., 131k tokens for llama3.2)

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Ollama** installed and running locally
3. A language model pulled in Ollama (e.g., `llama3.2`, `mistral`, `codellama`)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Make sure Ollama is running:
```bash
ollama serve
```

3. Pull a model (if you haven't already):
```bash
ollama pull llama3.2
```

## Usage

### Basic Usage

1. Place your PDF and TXT files in the `docs/` folder
2. Run the script:
```bash
npm start
```

3. Summaries will be saved in the `summaries/` folder with the same name as the original file but with `.txt` extension

### Configuration

Edit `config.js` to customize the behavior:

```javascript
module.exports = {
  // Change the model to your preferred one
  model: 'llama3.2', // or 'mistral', 'codellama', etc.
  
  // Adjust concurrency for parallel processing
  maxConcurrency: 1, // Increase to 2, 3, etc. for parallel processing
  
  // Adjust timeout if needed
  timeout: 300000, // 5 minutes in milliseconds
  
  // Change summary length limit
  maxSummaryLength: 2000, // Maximum characters per summary
  
  // Chunking settings for large documents
  chunking: {
    enabled: true, // Enable automatic chunking
    maxTokensPerChunk: 100000, // Max tokens per chunk (llama3.2 has 131k context)
    chunkSizeThreshold: 400000, // Characters threshold to trigger chunking
    maxChunkSummaryLength: 1000, // Max length for chunk summaries
  },

  // Customize prompts for different summarization scenarios
  prompts: {
    // Prompt for individual chunks of large documents
    chunkSummary: (maxLength) => `Summarize this text section in maximum ${maxLength} characters...`,
    
    // Prompt for complete documents (single chunk)
    documentSummary: (maxLength) => `Summarize this text in maximum ${maxLength} characters...`,
    
    // Prompt for final summary from multiple chunks
    finalSummary: (maxLength) => `Create a comprehensive summary of the following text sections...`
  }
};
```

### Parallel Processing

To process multiple documents in parallel, change `maxConcurrency` in `config.js`:

```javascript
maxConcurrency: 3, // Process 3 documents simultaneously
```

**Note**: Start with 1 and gradually increase based on your system's performance and Ollama's capabilities.

### Chunking for Large Documents

The script automatically handles large documents by:

1. **Size Detection**: Checks if document exceeds the chunking threshold (400k characters by default)
2. **Smart Splitting**: Splits text into chunks at sentence boundaries to preserve context
3. **Chunk Summarization**: Generates summaries for each chunk (max 1000 characters each)
4. **Final Summary**: Combines chunk summaries into a comprehensive final summary

**Chunking Configuration:**
- `enabled`: Turn chunking on/off
- `maxTokensPerChunk`: Maximum tokens per chunk (100k for llama3.2)
- `chunkSizeThreshold`: Character threshold to trigger chunking
- `maxChunkSummaryLength`: Maximum length for individual chunk summaries

### Prompt Customization

You can customize the prompts used for summarization by editing the `prompts` section in `config.js`. Each prompt is a function that takes a `maxLength` parameter and returns the prompt template with `{text}` as a placeholder for the content to summarize.

**Available Prompts:**
- `chunkSummary`: Used for individual chunks of large documents (shorter, focused summaries)
- `documentSummary`: Used for complete documents processed as single chunks (includes author handling)
- `finalSummary`: Used to combine multiple chunk summaries into a final comprehensive summary

**Example Customization:**
```javascript
prompts: {
  // Make chunk summaries more concise
  chunkSummary: (maxLength) => `Provide a brief summary in ${maxLength} characters: {text}`,
  
  // Add specific instructions for document summaries
  documentSummary: (maxLength) => `Summarize this document in ${maxLength} characters. Focus on main arguments and conclusions: {text}`,
  
  // Customize final summary style
  finalSummary: (maxLength) => `Synthesize these summaries into a coherent narrative in ${maxLength} characters: {text}`
}
```

## File Structure

```
batch-summaries/
├── docs/           # Place your PDF and TXT files here
├── summaries/      # Generated summaries (auto-created)
├── config.js       # Configuration settings
├── index.js        # Main script
├── progress.json   # Progress tracking (auto-created)
└── package.json
```

## How It Works

1. **Discovery**: Scans the `docs/` folder for PDF and TXT files
2. **Summary Check**: Checks which files are missing summaries in the `summaries/` folder
3. **Text Extraction**: Extracts text content from each document that needs processing (PDFs using pdf-parse, TXTs using direct file reading)
4. **Size Assessment**: Determines if chunking is needed
5. **Chunking** (if needed): Splits large documents into manageable chunks
6. **API Call**: Sends text/chunks to Ollama API for summarization
7. **Final Summary**: Combines chunk summaries if chunking was used
8. **Save**: Saves the summary with the same name as the original file but with .txt extension
9. **Progress Logging**: Updates progress.json for tracking purposes only

## Reprocessing Files

To reprocess a file, simply delete its summary file from the `summaries/` folder. The script will automatically detect the missing summary and reprocess the original document on the next run.

**Example:**
```bash
# Delete a summary to reprocess
rm summaries/document1.txt

# Run the script - it will reprocess document1.pdf or document1.txt
npm start
```

The `progress.json` file is now used only for logging and tracking purposes, not for determining what needs processing.

## Error Handling

- **Connection Errors**: If Ollama isn't running, the script will inform you
- **Timeout Errors**: If a document is too large or Ollama is slow, the script will timeout and continue with the next document
- **File Reading Errors**: If a PDF or TXT file can't be read, it will be skipped
- **Context Window Errors**: Large documents are automatically chunked to avoid context window limits
- **Graceful Shutdown**: Press Ctrl+C to stop the script safely - it will save progress

## Troubleshooting

### Ollama Connection Issues
- Make sure Ollama is running: `ollama serve`
- Check if the model is pulled: `ollama list`
- Verify the API endpoint in `config.js`

### Performance Issues
- Start with `maxConcurrency: 1`
- Increase timeout if documents are large
- Consider using a faster model
- Adjust chunking settings for better performance

### Memory Issues
- Reduce `maxConcurrency` if you encounter memory problems
- Process documents in smaller batches
- Reduce `maxTokensPerChunk` if needed

### Large Document Issues
- If documents are being truncated, increase `chunkSizeThreshold`
- If chunking is too aggressive, decrease `maxTokensPerChunk`
- Monitor chunk summaries to ensure quality

## Example Output

```
🚀 Starting Batch Document Summarizer
📁 Docs folder: ./docs
📝 Summaries folder: ./summaries
🤖 Model: llama3.2
⚡ Concurrency: 1
⏱️  Timeout: 300s per request
📏 Max summary length: 2000 characters
📄 Supported formats: PDF, TXT

📄 Found 6 document files to process
🔄 6 files need processing

Processing: document1.pdf
Extracting text from document1.pdf...
Text extracted (15420 characters)
📄 Document size: 15420 characters - processing as single chunk
Generating summary for document1.pdf...
Summary saved: ./summaries/document1.txt (1876 characters)
✓ Completed: document1.pdf

Processing: sample.txt
Extracting text from sample.txt...
Text extracted (1250 characters)
📄 Document size: 1250 characters - processing as single chunk
Generating summary for sample.txt...
Summary saved: ./summaries/sample.txt (856 characters)
✓ Completed: sample.txt

Processing: large_document.pdf
Extracting text from large_document.pdf...
Text extracted (850000 characters)
📄 Document size: 850000 characters - splitting into chunks
📋 Split into 3 chunks
📝 Summarizing chunk 1/3 (280000 characters)...
📝 Summarizing chunk 2/3 (285000 characters)...
📝 Summarizing chunk 3/3 (285000 characters)...
🔄 Generating final summary from 3 chunk summaries...
Summary saved: ./summaries/large_document.txt (1987 characters)
✓ Completed: large_document.pdf
```

## License

MIT License - feel free to modify and use as needed. 