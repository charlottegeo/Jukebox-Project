import { Server, Socket } from 'socket.io';
import * as stateManager from './stateManager.js';
import * as queueManager from './queueManager.js';
import {
  searchSpotifyTracks,
  searchYouTube,
  handleSpotifyLink,
  handleYouTubeLink,
} from './trackService.js';
import { getSongLengthInSeconds } from './utils.js';
import { Song } from './interfaces';

const getUserIdFromSocket = (socket: any): string | null => {
  return socket.data?.uid || null;
};

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    console.log('New socket connection:', socket.id);
    socket.emit('server_startup', { timestamp: Date.now() });

    socket.on('getActiveUsers', () => {
      stateManager.updateActiveUsers();
    });

    socket.on('user_info', (data) => {
      console.log('Received user_info:', data);
      const userInfo = data.userInfo;
      if (userInfo?.preferred_username) {
        const uid = userInfo.preferred_username;
        console.log(`Setting up socket ${socket.id} for user ${uid}`);
        socket.data.uid = uid;
        socket.join(uid);
        stateManager.addUser(uid, userInfo, socket);
      }
    });

    socket.on('addSongToQueue', async (data) => {
      const { song, uid } = data;
      if (!uid) return;

      const lengthInSeconds = getSongLengthInSeconds(song);
      const songLengthLimit = stateManager.getSongLengthLimit();

      if (lengthInSeconds > songLengthLimit * 60) {
        socket.emit('message_box', {
          type: 'error',
          message: `Song exceeds the maximum length limit of ${songLengthLimit} minutes`,
        });
        return;
      }

      const wasQueueEmpty = !stateManager.hasAnyQueueLeft();
      stateManager.addSongToQueue(uid, song);

      if (wasQueueEmpty && !stateManager.getIsPlaying()) {
        console.log('Queue was empty and nothing playing, starting playback immediately');
        queueManager.playNextSong();
      } else if (
        stateManager.getIsPlaying() &&
        stateManager.getCurrentSong()?.submittedBy === uid &&
        stateManager.getUserQueue(uid)?.length === 1
      ) {
        console.log('Current song is from this user and this is their only song, preloading next');
        queueManager.preloadNextSong();
      }
    });

    socket.on('song_finished', () => {
      console.log('Song finished, cleaning up and playing next song');
      stateManager.setPlaying(false);
      queueManager.playNextSong();
    });

    socket.on('getUserQueue', (uid: string) => {
      if (uid && stateManager.hasUser(uid)) {
        socket.emit('updateUserQueue', {
          queue: stateManager.getUserQueue(uid),
          uid,
        });
      } else {
        socket.emit('updateUserQueue', { queue: [], uid });
      }
    });

    socket.on('get_user_queue', () => {
      const allQueues = stateManager.getUserOrder().reduce((acc, uid) => {
        const queue = stateManager.getUserQueue(uid);
        if (queue) {
          return [...acc, ...queue.map((song) => ({ ...song, submittedBy: uid }))];
        }
        return acc;
      }, [] as Song[]);
      socket.emit('updateUserQueue', { queue: allQueues });

      if (stateManager.getCurrentSong()) {
        socket.emit('updateCurrentSong', {
          currentSong: stateManager.getCurrentSong(),
        });
      }
    });

    socket.on('removeSongFromQueue', (data: { uid: string; index: number }) => {
      stateManager.removeSongFromQueue(data.uid, data.index, socket);
    });

    socket.on('reorderQueue', (data: { uid: string; queue: Song[] }) => {
      stateManager.reorderQueue(data.uid, data.queue, socket);
    });

    socket.on('clearUserQueue', (uid: string) => {
      stateManager.clearUserQueue(uid, socket);
      if (!stateManager.hasAnyQueueLeft() && !stateManager.getIsPlaying()) {
        queueManager.playNextSong();
      }
    });

    socket.on('update_user_color', (data: { uid: string; color: string }) => {
      stateManager.updateUserColor(data.uid, data.color, socket);
    });

    socket.on('get_current_song', () => {
      const currentSong = stateManager.getCurrentSong();
      socket.emit('updateCurrentSong', {
        currentSong: currentSong,
        isLoading: currentSong && !currentSong.audioPath,
      });
    });

    socket.on('get_next_song', () => {
      console.log('Requesting next song');
      queueManager.playNextSong();
    });

    socket.on('searchTracks', async (data) => {
      const { track_name, source, uid } = data;
      if (source === 'spotify') {
        const results = (await searchSpotifyTracks(track_name, 5, ['track'], uid)) ?? [];
        socket.emit('searchResults', { results });
      } else if (source === 'youtube') {
        const results = await searchYouTube(track_name, 5);
        socket.emit('searchResults', { results });
      }
    });

    socket.on('addLinkToQueue', async (data) => {
      const { link, uid } = data;
      if (!link || !uid) return;

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
        const songLengthLimit = stateManager.getSongLengthLimit();

        for (const song of songs) {
          const lengthInSeconds = getSongLengthInSeconds(song);
          if (lengthInSeconds > songLengthLimit * 60) {
            invalidSongs[song.track_name] = `"${
              song.track_name
            }" exceeds the maximum length limit of ${songLengthLimit} minutes`;
            failureCount++;
          } else {
            validSongs.push(song);
            successCount++;
          }
        }

        if (validSongs.length > 0) {
          stateManager.addSongsToQueue(uid, validSongs);
          const eventName = link.includes('playlist')
            ? 'addPlaylistToQueue'
            : 'addAlbumToQueue';
          socket.emit(eventName, {
            userId: uid,
            successCount,
            failureCount,
            failureReasons: invalidSongs,
          });

          if (!stateManager.getIsPlaying()) {
            queueManager.playNextSong();
          }
        } else {
          socket.emit('addSongToQueueError', {
            userId: uid,
            error: `No songs were added - all ${failureCount} song${
              failureCount !== 1 ? 's' : ''
            } exceeded the ${songLengthLimit} minute limit`,
          });
        }
      } catch (err) {
        console.error('Error adding link to queue:', err);
        socket.emit('message_box', {
          type: 'error',
          message: 'Failed to add link to queue.',
        });
      }
    });

    socket.on('force_skip', () => {
      if (stateManager.getIsPlaying()) {
        stateManager.setPlaying(false);
      }
      queueManager.playNextSong();
    });

    socket.on('pause_play', () => {
      stateManager.togglePause();
    });

    socket.on('refresh_display', () => {
      io.emit('refresh_display');
    });

    socket.on('set_volume', (data: { volume: number }) => {
      io.emit('volume_change', { volume: data.volume });
    });

    socket.on('getSongLengthLimits', () => {
      socket.emit('updateSongLengthLimits', stateManager.getSongLengthLimits());
    });

    socket.on('updateSongLengthLimits', (data: stateManager.SongLengthLimits) => {
      const uid = getUserIdFromSocket(socket);
      if (!uid) return;
      stateManager.setSongLengthLimits(data, uid);
    });

    socket.on('getSongLengthLimit', () => {
      socket.emit('updateSongLengthLimit', {
        limit: stateManager.getSongLengthLimit(),
      });
    });

    socket.on('setSongLengthLimit', (data: { limit: number }) => {
      const uid = getUserIdFromSocket(socket);
      if (!uid) return;
      stateManager.setSongLengthLimit(data.limit, uid);
    });

    socket.on('disconnect', () => {
      const uid = getUserIdFromSocket(socket);
      if (!uid) return;
      stateManager.scheduleUserRemoval(uid);
    });

    socket.on('preload_failed', async (data: { songId: string, errorType: string, path?: string }) => {
      queueManager.handlePreloadFailure(data);
    });
  });
}