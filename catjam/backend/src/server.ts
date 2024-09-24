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
import { Issuer, Strategy, TokenSet, ClientMetadata } from 'openid-client';
import passport from 'passport';
import sharedSession from 'express-socket.io-session';
import { cshUserAuth } from './utils';  // Import cshUserAuth middleware

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

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
app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080', // Use the frontend URL from .env
    methods: ['GET', 'POST'],
    credentials: true,
  })
);

async function setupOIDC() {
  if (!process.env.OIDC_CLIENT_ID) throw new Error('Missing OIDC_CLIENT_ID');
  const OIDC_CLIENT_ID: string = process.env.OIDC_CLIENT_ID;

  if (!process.env.OIDC_CLIENT_SECRET) throw new Error('Missing OIDC_CLIENT_SECRET');
  const OIDC_CLIENT_SECRET: string = process.env.OIDC_CLIENT_SECRET;

  if (!process.env.OIDC_ISSUER) throw new Error('Missing OIDC_ISSUER');
  const OIDC_ISSUER: string = process.env.OIDC_ISSUER;

  if (!process.env.OIDC_REDIRECT_URI) throw new Error('Missing OIDC_REDIRECT_URI');
  const OIDC_REDIRECT_URI: string = process.env.OIDC_REDIRECT_URI;

  const oidcIssuer = await Issuer.discover(OIDC_ISSUER);

  const client = new oidcIssuer.Client({
    client_id: OIDC_CLIENT_ID,
    client_secret: OIDC_CLIENT_SECRET,
    redirect_uris: [OIDC_REDIRECT_URI],
    response_types: ['code'],
  } as ClientMetadata);

  passport.use(
    'oidc',
    new Strategy({ client }, (tokenset: TokenSet, userinfo: any, done: (err: any, user?: any) => void) => {
      const user = {
        tokens: tokenset,
        info: userinfo,
      };
      return done(null, user);
    })
  );

  passport.serializeUser((user: any, done: (err: any, id?: any) => void) => {
    done(null, user);
  });

  passport.deserializeUser((obj: any, done: (err: any, obj?: any) => void) => {
    done(null, obj);
  });
}

setupOIDC();

// OIDC login routes
app.get('/login', passport.authenticate('oidc'));

app.get(
  '/oidc_callback',
  passport.authenticate('oidc', {
    successRedirect: '/',
    failureRedirect: '/error',
  })
);

app.get('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

// Middleware to check OIDC authentication for Express routes
const isOIDCAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized' });
};

// Use the cshUserAuth middleware on protected routes
app.get('/protected', isOIDCAuthenticated, cshUserAuth, (req: Request, res: Response) => {
  res.json({
    message: 'This is a protected route!',
    user: req.authDict, // Access the user info
  });
});

// Serve static files (e.g., frontend build)
app.use(express.static(path.join(__dirname, '../frontend')));

// HTTP or HTTPS server setup
const server = isHttps
  ? createHttpsServer(httpsOptions, app)
  : createServer(app);

// Socket.IO setup with session sharing
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:8080',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Use the shared session middleware with socket.io
io.use(
  sharedSession(sessionMiddleware, {
    autoSave: true,
  })
);

// Spotify API token management
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID as string;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET as string;
let spotifyToken = '';

// Refresh the Spotify token every hour
async function refreshSpotifyToken() {
  try {
    const response = await axios.post(
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

  const userInfo = session?.passport?.user?.info;
  const uid = userInfo?.preferred_username;


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
