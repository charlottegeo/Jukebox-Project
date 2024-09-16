import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { searchSpotifyTracks } from './spotify';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // React app URL
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('searchTracks', async (data) => {
    const { track_name, source, limit } = data;

    if (source === 'spotify') {
      const searchResults = await searchSpotifyTracks(track_name, limit || 5);
      socket.emit('searchResults', { results: searchResults });
    } else {
      socket.emit('searchResults', { results: [] }); // Handle other sources or default case
    }
  });

  socket.on('addSongToQueue', (data) => {
    console.log('Song added to queue:', data);
  });

  socket.on('get_current_song', () => {
    const currentSong = {
      track_name: 'Current Song',
      artist_name: 'Current Artist',
      cover_url: 'https://via.placeholder.com/150',
    };
    socket.emit('updateCurrentSong', { currentSong });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(3001, () => {
  console.log('Server is running on port 3001');
});
