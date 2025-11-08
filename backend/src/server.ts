import express, { Request, Response } from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { registerSocketHandlers } from './socketHandlers.js';
import { initIo, resetServerState } from './stateManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const apiRouter = express.Router();
const PORT = process.env.BACKEND_PORT || 3001;
const corsOrigins =
  process.env.CORS_ORIGINS?.split(',') || [
    process.env.FRONTEND_URL || 'localhost:8080',
  ];

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
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
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