const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor(dbPath = './crawler.db') {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initTables();
      }
    });
  }

  initTables() {
    this.db.serialize(() => {
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA busy_timeout = 5000');
      
      this.db.run(`
        CREATE TABLE IF NOT EXISTS pages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dataset TEXT NOT NULL,
          url TEXT NOT NULL,
          content TEXT,
          UNIQUE(dataset, url)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dataset TEXT NOT NULL,
          from_url TEXT NOT NULL,
          to_url TEXT NOT NULL,
          UNIQUE(dataset, from_url, to_url)
        )
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_pages_dataset ON pages(dataset)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_links_dataset ON links(dataset)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_links_to_url ON links(dataset, to_url)
      `);
    });
  }

  savePage(dataset, url, content) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO pages (dataset, url, content) VALUES (?, ?, ?)',
        [dataset, url, content],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  saveLink(dataset, fromUrl, toUrl) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO links (dataset, from_url, to_url) VALUES (?, ?, ?)',
        [dataset, fromUrl, toUrl],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  pageExists(dataset, url) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM pages WHERE dataset = ? AND url = ?',
        [dataset, url],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  getPopularPages(dataset, limit = 10) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT p.id, p.url, p.content, COUNT(l.id) as incoming_count
        FROM pages p
        LEFT JOIN links l ON p.dataset = l.dataset AND p.url = l.to_url
        WHERE p.dataset = ?
        GROUP BY p.url
        ORDER BY incoming_count DESC
        LIMIT ?
      `;
      
      this.db.all(query, [dataset, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getIncomingLinks(dataset, url) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT from_url FROM links WHERE dataset = ? AND to_url = ?',
        [dataset, url],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.from_url));
        }
      );
    });
  }

  getPageById(dataset, pageId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM pages WHERE dataset = ? AND id = ?',
        [dataset, pageId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getPageByUrl(dataset, url) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM pages WHERE dataset = ? AND url = ?',
        [dataset, url],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  clearDataset(dataset) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('DELETE FROM pages WHERE dataset = ?', [dataset]);
        this.db.run('DELETE FROM links WHERE dataset = ?', [dataset], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = Database;
