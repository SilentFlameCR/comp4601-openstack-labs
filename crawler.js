const Crawler = require('crawler');
const Database = require('./database');
const { URL } = require('url');

class WebCrawler {
  constructor(dataset, seedUrl, maxPages = null) {
    this.dataset = dataset;
    this.seedUrl = seedUrl;
    this.maxPages = maxPages;
    this.db = new Database();
    this.visitedUrls = new Set();
    this.pendingUrls = [];
    this.pageCount = 0;
    this.linkBuffer = [];
    
    this.crawler = new Crawler({
      maxConnections: 10,
      callback: async (error, res, done) => {
        if (error) {
          console.error('Crawler error:', error);
        } else {
          await this.processPage(res);
        }
        done();
      }
    });
  }

  async start() {
    console.log(`Starting crawl for dataset: ${this.dataset}`);
    console.log(`Seed URL: ${this.seedUrl}`);
    
    await this.crawlUrl(this.seedUrl);
    
    return new Promise((resolve) => {
      this.crawler.on('drain', async () => {
        console.log('\nCrawl complete!');
        console.log(`Total pages crawled: ${this.pageCount}`);
        console.log('Saving links to database...');
        
        await this.saveAllLinks();
        
        console.log('Done!');
        resolve();
      });
    });
  }

  crawlUrl(url) {
    if (this.visitedUrls.has(url)) {
      return;
    }

    if (this.maxPages && this.pageCount >= this.maxPages) {
      return;
    }

    this.visitedUrls.add(url);
    this.crawler.queue(url);
  }

  async processPage(res) {
    const currentUrl = res.options.uri;
    
    if (this.maxPages && this.pageCount >= this.maxPages) {
      return;
    }

    this.pageCount++;
    console.log(`[${this.pageCount}] Crawling: ${currentUrl}`);

    const content = res.body;
    await this.db.savePage(this.dataset, currentUrl, content);

    const $ = res.$;
    if ($) {
      let foundLinks = 0;
      let queuedLinks = 0;
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, currentUrl).href;
            foundLinks++;
            
            this.linkBuffer.push({
              from: currentUrl,
              to: absoluteUrl
            });

            if (!this.visitedUrls.has(absoluteUrl)) {
              this.crawlUrl(absoluteUrl);
              queuedLinks++;
            }
          } catch (e) {
            console.error(`Error parsing URL: ${href}`, e.message);
          }
        }
      });
      console.log(`  Found ${foundLinks} links, queued ${queuedLinks} new URLs`);
    } else {
      console.log('  No jQuery object available');
    }
  }

  async saveAllLinks() {
    for (const link of this.linkBuffer) {
      await this.db.saveLink(this.dataset, link.from, link.to);
    }
  }

  async close() {
    await this.db.close();
  }
}

async function main() {
  const datasets = [
    { name: 'tinyfruits', url: 'https://people.scs.carleton.ca/~avamckenney/tinyfruits/N-0.html' },
    { name: 'fruits100', url: 'https://people.scs.carleton.ca/~avamckenney/fruits100/N-0.html' },
    { name: 'fruitsA', url: 'https://people.scs.carleton.ca/~avamckenney/fruitsA/N-0.html' }
  ];

  const args = process.argv.slice(2);
  let datasetName = args[0];
  let maxPages = args[1] ? parseInt(args[1]) : null;

  if (!datasetName) {
    console.log('Usage: node crawler.js <dataset> [maxPages]');
    console.log('Available datasets: tinyfruits, fruits100, fruitsA, fruitgraph');
    console.log('Example: node crawler.js tinyfruits');
    console.log('Example: node crawler.js tinyfruits 10');
    process.exit(1);
  }

  let seedUrl;
  if (datasetName === 'fruitgraph') {
    seedUrl = 'https://people.scs.carleton.ca/~avamckenney/fruitgraph/N-0.html';
  } else {
    const dataset = datasets.find(d => d.name === datasetName);
    if (!dataset) {
      console.error(`Unknown dataset: ${datasetName}`);
      console.log('Available datasets: tinyfruits, fruits100, fruitsA, fruitgraph');
      process.exit(1);
    }
    seedUrl = dataset.url;
  }

  const crawler = new WebCrawler(datasetName, seedUrl, maxPages);
  
  try {
    await crawler.start();
    await crawler.close();
    process.exit(0);
  } catch (error) {
    console.error('Crawl failed:', error);
    await crawler.close();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = WebCrawler;
