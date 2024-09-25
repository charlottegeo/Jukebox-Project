import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server } from 'socket.io';
import fs from 'fs';
import cors from 'cors';
import { searchSpotifyTracks, handleSpotifyLink } from './spotify';
import { searchYouTube, handleYouTubeLink } from './youtube';
import { Song } from './interfaces';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import sharedSession from 'express-socket.io-session';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isHttps = process.env.USE_HTTPS === 'true';
const httpsOptions = isHttps
  ? {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || ''),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || ''),
    }
  : {};

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'shh-its-a-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isHttps,
    maxAge: 1000 * 60 * 60 * 24,
  },
});

app.use(sessionMiddleware);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080', // Use the frontend URL from .env
    methods: ['GET', 'POST'],
    credentials: true,
  })
);

app.use(express.static(path.join(__dirname, '../frontend')));

const server = isHttps
  ? createHttpsServer(httpsOptions, app)
  : createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:8080',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use(
  sharedSession(sessionMiddleware as any, {
    autoSave: true,
  }) as unknown as (
    socket: any,
    next: (err?: any) => void
  ) => void
);

// Spotify API token management
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID as string;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET as string;
let spotifyToken = '';

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
// Refresh the Spotify token every hour
async function refreshSpotifyToken() {
  try {
    const response = await axios.post<SpotifyTokenResponse>(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );
    spotifyToken = response.data.access_token;
  } catch (error) {
    console.error('Error refreshing Spotify access token:', error);
  }
}
refreshSpotifyToken();
setInterval(refreshSpotifyToken, 60 * 60 * 1000);

// In-memory storage for user queues
interface UserQueueData {
  [key: string]: Song[];
}

const userQueues: UserQueueData = {};  
const userColors: { [key: string]: string } = {};
let userOrder: string[] = [];
let isPlaying = false;
let currentPlayingSong: Song | null = null;

// Function to get the next user in the queue
function getNextUser(): string | null {
  if (userOrder.length > 0) {
    const nextUser = userOrder.shift();
    if (nextUser !== undefined) {
      userOrder.push(nextUser);
      return nextUser;
    }
  }
  return null;
}

// Function to play the next song in the queue
async function playNextSong() {
  const nextUser = getNextUser();
  if (nextUser) {
    const userQueue = userQueues[nextUser];
    if (userQueue && userQueue.length > 0) {
      currentPlayingSong = userQueue.shift() ?? null;
      io.emit('next_song', { nextSong: currentPlayingSong });
      io.emit('updateCurrentSong', { currentSong: currentPlayingSong });
      io.to(nextUser).emit('updateUserQueue', { queue: userQueue });
      isPlaying = true;

      if (userQueue.length === 0) {
        io.emit('queue_empty');
      }
    } else {
      currentPlayingSong = null;
      io.emit('queue_empty');
      isPlaying = false;
    }
  } else {
    currentPlayingSong = null;
    isPlaying = false;
    io.emit('queue_empty');
  }
}

// Handle socket.io connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  const session = (socket.handshake as any).session;

  const uid = session?.uid;

  if (uid) {
    console.log(`UID for search page user: ${uid}`);

    if (!userQueues[uid]) {
      userQueues[uid] = [];
    }

    if (!userOrder.includes(uid)) {
      userOrder.push(uid);
    }

    const userColor = userColors[uid] || 'White';
    socket.emit('updateUserCatColor', { color: userColor });
    socket.emit('updateUserQueue', { queue: userQueues[uid] });
  }

  socket.on('addSongToQueue', async (data) => {
    const { song } = data;
    if (uid && userQueues[uid]) {
      userQueues[uid].push(song);
      io.to(socket.id).emit('updateUserQueue', { queue: userQueues[uid] });

      if (!isPlaying) {
        playNextSong();
      }
    }
  });

  socket.on('getUserQueue', () => {
    if (uid && userQueues[uid]) {
      socket.emit('updateUserQueue', { queue: userQueues[uid] });
    }
  });

  socket.on('removeSongFromQueue', (index: number) => {
    if (uid && userQueues[uid]) {
      userQueues[uid].splice(index, 1);
      io.to(socket.id).emit('updateUserQueue', { queue: userQueues[uid] });
    }
  });

  socket.on('reorderQueue', (queue: Song[]) => {
    if (uid) {
      userQueues[uid] = queue;
      io.to(socket.id).emit('updateUserQueue', { queue });
    }
  });

  socket.on('clearUserQueue', () => {
    if (uid && userQueues[uid]) {
      userQueues[uid] = [];
      io.to(socket.id).emit('updateUserQueue', { queue: [] });
    }
  });

  socket.on('get_current_song', () => {
    socket.emit('updateCurrentSong', { currentSong: currentPlayingSong });
  });

  socket.on('searchTracks', async (data) => {
    const { track_name, source } = data;
    if (source === 'spotify') {
      const searchResults = await searchSpotifyTracks(track_name, 5) ?? [];
      socket.emit('searchResults', { results: await Promise.all(searchResults) });
    } else if (source === 'youtube') {
      const searchResults = await searchYouTube(track_name, 5);
      socket.emit('searchResults', { results: searchResults });
    }
  });

  socket.on('addLinkToQueue', async (data) => {
    const { link } = data;
    if (uid) {
      try {
        let songs: Song[] = [];

        if (link.includes('spotify')) {
          songs = await handleSpotifyLink(link);
        } else if (link.includes('youtube')) {
          songs = await handleYouTubeLink(link);
        } else {
          throw new Error('Invalid link format');
        }

        userQueues[uid].push(...songs);
        io.to(socket.id).emit('updateUserQueue', { queue: userQueues[uid] });

        if (!isPlaying) {
          playNextSong();
        }
      } catch (err) {
        console.error('Error adding link to queue:', err);
      }
    }
  });

  socket.on('disconnect', () => {
    if (uid) {
      userOrder = userOrder.filter(userId => userId !== uid);
      console.log(`User ${uid} disconnected and removed from the queue.`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with ${isHttps ? 'HTTPS' : 'HTTP'}`);
});
