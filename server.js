const express = require('express');
const Database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database();

app.use(express.json());

app.get('/:datasetName/popular', async (req, res) => {
  try {
    const { datasetName } = req.params;
    
    const popularPages = await db.getPopularPages(datasetName, 10);
    
    const result = popularPages.map(page => ({
      url: `/${datasetName}/page?url=${encodeURIComponent(page.url)}`,
      origUrl: page.url
    }));
    
    res.json({ result });
  } catch (error) {
    console.error('Error fetching popular pages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:datasetName/page', async (req, res) => {
  try {
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
      WebUrl: url,
      incomingLinks: incomingLinks
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/info', (req, res) => {
  res.json({
    name: 'MadiTook5898'
  });
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
