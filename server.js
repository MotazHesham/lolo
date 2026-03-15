/**
 * Simple server: serves the quiz site, saves each session to its own JSON file,
 * and provides APIs for listing/loading sessions (for replay).
 * Run: npm start
 * Then open http://localhost:3000
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
/** Log file: each line is a save event (append-only). */
const SAVE_LOG_FILE = path.join(DATA_DIR, 'save-session-log.json');

// Middleware: parse JSON body
app.use(express.json({ limit: '50mb' }));

// Serve static files (index.html, style.css, script.js, replay.html)
app.use(express.static(__dirname));

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/** Sanitize filename to avoid path traversal (only allow safe session filenames). */
function safeSessionFilename(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

/**
 * Append one entry to save-session-log.json (array of { savedAt, filename, sessionId }).
 */
function appendSaveLog(entry) {
  let list = [];
  if (fs.existsSync(SAVE_LOG_FILE)) {
    try {
      const raw = fs.readFileSync(SAVE_LOG_FILE, 'utf8');
      list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
    } catch (e) {
      list = [];
    }
  }
  list.push(entry);
  fs.writeFileSync(SAVE_LOG_FILE, JSON.stringify(list, null, 2), 'utf8');
}

/**
 * POST /api/save-session
 * Body: { events, recordedSessions, exportedAt }
 * - Saves one separate JSON file per request: data/sessions/session-<sessionId>-<timestamp>.json
 * - Appends a log entry to data/save-session-log.json
 */
app.post('/api/save-session', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const sessionId = (payload.events && payload.events[0] && payload.events[0].sessionId)
    ? payload.events[0].sessionId
    : 'session';
  const timestamp = (payload.exportedAt || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19);
  const safeId = sessionId.replace(/[^a-zA-Z0-9_]/g, '_');
  const filename = `session-${safeId}-${timestamp}.json`;
  const filePath = path.join(SESSIONS_DIR, filename);
  const savedAt = new Date().toISOString();

  const toSave = {
    ...payload,
    savedAt,
  };

  try {
    // 1) Write this session to its own file (one file per time)
    fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), 'utf8');
    // 2) Log this save in save-session-log.json
    appendSaveLog({ savedAt, filename, sessionId });
    res.json({ ok: true, path: filePath, filename });
  } catch (e) {
    console.error('Write error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/sessions
 * Returns list of session files: [{ filename, savedAt }, ...]
 */
app.get('/api/sessions', (req, res) => {
  try {
    const files = fs.readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((filename) => {
        const filePath = path.join(SESSIONS_DIR, filename);
        const stat = fs.statSync(filePath);
        return { filename, savedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    res.json(files);
  } catch (e) {
    console.error('List sessions error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/session/:filename
 * Returns the session JSON (for replay page).
 */
app.get('/api/session/:filename', (req, res) => {
  const filename = safeSessionFilename(req.params.filename);
  if (!filename.endsWith('.json')) {
    return res.status(400).json({ error: 'Invalid file' });
  }
  const filePath = path.join(SESSIONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Love Quiz server at http://localhost:${PORT}`);
  console.log(`Session files: ${SESSIONS_DIR}`);
  console.log(`Replay: http://localhost:${PORT}/replay.html`);
});
