import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { searchSpotifyTracks, handleSpotifyLink } from './spotify';
import { searchYouTube, handleYouTubeLink } from './youtube';
import { Song, UserQueue } from './interfaces';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());

const redisClient = createClient();
redisClient.connect().catch(console.error);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

let userOrder: string[] = [];
let isPlaying = false;
let currentPlayingSong: Song | null = null;

/**
 * Get the next user in the round-robin order.
 * @returns The next user, or null if there are no more users.
 */
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

async function playNextSong() {
  const nextUser = getNextUser();
  if (nextUser) {
    try {
      const reply = await redisClient.get(nextUser);
      if (reply) {
        const userQueue: Song[] = JSON.parse(reply);
        currentPlayingSong = userQueue.shift() ?? null;
        await redisClient.set(nextUser, JSON.stringify(userQueue));
        io.emit('next_song', { nextSong: currentPlayingSong });
        isPlaying = true;
      } else {
        currentPlayingSong = null;
        isPlaying = false;
        io.emit('queue_empty');
      }
    } catch (err) {
      console.error('Error fetching user queue from Redis:', err);
    }
  } else {
    currentPlayingSong = null;
    isPlaying = false;
    io.emit('queue_empty');
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('addSongToQueue', async (data) => {
    const { uid, song } = data;
    try {
      const reply = await redisClient.get(uid);
      let userQueue: Song[] = reply ? JSON.parse(reply) : [];
      userQueue.push(song);
      await redisClient.set(uid, JSON.stringify(userQueue));
      io.to(socket.id).emit('updateUserQueue', { queue: userQueue });
      if (!isPlaying) {
        playNextSong();
      }
    } catch (err) {
      console.error('Error adding song to queue:', err);
    }
  });

  socket.on('getUserQueue', async (uid) => {
    try {
      const reply = await redisClient.get(uid);
      const userQueue = reply ? JSON.parse(reply) : [];
      socket.emit('updateUserQueue', { queue: userQueue });
    } catch (err) {
      console.error('Error getting user queue:', err);
    }
  });

  socket.on('removeSongFromQueue', async (data) => {
    const { uid, index } = data;
    try {
      const reply = await redisClient.get(uid);
      if (reply) {
        let userQueue: Song[] = JSON.parse(reply);
        userQueue.splice(index, 1);
        await redisClient.set(uid, JSON.stringify(userQueue));
        io.to(socket.id).emit('updateUserQueue', { queue: userQueue });
      }
    } catch (err) {
      console.error('Error removing song from queue:', err);
    }
  });

  socket.on('reorderQueue', async (data) => {
    const { uid, queue } = data;
    try {
      await redisClient.set(uid, JSON.stringify(queue));
      io.to(socket.id).emit('updateUserQueue', { queue });
    } catch (err) {
      console.error('Error reordering queue:', err);
    }
  });

  socket.on('clearUserQueue', async (uid) => {
    try {
      await redisClient.del(uid); // Clear the queue in Redis
      io.to(socket.id).emit('updateUserQueue', { queue: [] });
    } catch (err) {
      console.error('Error clearing user queue:', err);
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
    const { link, uid } = data;
    try {
        let songs: Song[] = [];
        
        if (link.includes('spotify')) {
            songs = await handleSpotifyLink(link);
        } else if (link.includes('youtube')) {
            songs = await handleYouTubeLink(link);
        } else {
            throw new Error('Invalid link format');
        }
        
        const reply = await redisClient.get(uid);
        let userQueue: Song[] = reply ? JSON.parse(reply) : [];
        userQueue.push(...songs);
        await redisClient.set(uid, JSON.stringify(userQueue));
        io.to(socket.id).emit('updateUserQueue', { queue: userQueue });

        if (!isPlaying) {
            playNextSong();
        }
    } catch (err) {
        console.error('Error adding link to queue:', err);
    }
});


  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(3001, () => {
  console.log('Server is running on port 3001');
});
