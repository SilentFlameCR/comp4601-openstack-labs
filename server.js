const express = require('express');
const Database = require('./database');
const TFIDFIndex = require('./tfidf');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database();

// TF-IDF indexes for each dataset
const indexes = new Map();

// Initialize TF-IDF indexes on startup
async function initializeIndexes() {
  const datasets = ['tinyfruits', 'fruits100', 'fruitsA', 'fruitsB'];
  
  for (const dataset of datasets) {
    try {
      const pages = await db.getAllPages(dataset);
      if (pages.length > 0) {
        const index = new TFIDFIndex();
        index.buildIndex(pages);
        indexes.set(dataset, index);
        console.log(`Initialized TF-IDF index for ${dataset} with ${pages.length} documents`);
      }
    } catch (error) {
      console.error(`Error initializing index for ${dataset}:`, error);
    }
  }
}

// Initialize indexes when server starts
initializeIndexes().catch(console.error);

// Log all incoming requests
app.use((req, res, next) => {
  // console.log('\n=== INCOMING REQUEST ===');
  // console.log(`Method: ${req.method}`);
  // console.log(`URL: ${req.url}`);
  // console.log(`Path: ${req.path}`);
  // console.log(`Query params:`, req.query);
  // console.log(`Params:`, req.params);
  // console.log(`Headers:`, req.headers);
  // console.log('========================\n');
  next();
});

app.use(express.json());

// Info endpoint - must come before /:datasetName to avoid route conflict
app.get('/info', (req, res) => {
  res.json({
    name: 'MadiTook5898'
  });
});

// Search endpoint
app.get('/:datasetName', async (req, res) => {
  try {
    const { datasetName } = req.params;
    const query = req.query.q || req.query.phrase;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter q or phrase is required' });
    }

    console.log(`Search request for dataset: ${datasetName}, query: ${query}`);

    // Get or create index for this dataset
    let index = indexes.get(datasetName);
    if (!index) {
      console.log(`Index not found for ${datasetName}, building now...`);
      const pages = await db.getAllPages(datasetName);
      if (pages.length === 0) {
        return res.status(404).json({ error: 'Dataset not found or empty' });
      }
      index = new TFIDFIndex();
      index.buildIndex(pages);
      indexes.set(datasetName, index);
    }

    // Perform search
    const results = index.search(query, 10);

    // Format results
    const formattedResults = results.map(result => ({
      url: result.url,
      title: result.title,
      score: result.score
    }));

    res.json({ result: formattedResults });
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:datasetName/popular', async (req, res) => {
  try {
    const { datasetName } = req.params;
    console.log(`Request for popular pages in dataset: ${datasetName}`);
    
    const popularPages = await db.getPopularPages(datasetName, 10);
    console.log(`Found ${popularPages.length} popular pages`);
    
    if (popularPages.length === 0) {
      console.warn(`No pages found for dataset: ${datasetName}`);
    }
    
    // Use external IP instead of req.get('host') to ensure URLs work externally
    const baseUrl = 'http://134.117.133.107:3000';
    const result = popularPages.map(page => ({
      url: `${baseUrl}/${datasetName}/pages/${page.id}`,
      origUrl: page.url
    }));
    
    console.log(`Returning ${result.length} results`);
    res.json({ result });
  } catch (error) {
    console.error('Error fetching popular pages:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/:datasetName/pages/:pageId', async (req, res) => {
  try {
    console.log(`Request for page by ID - dataset: ${req.params.datasetName}, pageId: ${req.params.pageId}`);
    const { datasetName, pageId } = req.params;
    
    const page = await db.getPageById(datasetName, pageId);
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    const incomingLinks = await db.getIncomingLinks(datasetName, page.url);
    
    res.json({
      webUrl: page.url,
      incomingLinks: incomingLinks
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:datasetName/page', async (req, res) => {
  try {
    console.log(`Request for page - dataset: ${req.params.datasetName}, url: ${req.query.url}`);
    console.log(`Full request URL: ${req.url}`);
    const { datasetName } = req.params;
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    const page = await db.getPageByUrl(datasetName, url);
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    const incomingLinks = await db.getIncomingLinks(datasetName, url);
    
    res.json({
      webURL: url,
      incomingLinks: incomingLinks
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /:datasetName/popular - Get top 10 pages by incoming links`);
  console.log(`  GET /:datasetName/page?url=<url> - Get page details with incoming links`);
  console.log(`  GET /info - Get server info`);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  await db.close();
  process.exit(0);
});
