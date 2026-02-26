import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import session from 'express-session';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { registerSocketHandlers } from './socketHandlers.js';
import { initIo, resetServerState } from './stateManager.js';
import { validateStreamToken } from './streamToken.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const apiRouter = express.Router();
const PORT = process.env.BACKEND_PORT || 3001;
const corsOriginsRaw = process.env.CORS_ORIGINS?.split(',').map((o) =>
  o.trim()
) || [process.env.FRONTEND_URL || 'http://localhost:8080'];
const corsOrigins = corsOriginsRaw.flatMap((o) =>
  o.match(/^https?:\/\//) ? [o] : [o, `http://${o}`, `https://${o}`]
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);
app.options('*', cors());

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'shh-its-a-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 24,
  },
});
app.use(sessionMiddleware);

app.use(
  '/downloads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range'
    );
    next();
  },
  express.static(path.join(__dirname, '../downloads'))
);

app.use('/api', apiRouter);

apiRouter.get('/cat-colors', (req, res) => {
  const catImageDir = path.join(__dirname, '../frontend/public/images/cats');
  fs.readdir(catImageDir, { withFileTypes: true }, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to load cat colors' });
    }
    const colors = files
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
    res.json({ colors });
  });
});

apiRouter.options('/stream/:filename', (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (origin && corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).send();
});

const setStreamCors = (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (origin && corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range'
  );
};

apiRouter.get('/stream/:filename', (req: Request, res: Response): void => {
  setStreamCors(req, res);

  const { filename } = req.params;
  const { streamToken } = req.query;

  if (
    !streamToken ||
    typeof streamToken !== 'string' ||
    !validateStreamToken(streamToken)
  ) {
    res.status(403).json({ error: 'Invalid or expired stream token' });
    return;
  }

  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(__dirname, '../downloads', filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const contentType = filename.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
  res.setHeader('Content-Type', contentType);

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

initIo(io);
registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  resetServerState();
});

server.on('error', (error) => {
  console.error(`Error starting server: ${error}`);
});
