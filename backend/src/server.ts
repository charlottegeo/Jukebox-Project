import express, { Request, Response } from 'express';
import session, { SessionData } from 'express-session';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import querystring from 'querystring';
import path from 'path';
import { fileURLToPath } from 'url';
import { searchSpotifyTracks, searchYouTube, handleSpotifyLink, handleYouTubeLink, downloadSpotifyAudio, downloadYouTubeAudio } from './trackService.js';
import { Song } from './interfaces';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const apiRouter = express.Router();
const PORT = process.env.BACKEND_PORT || 3001;
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [process.env.FRONTEND_URL || 'localhost:8080'];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));
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

app.use('/downloads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  next();
}, express.static(path.join(__dirname, '../downloads')));

app.use('/api', apiRouter);

apiRouter.get('/cat-colors', (req, res) => {
  const catImageDir = path.join(__dirname, '../frontend/public/images/cats');
  fs.readdir(catImageDir, { withFileTypes: true }, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to load cat colors' });
    }
    const colors = files.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
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

const generateRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

function generateCodeVerifier(length = 128): string {
  return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64').replace(/[^a-zA-Z0-9]/g, '');
}

interface UserQueueData {
  [key: string]: Song[];
}

const userQueues: UserQueueData = {};
const userColors: { [key: string]: string } = {};
const disconnectTimers: { [key: string]: NodeJS.Timeout } = {};
let userOrder: string[] = [];
let isPlaying = false;
let isPaused = false;
let currentPlayingSong: Song | null = null;

const getNextUser = (): string | null => {
  if (userOrder.length > 0) {
    const nextUser = userOrder.shift();
    if (nextUser !== undefined) {
      userOrder.push(nextUser);
      return nextUser;
    }
  }
  return null;
};

const playNextSong = async () => {
  if (isPlaying) {
    return;
  }

  if (!hasAnyQueueLeft()) {
    currentPlayingSong = null;
    io.emit('queue_empty');
    isPlaying = false;
    return;
  }

  const nextUser = getNextUser();
  if (nextUser) {
    const userQueue = userQueues[nextUser];

    if (userQueue && userQueue.length > 0) {
      const nextSong = userQueue.shift();
      if (!nextSong) {
        playNextSong();
        return;
      }

      currentPlayingSong = nextSong;
      io.emit('updateCurrentSong', { currentSong: currentPlayingSong, isLoading: true });
      io.emit('updateUserQueue', { queue: userQueue, uid: nextUser });
      isPlaying = true;
      
      try {
        const audioPath = await (nextSong.source === 'spotify' 
          ? downloadSpotifyAudio(nextSong.track_id)
          : downloadYouTubeAudio(nextSong.uri));
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
        nextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;
        io.emit('updateCurrentSong', { currentSong: nextSong, isLoading: false });
        io.emit('song_download_complete');
      } catch (error) {
        console.error(`Error downloading ${nextSong.source} audio:`, error);
        currentPlayingSong = null;
        io.emit('queue_empty');
        isPlaying = false;
      }
    } else {
      playNextSong();
    }
  }
};


const hasAnyQueueLeft = (): boolean => {
  return Object.values(userQueues).some(queue => queue.length > 0);
};

io.on('connection', (socket) => {
  socket.on('user_info', (data) => {
    const userInfo = data.userInfo;
    if (userInfo) {
      const uid = userInfo.preferred_username;
      if (uid) {
        socket.data.uid = uid;
        if (disconnectTimers[uid]) {
          clearTimeout(disconnectTimers[uid]);
          delete disconnectTimers[uid];
        }

        const wasQueueEmpty = !hasAnyQueueLeft();

        if (!userQueues[uid]) {
          userQueues[uid] = [];
        }

        if (!userOrder.includes(uid)) {
          userOrder.push(uid);
        }

        const userColor = userColors[uid] || 'White';
        socket.emit('updateUserCatColor', { color: userColor });
        socket.emit('updateUserQueue', { queue: userQueues[uid] });

        if (wasQueueEmpty && !isPlaying && userQueues[uid].length > 0) {
          playNextSong();
        }
      }
    }
  });

  socket.on('addSongToQueue', async (data) => {
    const { song, uid } = data;

    if (uid && userQueues[uid]) {
      const wasQueueEmpty = userQueues[uid].length === 0;
      song.submittedBy = uid;
      userQueues[uid].push(song);

      socket.emit('updateUserQueue', { queue: userQueues[uid], uid });

      if (!isPlaying && wasQueueEmpty) {
        playNextSong();
      }
    }
  });

  socket.on('song_finished', () => {
    isPlaying = false;
    playNextSong();
  });

  socket.on('getUserQueue', (uid: string) => {
    if (uid && userQueues[uid]) {
      socket.emit('updateUserQueue', { queue: userQueues[uid] });
    }
  });

  socket.on('removeSongFromQueue', (data: { uid: string; index: number }) => {
    const { uid, index } = data;

    if (uid && userQueues[uid]) {
      userQueues[uid].splice(index, 1);
      socket.emit('updateUserQueue', { queue: userQueues[uid], uid });
    }
  });

  socket.on('reorderQueue', (data: { uid: string; queue: Song[] }) => {
    const { uid, queue } = data;

    if (uid) {
      userQueues[uid] = queue;
      socket.emit('updateUserQueue', { queue, uid });
    }
  });

  socket.on('clearUserQueue', (uid: string) => {
    if (uid && userQueues[uid]) {
      userQueues[uid] = [];
      socket.emit('updateUserQueue', { queue: [], uid });
    }
  });

  socket.on('update_user_color', (data: { uid: string; color: string }) => {
    const { uid, color } = data;
    userColors[uid] = color;
    io.emit('updateUserCatColor', { uid, color });
  });

  socket.on('get_current_song', () => {
    socket.emit('updateCurrentSong', { currentSong: currentPlayingSong });
  });

  socket.on('get_next_song', () => {
    console.log('Requesting next song');
    playNextSong();
  });

  socket.on('searchTracks', async (data) => {
    const { track_name, source, uid } = data;
    if (source === 'spotify') {
      const searchResults = (await searchSpotifyTracks(track_name, 5, ['track'], uid)) ?? [];
      socket.emit('searchResults', { results: searchResults });
    } else if (source === 'youtube') {
      const searchResults = await searchYouTube(track_name, 5);
      socket.emit('searchResults', { results: searchResults });
    }
  });

  socket.on('addLinkToQueue', async (data) => {
    const { link, uid } = data;

    if (!link || typeof link !== 'string') {
      console.error('Invalid link received:', link);
      socket.emit('error_message', { message: 'Invalid link provided.' });
      return;
    }

    if (!uid) {
      console.error('Invalid user ID received:', uid);
      socket.emit('error_message', { message: 'Invalid user ID provided.' });
      return;
    }

    try {
      let songs: Song[] = [];

      if (link.includes('spotify')) {
        songs = await handleSpotifyLink(link, uid);
      } else if (link.includes('youtube')) {
        songs = await handleYouTubeLink(link);
      } else {
        throw new Error('Invalid link format');
      }

      songs.forEach(song => song.submittedBy = uid);

      if (userQueues[uid]) {
        userQueues[uid].push(...songs);
        socket.emit('updateUserQueue', { queue: userQueues[uid], uid });
        
        if (!isPlaying) {
          playNextSong();
        }
      }
    } catch (err) {
      console.error('Error adding link to queue:', err);
      socket.emit('error_message', { message: 'Failed to add link to queue.' });
    }
  });

  socket.on('force_skip', () => {
    isPlaying = false;
    playNextSong();
  });

  socket.on('pause_play', () => {
    isPaused = !isPaused;
    io.emit('toggle_pause_play', { isPaused });
  });

  socket.on('refresh_display', () => {
    io.emit('refresh_display');
  });

  socket.on('set_volume', (data: { volume: number }) => {
    io.emit('volume_change', { volume: data.volume });
  });

  socket.on('disconnect', () => {
    const uid = socket.data.uid;
    if (uid) {
      disconnectTimers[uid] = setTimeout(() => {
        userOrder = userOrder.filter((userId) => userId !== uid);
        delete disconnectTimers[uid];
      }, 60000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (error) => {
  console.error(`Error starting server: ${error}`);
});
