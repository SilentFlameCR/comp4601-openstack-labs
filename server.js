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

// PageRank calculation cache
const pageRankCache = new Map();

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function computePageRank(datasetName) {
  const alpha = 0.1;
  const epsilon = 0.0001;

  // Check cache
  if (pageRankCache.has(datasetName)) {
    return pageRankCache.get(datasetName);
  }

  try {
    const pages = await db.getAllPages(datasetName);
    
    if (pages.length === 0) {
      return null;
    }

    const urls = pages.map(p => p.url);
    const N = urls.length;
    const urlToIdx = {};
    urls.forEach((url, idx) => {
      urlToIdx[url] = idx;
    });

    // Get all links for the dataset
    const links = await db.getLinks(datasetName);

    // Build outgoing links adjacency list
    const outgoing = Array.from({ length: N }, () => []);
    
    for (const link of links) {
      const fromIdx = urlToIdx[link.from_url];
      const toIdx = urlToIdx[link.to_url];
      
      if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
        outgoing[fromIdx].push(toIdx);
      }
    }

    // Initialize PageRank uniformly
    let pr = new Array(N).fill(1.0 / N);

    // Iterate until convergence
    while (true) {
      const next = new Array(N).fill(alpha / N);

      // Handle dangling nodes
      let danglingMass = 0;
      for (let j = 0; j < N; j++) {
        if (outgoing[j].length === 0) {
          danglingMass += pr[j];
        } else {
          const share = pr[j] / outgoing[j].length;
          for (const i of outgoing[j]) {
            next[i] += (1 - alpha) * share;
          }
        }
      }

      // Distribute dangling mass
      if (danglingMass > 0) {
        const add = (1 - alpha) * (danglingMass / N);
        for (let i = 0; i < N; i++) {
          next[i] += add;
        }
      }

      // Check convergence
      const dist = euclideanDistance(pr, next);
      pr = next;

      if (dist < epsilon) {
        break;
      }
    }

    // Store results in map
    const results = new Map();
    for (let i = 0; i < N; i++) {
      results.set(urls[i], pr[i]);
    }

    pageRankCache.set(datasetName, results);
    return results;
  } catch (error) {
    console.error('Error computing PageRank:', error);
    throw error;
  }
}

// Info endpoint - must come before /:datasetName to avoid route conflict
app.get('/info', (req, res) => {
  res.json({
    name: 'MadiTook5898'
  });
});

// PageRank endpoint
app.get('/pageranks', async (req, res) => {
  try {
    console.log('PageRank request received:', req.query.url);
    const url = req.query.url;
    
    if (!url || typeof url !== 'string') {
      console.log('Missing URL parameter');
      return res.status(400).send('Missing url');
    }

    // Determine dataset from URL
    let dataset = null;
    if (url.includes('/tinyfruits/')) {
      dataset = 'tinyfruits';
    } else if (url.includes('/fruits100/')) {
      dataset = 'fruits100';
    } else if (url.includes('/fruitsA/') || url.includes('/fruitsB/')) {
      dataset = 'fruitsA';
    }

    console.log('Dataset determined:', dataset);

    if (!dataset) {
      return res.status(404).send('Unknown dataset');
    }

    console.log('Computing PageRank for dataset:', dataset);
    const ranks = await computePageRank(dataset);
    console.log('PageRank computed, results:', ranks ? ranks.size : 'null');
    
    if (!ranks) {
      return res.status(404).send('Dataset not found');
    }

    const rank = ranks.get(url.trim());
    console.log('Rank for URL:', rank);
    
    if (rank === undefined) {
      return res.status(404).send('URL not found');
    }

    res.type('text/plain').send(String(rank));
  } catch (error) {
    console.error('Error in /pageranks:', error);
    console.error('Stack:', error.stack);
    res.status(500).send('Internal server error');
  }
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
