class TFIDFIndex {
  constructor() {
    this.documentFrequency = new Map(); // word -> number of documents containing it
    this.totalDocuments = 0;
    this.documentVectors = new Map(); // url -> {words: [], tfidfs: []}
    this.documentContent = new Map(); // url -> {title, url}
  }

  // Calculate term frequency for a word in a document
  calculateTF(word, document) {
    const words = document.toLowerCase().split(/\s+/);
    const wordCount = words.filter(w => w === word.toLowerCase()).length;
    return wordCount / words.length;
  }

  // Calculate inverse document frequency for a word
  calculateIDF(word) {
    const df = this.documentFrequency.get(word.toLowerCase()) || 0;
    const raw = Math.log2(this.totalDocuments / (1 + df));
    return Math.max(0, raw);
  }

  // Calculate TF-IDF for a word in a document
  calculateTFIDF(word, document) {
    const tf = this.calculateTF(word, document);
    const idf = this.calculateIDF(word);
    return Math.log2(1 + tf) * idf;
  }

  // Tokenize text: keep only alphabetic words (a-z), lowercased
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  // Extract words from text (only paragraph content, no titles or links)
  extractWords(html) {
    // Extract only text from <p> tags (using [\s\S] to match across newlines)
    const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let paragraphText = '';
    let match;
    
    while ((match = paragraphRegex.exec(html)) !== null) {
      paragraphText += ' ' + match[1];
    }
    
    // Remove any remaining HTML tags from paragraph content
    const withoutTags = paragraphText.replace(/<[^>]*>/g, ' ');
    
    return this.tokenize(withoutTags);
  }

  // Extract words from plain text (for queries)
  extractWordsFromText(text) {
    return this.tokenize(text);
  }

  // Build the index from crawled pages
  buildIndex(pages) {
    this.documentFrequency.clear();
    this.documentVectors.clear();
    this.documentContent.clear();
    this.totalDocuments = pages.length;

    // First pass: calculate document frequency
    const documentWords = new Map();
    
    pages.forEach(page => {
      const words = this.extractWords(page.content);
      const uniqueWords = new Set(words);
      documentWords.set(page.url, words);
      
      uniqueWords.forEach(word => {
        this.documentFrequency.set(
          word,
          (this.documentFrequency.get(word) || 0) + 1
        );
      });

      // Store document metadata
      this.documentContent.set(page.url, {
        url: page.url,
        title: this.extractTitle(page.content)
      });
    });

    // Second pass: calculate TF-IDF vectors for each document
    pages.forEach(page => {
      const words = documentWords.get(page.url);
      const wordCounts = new Map();
      
      // Count word occurrences
      words.forEach(word => {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      });

      // Get unique words and calculate TF-IDF for each
      const uniqueWords = Array.from(wordCounts.keys());
      const tfidfs = uniqueWords.map(word => {
        const tf = wordCounts.get(word) / words.length;
        const idf = this.calculateIDF(word);
        return Math.log2(1 + tf) * idf;
      });

      this.documentVectors.set(page.url, {
        words: uniqueWords,
        tfidfs: tfidfs
      });
    });
  }

  // Extract title from HTML content
  extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    return '';
  }

  // Calculate cosine similarity between two vectors
  // Only iterate over query terms (q-dimensional space)
  cosineSimilarity(queryWords, queryTfidfs, docWords, docTfidfs) {
    // Create map for document vector for fast lookup
    const docMap = new Map();
    docWords.forEach((word, i) => {
      docMap.set(word, docTfidfs[i]);
    });

    // Calculate dot product and magnitudes
    // ONLY iterate over query dimensions (q-dimensional vector space)
    let dotProduct = 0;
    let magQ = 0;
    let magD = 0;

    for (let i = 0; i < queryWords.length; i++) {
      const qw = queryWords[i];
      const qv = queryTfidfs[i];
      const dv = docMap.get(qw) || 0;
      
      dotProduct += qv * dv;
      magQ += qv * qv;
      magD += dv * dv;
    }

    magQ = Math.sqrt(magQ);
    magD = Math.sqrt(magD);

    if (magQ === 0 || magD === 0) return 0;
    
    return dotProduct / (magQ * magD);
  }

  // Search for documents matching a query
  search(query, topK = 10) {
    // Extract words from query
    const queryWords = this.extractWordsFromText(query);
    
    // Remove duplicates but keep track of frequency
    const wordCounts = new Map();
    queryWords.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Calculate query TF-IDF vector
    // Filter out words that don't appear in any document (IDF = 0)
    const uniqueQueryWords = Array.from(wordCounts.keys()).filter(word => {
      return this.documentFrequency.has(word);
    });
    
    // Use total query length (including duplicates and filtered words)
    const totalQueryLength = queryWords.length;
    
    const queryTfidfs = uniqueQueryWords.map(word => {
      const tf = wordCounts.get(word) / totalQueryLength;
      const idf = this.calculateIDF(word);
      return Math.log2(1 + tf) * idf;
    });

    // Calculate cosine similarity with all documents
    const scores = [];
    
    this.documentVectors.forEach((docVector, url) => {
      const similarity = this.cosineSimilarity(
        uniqueQueryWords,
        queryTfidfs,
        docVector.words,
        docVector.tfidfs
      );

      const docInfo = this.documentContent.get(url);
      scores.push({
        url: url,
        title: docInfo.title,
        score: similarity
      });
    });

    // Sort by score (descending) and return top K
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  // Get query vector for debugging
  getQueryVector(query) {
    const queryWords = this.extractWordsFromText(query);
    const wordCounts = new Map();
    queryWords.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Filter out words that don't appear in any document
    const uniqueQueryWords = Array.from(wordCounts.keys()).filter(word => {
      return this.documentFrequency.has(word);
    });
    
    // Use total query length (including duplicates and filtered words)
    const totalQueryLength = queryWords.length;
    
    const queryTfidfs = uniqueQueryWords.map(word => {
      const tf = wordCounts.get(word) / totalQueryLength;
      const idf = this.calculateIDF(word);
      return Math.log2(1 + tf) * idf;
    });

    return {
      words: uniqueQueryWords,
      tfidfs: queryTfidfs
    };
  }

  // Get document vector for debugging
  getDocumentVector(url) {
    return this.documentVectors.get(url);
  }
}

module.exports = TFIDFIndex;
