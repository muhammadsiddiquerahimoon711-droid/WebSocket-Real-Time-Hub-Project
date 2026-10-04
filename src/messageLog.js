// Persistent JSONL log: one JSON object per line, each with an ISO timestamp.
const fs = require('fs');
const path = require('path');

function createMessageLog(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  return {
    file,

    async append(entry) {
      await fs.promises.appendFile(file, JSON.stringify(entry) + '\n');
    },

    // Most recent chat messages of a room (oldest first).
    async recent(room, limit = 50) {
      let text;
      try {
        text = await fs.promises.readFile(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
      }
      const out = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          // entries written before the "type" field existed are chat messages
          if ((entry.type === undefined || entry.type === 'message') && entry.room === room) out.push(entry);
        } catch { /* skip a damaged line */ }
      }
      return out.slice(-limit);
    }
  };
}

module.exports = { createMessageLog };
