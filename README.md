# COMP4601 Lab 3 - Web Crawler

**Student Names:** Rahul Rodrigues & Emily Amos
**Student Ids:** 101145082 & 101311817

A web crawler implementation that discovers and stores pages, builds a graph representation of page links, and provides a RESTful API to query the data.

## Installation

```bash
npm install
```

## Usage

### 1. Crawl a Dataset

Crawl one of the required datasets:

```bash
node crawler.js tinyfruits
node crawler.js fruits100
node crawler.js fruitsA
```

You can also crawl the test dataset:

```bash
node crawler.js fruitgraph
```

To limit the number of pages (useful for testing):

```bash
node crawler.js tinyfruits 10
```

### 2. Start the Server

```bash
npm start
```

The server will run on port 3000 by default.

## API Endpoints

### Get Popular Pages

Returns the top 10 pages with the most incoming links for a dataset.

```
GET /:datasetName/popular
```

Example:
```
GET /tinyfruits/popular
```

Response format:
```json
{
  "result": [
    {
      "url": "/tinyfruits/page?url=https://...",
      "origUrl": "https://people.scs.carleton.ca/~avamckenney/tinyfruits/N-1.html"
    },
    ...
  ]
}
```

### Get Page Details

Returns details about a specific page including its incoming links.

```
GET /:datasetName/page?url=<encoded-url>
```

Example:
```
GET /tinyfruits/page?url=https%3A%2F%2Fpeople.scs.carleton.ca%2F~avamckenney%2Ftinyfruits%2FN-0.html
```

Response format:
```json
{
  "WebUrl": "https://people.scs.carleton.ca/~avamckenney/tinyfruits/N-0.html",
  "incomingLinks": [
    "https://people.scs.carleton.ca/~avamckenney/tinyfruits/N-1.html",
    "https://people.scs.carleton.ca/~avamckenney/tinyfruits/N-2.html"
  ]
}
```

## Implementation Details

- **Database**: SQLite3 for persistent storage
- **Crawler**: Uses the `crawler` npm package
- **Duplicate Prevention**: Tracks visited URLs to avoid re-crawling
- **Graph Storage**: Stores links in a separate table with indexes for efficient querying
- **Datasets**: Supports multiple datasets stored separately in the same database

## Files

- `server.js` - Express server with RESTful API
- `crawler.js` - Web crawler implementation
- `database.js` - SQLite database wrapper with helper methods
- `crawler.db` - SQLite database file (created after first crawl)

## Notes for Remote Server Deployment

The application is designed to run on a remote server. Make sure to:

1. Install Node.js and npm
2. Run `npm install` to install dependencies
3. Crawl the required datasets
4. Start the server with `npm start`
5. Configure the port if needed using the PORT environment variable(server only has port 3000 open so would need to open whatever port is needed):
   ```bash
   PORT=8080 npm start
   ```
