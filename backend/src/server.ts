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
import { getInfo } from 'ytdl-core';
import { getPlaylistSongs } from './utils/playlist.js';
import { getSongDuration } from './utils/song.js';

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

interface UserState {
  color: string;
  isAdmin: boolean;
  lastActive: Date;
}

interface SongLengthLimits {
  maxLength: number; //in seconds
  minLength: number; //in seconds
}

const userQueues: { [key: string]: Song[] } = {};
const userStates: { [key: string]: UserState } = {};
const disconnectTimers: { [key: string]: NodeJS.Timeout } = {};
let userOrder: string[] = [];
let lockedNextSong: Song | null = null;
let lockedNextUser: string | null = null;
let lockedDownloadInProgress: boolean = false;
let isPlaying = false;
let isPaused = false;
let currentPlayingSong: Song | null = null;
let currentCatColor = 'White';
let songLengthLimits: SongLengthLimits = {
  maxLength: 600, //10 minutes
  minLength: 0
};
let songLengthLimit = 10; //10 minutes by default

const resetServerState = () => {

  Object.keys(userStates).forEach(uid => {
    if (userStates[uid]) {
      userStates[uid].color = 'White';
    }
  });
  currentCatColor = 'White';
  currentPlayingSong = null;
  io.emit('server_startup', { timestamp: Date.now() });
  io.emit('updateUserCatColor', { uid: null, color: 'White' });
  io.emit('updateCurrentSong', { currentSong: null });
};

const isUserAdmin = (userInfo: any): boolean => {
  console.log('Checking admin status for user:', {
    username: userInfo.preferred_username,
    groups: userInfo.groups
  });

  if (userInfo.preferred_username === "ccyborgg") {
    console.log('User is admin by username');
    return true;
  }

  const groups = userInfo.groups || [];
  const isAdminByGroup = groups.some((group: string) => 
    group.toLowerCase() === "rtp" || 
    group.toLowerCase() === "eboard"
  );
  
  console.log('Admin check result:', {
    isAdminByGroup,
    matchedGroups: groups.filter((group: string) => 
      group.toLowerCase() === 'rtp' || 
      group.toLowerCase() === 'eboard'
    )
  });

  return isAdminByGroup;
};

const getNextUser = (): string | null => {
  while (userOrder.length > 0) {
    const nextUser = userOrder.shift();
    if (nextUser && userQueues[nextUser]?.length > 0) {
      userOrder.push(nextUser);
      return nextUser;
    } else if (nextUser) {
      delete userQueues[nextUser];
    }
  }
  return null;
};

const preloadNextSong = async () => {
  if (lockedDownloadInProgress || !hasAnyQueueLeft()) return;

  // Get the next user in round robin order
  const nextUser = getNextUser();
  if (!nextUser || !userQueues[nextUser]?.length) return;

  const nextSong = userQueues[nextUser][0]; // first song in next user's queue
  
  // Don't preload if this is the currently playing song
  if (currentPlayingSong && (currentPlayingSong.id === nextSong.id || currentPlayingSong.track_id === nextSong.track_id)) {
    return;
  }

  // Store the next user in round robin order
  lockedNextUser = nextUser;
  lockedNextSong = nextSong;
  lockedDownloadInProgress = true;

  try {
    let audioPath = nextSong.audioPath;
    if (!audioPath) {
      audioPath = await (nextSong.source === 'spotify'
        ? downloadSpotifyAudio(nextSong.track_id)
        : downloadYouTubeAudio(nextSong.uri));
    }
    
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    nextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;    
    lockedDownloadInProgress = false;
    
    // Emit both the preloaded song and update the queue to show locked state
    io.emit('preloaded_next_song', { song: lockedNextSong });
    io.emit('updateUserQueue', { queue: userQueues[nextUser], uid: nextUser });
  } catch (err) {
    console.error('Error preloading next song:', err);
    // Reset locked states on error
    lockedNextSong = null;
    lockedNextUser = null;
    lockedDownloadInProgress = false;
  }
};

