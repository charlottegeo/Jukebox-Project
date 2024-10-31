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
import { searchYouTube, handleYouTubeLink, downloadYouTubeAudio } from './youtube.js';
import { Song } from './interfaces';
import fs from 'fs'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const apiRouter = express.Router();
const PORT = process.env.BACKEND_PORT || 3001;
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [process.env.FRONTEND_URL || 'localhost:8080'];

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
app.use('/downloads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range'); 
  next();
}, express.static(path.join(__dirname, '../downloads')));

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

interface UserQueueData {
  [key: string]: Song[];
}

const userQueues: UserQueueData = {};
const userColors: { [key: string]: string } = {};
const disconnectTimers: { [key: string]: NodeJS.Timeout } = {};
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
      currentPlayingSong = nextSong ?? null;

      if (currentPlayingSong) {
        io.emit('updateCurrentSong', { currentSong: currentPlayingSong });
        io.emit('updateUserQueue', { queue: userQueue, uid: nextUser });
        isPlaying = true;

        if (nextSong?.source === 'youtube') {
          try {
            const audioPath = await downloadYouTubeAudio(nextSong.uri);
            const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
            nextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;
            io.emit('updateCurrentSong', { currentSong: nextSong });
          } catch (error) {
            console.error('Error downloading YouTube audio:', error);
            currentPlayingSong = null;
            io.emit('queue_empty');
            isPlaying = false;
          }
        }
      }
    } else {
      playNextSong();
    }
  }
};


const hasAnyQueueLeft = (): boolean => {
  return Object.values(userQueues).some(queue => queue.length > 0);
};

// Socket.IO connections
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
    } else if (source ===   'youtube') {
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
                songs = await handleSpotifyLink(link, uid);
            } else if (link.includes('youtube')) {
                songs = await handleYouTubeLink(link);
            } else {
                throw new Error('Invalid link format');
            }

            songs.forEach(song => song.submittedBy = uid);

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
