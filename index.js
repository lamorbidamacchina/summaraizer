const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const CONFIG = require('./config');

class BatchSummarizer {
  constructor() {
    this.startTime = null;
    this.logFile = './processing.log';
  }

  // Simple logging function
  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(message);
    
    // Also write to log file
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  async getDocumentFiles() {
    try {
      const files = await fs.readdir(CONFIG.docsFolder);
      return files.filter(file => {
        const lowerFile = file.toLowerCase();
        return lowerFile.endsWith('.pdf') || lowerFile.endsWith('.txt');
      });
    } catch (error) {
      this.log(`Error reading docs folder: ${error.message}`);
      return [];
    }
  }

  async extractTextFromDocument(filePath) {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (fileExtension === '.pdf') {
        // Extract text from PDF using pdf-parse
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
      } else if (fileExtension === '.txt') {
        // Extract text from TXT file using simple file reading
        const text = await fs.readFile(filePath, 'utf8');
        return text;
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }
    } catch (error) {
      this.log(`Error extracting text from ${filePath}: ${error.message}`);
      return null;
    }
  }

  // Split text into chunks based on token count estimation
  splitTextIntoChunks(text, maxTokensPerChunk = CONFIG.chunking.maxTokensPerChunk) {
    // Rough estimation: 1 token ≈ 4 characters for English text
    const maxCharsPerChunk = maxTokensPerChunk * 4;
    
    if (text.length <= maxCharsPerChunk) {
      return [text];
    }

    const chunks = [];
    let currentChunk = '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxCharsPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  async generateSummary(text, isChunkSummary = false) {
    try {
      const maxLength = isChunkSummary ? 
        CONFIG.chunking.maxChunkSummaryLength : // Shorter summaries for chunks
        CONFIG.maxSummaryLength;
      
      const promptTemplate = isChunkSummary ? 
        CONFIG.prompts.chunkSummary : 
        CONFIG.prompts.documentSummary;
      
      const prompt = promptTemplate(maxLength).replace('{text}', text);

      const response = await axios.post(CONFIG.ollamaUrl, {
        model: CONFIG.model,
        prompt: prompt,
        stream: false,
        options: CONFIG.modelOptions
      }, {
        timeout: CONFIG.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.response) {
        let summary = response.data.response.trim();
        
        // Post-process to remove any remaining lists or bullet points
        if (!isChunkSummary) {
          summary = this.cleanSummaryFormat(summary);
        }
        
        return summary;
      } else {
        throw new Error('Invalid response from Ollama API');
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama is not running. Please start Ollama first.');
      }
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        throw new Error('Request timed out. The document might be too large or Ollama is slow.');
      }
      throw new Error(`API Error: ${error.message}`);
    }
  }

  // Clean summary format to remove lists and bullet points
  cleanSummaryFormat(summary) {
    // Remove bullet points and list markers
    let cleaned = summary
      .replace(/^\s*[\*\-•]\s*/gm, '') // Remove bullet points at start of lines
      .replace(/^\s*\d+\.\s*/gm, '') // Remove numbered lists
      .replace(/^\s*[a-z]\)\s*/gm, '') // Remove lettered lists
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\n\s*\n/g, '\n\n') // Clean up multiple newlines
      .trim();
    
    // Split into sentences and rejoin as paragraphs
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = [];
    let currentParagraph = '';
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0) {
        if (currentParagraph.length + trimmed.length > 200) {
          if (currentParagraph) {
            paragraphs.push(currentParagraph.trim() + '.');
            currentParagraph = trimmed;
          } else {
            currentParagraph = trimmed;
          }
        } else {
          currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
        }
      }
    }
    
    if (currentParagraph) {
      paragraphs.push(currentParagraph.trim() + '.');
    }
    
    return paragraphs.join('\n\n');
  }

  async generateChunkedSummary(text, filename) {
    // Check if chunking is enabled and if text needs chunking
    const needsChunking = CONFIG.chunking.enabled && text.length > CONFIG.chunking.chunkSizeThreshold;
    
    if (!needsChunking) {
      this.log(`📄 Document size: ${text.length} characters - processing as single chunk`);
      return await this.generateSummary(text);
    }

    this.log(`📄 Document size: ${text.length} characters - splitting into chunks`);
    
    // Split text into chunks
    const chunks = this.splitTextIntoChunks(text);
    this.log(`📋 Split into ${chunks.length} chunks`);
    
    // Generate summaries for each chunk
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      this.log(`📝 Summarizing chunk ${i + 1}/${chunks.length} (${chunks[i].length} characters)...`);
      const chunkSummary = await this.generateSummary(chunks[i], true);
      chunkSummaries.push(chunkSummary); // Don't add "Chunk X:" prefix
    }
    
    // Combine chunk summaries and generate final summary
    this.log(`🔄 Generating final summary from ${chunks.length} chunk summaries...`);
    const combinedSummaries = chunkSummaries.join('\n\n');
    
    // Use configurable prompt for the final summary
    const finalSummaryPrompt = CONFIG.prompts.finalSummary(CONFIG.maxSummaryLength).replace('{text}', combinedSummaries);

    try {
      const response = await axios.post(CONFIG.ollamaUrl, {
        model: CONFIG.model,
        prompt: finalSummaryPrompt,
        stream: false,
        options: CONFIG.modelOptions
      }, {
        timeout: CONFIG.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.response) {
        let finalSummary = response.data.response.trim();
        finalSummary = this.cleanSummaryFormat(finalSummary);
        return finalSummary;
      } else {
        throw new Error('Invalid response from Ollama API');
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama is not running. Please start Ollama first.');
      }
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        throw new Error('Request timed out. The document might be too large or Ollama is slow.');
      }
      throw new Error(`API Error: ${error.message}`);
    }
  }

  async processFile(filename) {
    const filePath = path.join(CONFIG.docsFolder, filename);
    const fileExtension = path.extname(filename).toLowerCase();
    const summaryPath = path.join(CONFIG.summariesFolder, filename.replace(fileExtension, '.txt'));

    this.log(`\nProcessing: ${filename}`);

    // Check if summary already exists - this is the primary check
    if (await fs.pathExists(summaryPath)) {
      this.log(`Summary already exists for ${filename}, skipping`);
      return;
    }

    try {
      // Extract text from document
      this.log(`Extracting text from ${filename}...`);
      const text = await this.extractTextFromDocument(filePath);
      
      if (!text) {
        this.log(`Failed to extract text from ${filename}`);
        return;
      }

      this.log(`Text extracted (${text.length} characters)`);

      // Generate summary (with chunking if needed)
      this.log(`Generating summary for ${filename}...`);
      const summary = await this.generateChunkedSummary(text, filename);

      if (summary.length > CONFIG.maxSummaryLength) {
        this.log(`Summary for ${filename} exceeds ${CONFIG.maxSummaryLength} characters (${summary.length})`);
      }

      // Save summary
      await fs.writeFile(summaryPath, summary, 'utf8');
      this.log(`Summary saved: ${summaryPath} (${summary.length} characters)`);

      this.log(`✓ Completed: ${filename}`);

    } catch (error) {
      this.log(`Error processing ${filename}: ${error.message}`);
    }
  }

  async processFilesSequentially(files) {
    for (const file of files) {
      await this.processFile(file);
    }
  }

  async processFilesParallel(files, concurrency) {
    const chunks = [];
    for (let i = 0; i < files.length; i += concurrency) {
      chunks.push(files.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(file => this.processFile(file));
      await Promise.all(promises);
    }
  }

  async run() {
    // Set start time at the beginning of the run
    this.startTime = new Date().toISOString();
    
    this.log('🚀 Starting Batch Document Summarizer');
    this.log(`📁 Docs folder: ${CONFIG.docsFolder}`);
    this.log(`📝 Summaries folder: ${CONFIG.summariesFolder}`);
    this.log(`🤖 Model: ${CONFIG.model}`);
    this.log(`⚡ Concurrency: ${CONFIG.maxConcurrency}`);
    this.log(`⏱️  Timeout: ${CONFIG.timeout / 1000}s per request`);
    this.log(`📏 Max summary length: ${CONFIG.maxSummaryLength} characters`);
    this.log(`📄 Supported formats: PDF, TXT`);
    this.log(`⏰ Started processing at: ${new Date(this.startTime).toLocaleString()}`);

    // Ensure folders exist
    await fs.ensureDir(CONFIG.docsFolder);
    await fs.ensureDir(CONFIG.summariesFolder);

    // Get document files
    const documentFiles = await this.getDocumentFiles();
    
    if (documentFiles.length === 0) {
      this.log('No PDF or TXT files found in docs folder');
      return;
    }

    this.log(`\n📄 Found ${documentFiles.length} document files to process`);
    
    // Check which files actually need processing by looking for missing summaries
    const filesToProcess = [];
    let existingSummaries = 0;
    for (const file of documentFiles) {
      const fileExtension = path.extname(file).toLowerCase();
      const summaryPath = path.join(CONFIG.summariesFolder, file.replace(fileExtension, '.txt'));
      if (!(await fs.pathExists(summaryPath))) {
        filesToProcess.push(file);
      } else {
        existingSummaries++;
      }
    }
    
    this.log(`🔄 ${filesToProcess.length} files need processing`);
    this.log(`📋 ${existingSummaries} files already have summaries`);

    if (filesToProcess.length === 0) {
      this.log('All files have been processed!');
      return;
    }

    // Process files
    try {
      if (CONFIG.maxConcurrency === 1) {
        await this.processFilesSequentially(filesToProcess);
      } else {
        await this.processFilesParallel(filesToProcess, CONFIG.maxConcurrency);
      }
      
      const finishTime = new Date().toISOString();
      this.log('\n🎉 All files processed successfully!');
      this.log(`⏰ Finished processing at: ${new Date(finishTime).toLocaleString()}`);
      
      // Calculate and display duration
      const startDate = new Date(this.startTime);
      const finishDate = new Date(finishTime);
      const duration = finishDate - startDate;
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((duration % (1000 * 60)) / 1000);
      this.log(`⏱️  Total processing time: ${hours}h ${minutes}m ${seconds}s`);
      
    } catch (error) {
      this.log(`\n❌ Error during processing: ${error.message}`);
      this.log('You can restart the script to continue from where it left off');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Received SIGTERM, exiting...');
  process.exit(0);
});

// Run the script
const summarizer = new BatchSummarizer();
summarizer.run().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
}); 