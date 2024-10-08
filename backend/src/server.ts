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
import { searchSpotifyTracks, handleSpotifyLink } from './spotify.js';
import { searchYouTube, handleYouTubeLink } from './youtube.js';
import { Song } from './interfaces';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const apiRouter = express.Router();
const PORT = process.env.BACKEND_PORT || 3001;
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8080', 'http://frontend:8080'];

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

app.use('/api', apiRouter);

apiRouter.get('/spotify-auth-check', (req: Request & { session: SessionData }, res: Response) => {
  const authenticated = !!req.session.spotifyRefreshToken;
  res.json({ authenticated });
});

const spotifyCallbackHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.body.code || req.query.code as string;

    if (!code) {
      res.status(400).json({ success: false, error: 'No authorization code provided' });
      return;
    }

    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      data: querystring.stringify({
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    };

    const response = await axios(authOptions);
    const { refresh_token } = response.data;

    (req.session as SessionData).spotifyRefreshToken = refresh_token;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error getting Spotify token:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || 'Failed to get Spotify token',
    });
  }
};

apiRouter.post('/spotify/callback', spotifyCallbackHandler);

apiRouter.get('/login', (req: Request, res: Response) => {
  const state = generateRandomString(16);
  const scope = 'user-read-private user-read-email';

  res.redirect(
    'https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        state,
      })
  );
});

app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const generateRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

interface UserQueueData {
  [key: string]: Song[];
}

const userQueues: UserQueueData = {};
const userColors: { [key: string]: string } = {};
let userOrder: string[] = [];
let isPlaying = false;
let currentPlayingSong: Song | null = null;

// Function to get the next user in the queue
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

// Function to play the next song in the queue
const playNextSong = async () => {
  const nextUser = getNextUser();
  if (nextUser) {
    const userQueue = userQueues[nextUser];
    if (userQueue && userQueue.length > 0) {
      currentPlayingSong = userQueue.shift() ?? null;
      console.log('Next song:', currentPlayingSong); // Log the next song details
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
};


// Socket.IO connections
io.on('connection', (socket) => {
  socket.on('user_info', (data) => {
    const userInfo = data.userInfo;
    console.log('User info:', userInfo);
    if (userInfo && userInfo.preferred_username !== 'foolish'){
      const uid = userInfo.preferred_username;

      if (uid) {
        socket.data.uid = uid;
  
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
    }

  });

  socket.on('addSongToQueue', async (data) => {
    const { song, uid } = data;
    console.log('Adding song to queue:', song);
    if (uid && userQueues[uid]) {
      userQueues[uid].push(song);
      io.to(socket.id).emit('updateUserQueue', { queue: userQueues[uid] });

      if (!isPlaying) {
        playNextSong();
      }
    }
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
      io.to(socket.id).emit('updateUserQueue', { queue: userQueues[uid] });
    }
  });

  socket.on('reorderQueue', (data: { uid: string; queue: Song[] }) => {
    const { uid, queue } = data;

    if (uid) {
      userQueues[uid] = queue;
      io.to(socket.id).emit('updateUserQueue', { queue });
    }
  });

  socket.on('clearUserQueue', (uid: string) => {
    if (uid && userQueues[uid]) {
      userQueues[uid] = [];
      io.to(socket.id).emit('updateUserQueue', { queue: [] });
    }
  });

  socket.on('get_current_song', () => {
    socket.emit('updateCurrentSong', { currentSong: currentPlayingSong });
  });

  socket.on('get_next_song', () => {
    playNextSong();
  });

  socket.on('searchTracks', async (data) => {
    const { track_name, source } = data;
    if (source === 'spotify') {
      const searchResults = (await searchSpotifyTracks(track_name, 5)) ?? [];
      socket.emit('searchResults', { results: searchResults });
    } else if (source === 'youtube') {
      const searchResults = await searchYouTube(track_name, 5);
      socket.emit('searchResults', { results: searchResults });
    }
  });

  socket.on('addLinkToQueue', async (data) => {
    const { link, uid } = data;

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
    const uid = socket.data.uid;
    if (uid) {
      userOrder = userOrder.filter((userId) => userId !== uid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (error) => {
  console.error(`Error starting server: ${error}`);
});