const playNextSong = async () => {
  if (isPlaying) return;

  if (currentPlayingSong?.audioPath) {
    deleteAudioFile(currentPlayingSong.audioPath);
    currentPlayingSong = null;
  }

  if (!hasAnyQueueLeft()) {
    io.emit('queue_empty');
    isPlaying = false;
    return;
  }

  // Use the preloaded song's user if available, otherwise get next user in round robin order
  const nextUser = lockedNextUser ?? getNextUser();
  if (!nextUser) {
    io.emit('queue_empty');
    isPlaying = false;
    return;
  }

  const userQueue = userQueues[nextUser];
  const nextSong = userQueue?.[0];

  if (!nextSong) {
    delete userQueues[nextUser];
    // Remove user from order if their queue is empty
    userOrder = userOrder.filter(user => user !== nextUser);
    playNextSong();
    return;
  }

  // Remove the song from the queue since it's now playing
  userQueue.shift();
  if (userQueue.length === 0) {
    delete userQueues[nextUser];
    // Remove user from order if their queue is empty
    userOrder = userOrder.filter(user => user !== nextUser);
  }

  currentPlayingSong = nextSong;
  currentCatColor = userStates[nextUser]?.color || 'White';

  // Reset locked states since we're now playing this song
  lockedNextSong = null;
  lockedNextUser = null;
  lockedDownloadInProgress = false;

  // Start preloading the next song in round robin order
  preloadNextSong();

  io.emit('updateCurrentSong', { currentSong: currentPlayingSong, isLoading: true });
  io.emit('updateUserCatColor', { uid: nextUser, color: currentCatColor });
  io.emit('updateUserQueue', { queue: userQueue || [], uid: nextUser });
  isPlaying = true;

  try {
    let audioPath = nextSong.audioPath;

    if (!audioPath) {
      audioPath = await (nextSong.source === 'spotify'
        ? downloadSpotifyAudio(nextSong.track_id)
        : downloadYouTubeAudio(nextSong.uri));
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    nextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;

    io.emit('updateCurrentSong', { currentSong: nextSong, isLoading: false });
    io.emit('song_download_complete');

  } catch (error) {
    console.error(`Error downloading ${nextSong.source} audio:`, error);
    currentPlayingSong = null;
    io.emit('updateCurrentSong', { currentSong: null });
    io.emit('queue_empty');
    isPlaying = false;
    playNextSong();
  }
};

const hasAnyQueueLeft = (): boolean => {
  return Object.values(userQueues).some(queue => queue.length > 0);
};

const deleteAudioFile = (audioPath: string) => {
  try {
    const fullPath = path.join('/app/downloads', path.basename(audioPath));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted audio file: ${fullPath}`);
    }
  } catch (error) {
    console.error('Error deleting audio file:', error);
  }
};

const updateActiveUsers = () => {
  const activeUsers = Object.entries(userQueues)
    .filter(([_, queue]) => queue && queue.length > 0)
    .map(([username, queue]) => ({
      username,
      queueCount: queue.length,
      profilePicture: `https://profiles.csh.rit.edu/image/${username}`,
      color: userStates[username]?.color || 'White',
      isAdmin: userStates[username]?.isAdmin || false
    }));

  console.log('Active users from queues:', activeUsers);
  io.emit('updateActiveUsers', activeUsers);
};

const handleQueueChange = (uid: string) => {
  if (!userQueues[uid]) {
    userQueues[uid] = [];
  }

  if (userQueues[uid].length === 0) {
    console.log(`Removing empty queue for user ${uid}`);
    delete userQueues[uid];
    // Remove user from order if their queue is empty
    userOrder = userOrder.filter(user => user !== uid);
  }

  updateActiveUsers();
};

const getSnarkyComment = (lengthInSeconds: number): string => {
  return lengthInSeconds > 3600 ? "<br/>Also, over an hour long??? Greedy ahhh mf..." : "";
};

io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);
  socket.emit('server_startup', { timestamp: Date.now() });

  socket.on('getActiveUsers', () => {
    updateActiveUsers();
  });

  socket.on('user_info', (data) => {
    console.log('Received user_info:', data);
    const userInfo = data.userInfo;
    if (userInfo) {
      const uid = userInfo.preferred_username;
      if (uid) {
        console.log(`Setting up socket ${socket.id} for user ${uid}`);
        socket.data.uid = uid;
        socket.join(uid);

        if (disconnectTimers[uid]) {
          clearTimeout(disconnectTimers[uid]);
          delete disconnectTimers[uid];
        }

        if (!userStates[uid]) {
          userStates[uid] = {
            color: 'White',
            isAdmin: isUserAdmin(userInfo),
            lastActive: new Date()
          };
        } else {
          userStates[uid].lastActive = new Date();
        }

        if (!userQueues[uid]) {
          userQueues[uid] = [];
        }

        if (!userOrder.includes(uid)) {
          userOrder.push(uid);
        }

        socket.emit('updateUserQueue', { queue: userQueues[uid], uid });
        socket.emit('updateUserCatColor', { uid, color: userStates[uid].color });
        socket.emit('updateAdminStatus', { isAdmin: userStates[uid].isAdmin });

        if (currentPlayingSong?.submittedBy) {
          socket.emit('updateUserCatColor', { uid: currentPlayingSong.submittedBy, color: currentCatColor });
        }

        updateActiveUsers();
      }
    }
  });

  socket.on('addSongToQueue', async (data) => {
    console.log('Received addSongToQueue event:', data);
    const { song, uid } = data;

    if (!uid) {
      console.error('No uid provided for addSongToQueue');
      return;
    }

    if (!userQueues[uid]) {
      userQueues[uid] = [];
    }

    const wasQueueEmpty = !hasAnyQueueLeft();
    song.submittedBy = uid;

    const lengthParts = song.track_length?.split(':') || ['0', '0'];
    let lengthInSeconds = 0;
    
    if (lengthParts.length === 3) {
      lengthInSeconds = parseInt(lengthParts[0]) * 3600 + parseInt(lengthParts[1]) * 60 + parseInt(lengthParts[2]);
    } else if (lengthParts.length === 2) {
      lengthInSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);
    }

    if (lengthInSeconds > songLengthLimit * 60) {
      socket.emit('message_box', {
        type: 'error',
        message: `Song exceeds the maximum length limit of ${songLengthLimit} minutes${getSnarkyComment(lengthInSeconds)}`
      });
      return;
    }

    try {
      userQueues[uid].push(song);
      updateActiveUsers();
      
      if (wasQueueEmpty && !isPlaying) {
        console.log('Queue was empty and nothing playing, starting playback immediately');
        playNextSong();
      } else if (isPlaying && currentPlayingSong?.submittedBy === uid && userQueues[uid].length === 1) {
        // If we're playing a song from this user and this is their only song in queue,
        // preload the next song immediately
        console.log('Current song is from this user and this is their only song, preloading next');
        preloadNextSong();
      } else {
        // Always emit queue update to ensure UI stays in sync
        io.emit('updateUserQueue', { queue: userQueues[uid], uid });
        
        // If this song is being preloaded, emit the preloaded state
        if (lockedNextUser === uid && lockedNextSong?.id === song.id) {
          io.emit('preloaded_next_song', { song: lockedNextSong });
        }
      }
    } catch (error) {
      console.error('Error adding song to queue:', error);
      socket.emit('message_box', {
        type: 'error',
        message: 'Failed to add song to queue'
      });
    }
  });

  socket.on('song_finished', () => {
    console.log('Song finished, cleaning up and playing next song');
    if (currentPlayingSong?.audioPath) {
      deleteAudioFile(currentPlayingSong.audioPath);
    }
    
    currentPlayingSong = null;
    io.emit('updateCurrentSong', { currentSong: null });
    isPlaying = false;
    playNextSong();
  });

  socket.on('getUserQueue', (uid: string) => {
    console.log(`Received getUserQueue request for user ${uid}`);
    if (uid && userQueues[uid]) {
      console.log(`Sending queue to user ${uid}:`, userQueues[uid]);
      socket.emit('updateUserQueue', { queue: userQueues[uid], uid });
    } else {
      console.log(`No queue found for user ${uid}`);
      socket.emit('updateUserQueue', { queue: [], uid });
    }
  });

  socket.on('get_user_queue', () => {
    console.log('Received get_user_queue request for display page');
    const allQueues = Object.entries(userQueues).reduce((acc, [uid, queue]) => {
      return [...acc, ...queue.map(song => ({ ...song, submittedBy: uid }))];
    }, [] as Song[]);
    console.log('Sending all queues to display page:', allQueues);
    socket.emit('updateUserQueue', { queue: allQueues });

    if (currentPlayingSong) {
      console.log('Sending current song to display page:', currentPlayingSong);
      socket.emit('updateCurrentSong', { currentSong: currentPlayingSong });
    }
  });

  socket.on('removeSongFromQueue', (data: { uid: string; index: number }) => {
    const { uid, index } = data;
    if (uid && userQueues[uid]) {
      if (uid === lockedNextUser && index === 0) {
        socket.emit('message_box', {
          type: 'error',
          message: "You can't remove the next song — it's locked for playback."
        });
        return;
      }
  
      userQueues[uid].splice(index, 1);
      if (userQueues[uid].length === 0) {
        delete userQueues[uid];
      }
      io.emit('updateUserQueue', { queue: userQueues[uid] || [], uid });
      updateActiveUsers();
    }
  });
  

  socket.on('reorderQueue', (data: { uid: string; queue: Song[] }) => {
    const { uid, queue } = data;
  
    if (uid) {
      if (
        uid === lockedNextUser &&
        queue.length > 0 &&
        queue[0].id !== lockedNextSong?.id
      ) {
        socket.emit('message_box', {
          type: 'error',
          message: "The first song in your queue is locked and cannot be moved."
        });
        return;
      }
  
      userQueues[uid] = queue;
      const queueUpdate = { queue, uid };
      socket.emit('updateUserQueue', queueUpdate);
      socket.to(uid).emit('updateUserQueue', queueUpdate);
      io.emit('updateUserQueue', queueUpdate);
    }
  });
  

  socket.on('clearUserQueue', (uid: string) => {
    if (uid && userQueues[uid]) {
      if (uid === lockedNextUser) {
        socket.emit('message_box', {
          type: 'error',
          message: "You can't clear your queue while your next song is locked for playback."
        });
        return;
      }
  
      const currentQueue = [...userQueues[uid]];
      delete userQueues[uid];
      io.emit('updateUserQueue', { queue: [], uid });
      updateActiveUsers();
      if (!hasAnyQueueLeft() && !isPlaying) {
        io.emit('queue_empty');
      } else if (!isPlaying) {
        playNextSong();
      }
    }
  });
  

  socket.on('update_user_color', (data: { uid: string; color: string }) => {
    const { uid, color } = data;
    console.log('Updating user color:', { uid, color });
    
    if (!userStates[uid]) {
      userStates[uid] = {
        color,
        isAdmin: false,
        lastActive: new Date()
      };
    } else {
      userStates[uid].color = color;
      userStates[uid].lastActive = new Date();
    }
    
    if (currentPlayingSong && currentPlayingSong.submittedBy === uid) {
      currentCatColor = color;
      io.emit('updateUserCatColor', { uid, color });
    } else {
      socket.emit('updateUserCatColor', { uid, color });
    }
    
    if (userQueues[uid] && userQueues[uid].length > 0) {
      updateActiveUsers();
    }
  });

  socket.on('get_current_song', () => {
    socket.emit('updateCurrentSong', { 
      currentSong: currentPlayingSong,
      isLoading: currentPlayingSong && !currentPlayingSong.audioPath 
    });
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
      socket.emit('message_box', { type: 'error', message: 'Invalid link provided.' });
      return;
    }

    if (!uid) {
      console.error('Invalid user ID received:', uid);
      socket.emit('message_box', { type: 'error', message: 'Invalid user ID provided.' });
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

      const validSongs: Song[] = [];
      const invalidSongs: { [key: string]: string } = {};
      let successCount = 0;
      let failureCount = 0;

      for (const song of songs) {
        const lengthParts = song.track_length?.split(':') || ['0', '0'];
        let lengthInSeconds = 0;
        
        if (lengthParts.length === 3) {
          lengthInSeconds = parseInt(lengthParts[0]) * 3600 + parseInt(lengthParts[1]) * 60 + parseInt(lengthParts[2]);
        } else if (lengthParts.length === 2) {
          lengthInSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);
        }

        if (lengthInSeconds > songLengthLimit * 60) {
          invalidSongs[song.track_name] = `"${song.track_name}" exceeds the maximum length limit of ${songLengthLimit} minutes${getSnarkyComment(lengthInSeconds)}`;
          failureCount++;
        } else {
          validSongs.push(song);
          successCount++;
        }
      }

      if (validSongs.length > 0) {
        if (!userQueues[uid]) {
          userQueues[uid] = [];
        }
        userQueues[uid].push(...validSongs);
        const eventName = link.includes('playlist') ? 'addPlaylistToQueue' : 'addAlbumToQueue';
        socket.emit(eventName, {
          userId: uid,
          successCount,
          failureCount,
          failureReasons: invalidSongs
        });
        socket.emit('updateUserQueue', { queue: userQueues[uid], uid });
        
        if (!isPlaying) {
          playNextSong();
        }
      } else {
        socket.emit('addSongToQueueError', { 
          userId: uid,
          error: `No songs were added - all ${failureCount} song${failureCount !== 1 ? 's' : ''} exceeded the ${songLengthLimit} minute limit`
        });
      }
    } catch (err) {
      console.error('Error adding link to queue:', err);
      socket.emit('message_box', { type: 'error', message: 'Failed to add link to queue.' });
    }
  });

  socket.on('force_skip', () => {
    if (currentPlayingSong?.audioPath) {
      deleteAudioFile(currentPlayingSong.audioPath);
    }
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

  socket.on('getSongLengthLimits', () => {
    socket.emit('updateSongLengthLimits', songLengthLimits);
  });

  socket.on('updateSongLengthLimits', (data: SongLengthLimits) => {
    const uid = getUserIdFromSocket(socket);
    if (!uid || !userStates[uid]?.isAdmin) return;

    //minimum length is 0, maximum length is 10 minutes
    songLengthLimits = {
      maxLength: Math.min(Math.max(data.maxLength, 0), 600),
      minLength: Math.max(data.minLength, 0)
    };

    io.emit('updateSongLengthLimits', songLengthLimits);
  });

  socket.on('getSongLengthLimit', () => {
    console.log('Received getSongLengthLimit request');
    socket.emit('updateSongLengthLimit', { limit: songLengthLimit });
  });

  socket.on('setSongLengthLimit', (data: { limit: number }) => {
    const uid = getUserIdFromSocket(socket);
    console.log('Received setSongLengthLimit request:', { 
      uid, 
      limit: data.limit,
      userState: uid ? userStates[uid] : null,
      isAdmin: uid ? userStates[uid]?.isAdmin : false
    });
    
    if (!uid || !userStates[uid]?.isAdmin) {
      console.log('User is not admin, ignoring request');
      return;
    }

    //30 second increments
    const normalizedLimit = Math.round(data.limit * 2) / 2;
    songLengthLimit = Math.min(Math.max(normalizedLimit, 1), 10);
    console.log('Updated song length limit:', songLengthLimit);
    io.emit('updateSongLengthLimit', { limit: songLengthLimit });
  });

  socket.on('disconnect', () => {
    const uid = getUserIdFromSocket(socket);
    if (!uid) return;

    disconnectTimers[uid] = setTimeout(() => {
      delete userStates[uid];
      updateActiveUsers();
    }, 5 * 60 * 1000);
  });

  socket.on('preload_failed', async (data: { songId: string, errorType: string, path?: string }) => {
    console.log('Preload failed:', data);
    
    if (data.errorType === 'file_not_found' && lockedNextSong) {
      console.log('Attempting to re-download file for song:', lockedNextSong.track_name);
      
      try {
        // Reset the download status to allow for a retry
        lockedDownloadInProgress = false;
        
        // If the song is still locked and matches the one that failed
        if (lockedNextSong && (lockedNextSong.track_id === data.songId || lockedNextSong.id === data.songId)) {
          // Attempt to re-download the file
          let audioPath;
          if (lockedNextSong.source === 'spotify') {
            audioPath = await downloadSpotifyAudio(lockedNextSong.track_id);
          } else {
            audioPath = await downloadYouTubeAudio(lockedNextSong.uri);
          }
          
          // Update the path and notify clients
          const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
          lockedNextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;
          
          console.log('Successfully re-downloaded file:', lockedNextSong.audioPath);
          
          // Notify clients about the updated song
          io.emit('preloaded_next_song', { song: lockedNextSong });
        }
      } catch (err) {
        console.error('Error re-downloading file:', err);
        // In case of persistent failure, we might want to skip this song
        if (lockedNextUser && userQueues[lockedNextUser] && userQueues[lockedNextUser].length > 0) {
          userQueues[lockedNextUser].shift(); // Remove the problematic song
          io.emit('updateUserQueue', { queue: userQueues[lockedNextUser], uid: lockedNextUser });
          
          // Try preloading the next song instead
          lockedNextSong = null;
          lockedNextUser = null;
          lockedDownloadInProgress = false;
          preloadNextSong();
        }
      }
    }
  });
});

const getUserIdFromSocket = (socket: any): string | null => {
  return socket.data?.uid || null;
};

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  resetServerState();
});

server.on('error', (error) => {
  console.error(`Error starting server: ${error}`);
});