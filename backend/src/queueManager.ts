import fs from 'fs';
import path from 'path';
import * as stateManager from './stateManager.js';
import {
  downloadSpotifyAudio,
  downloadYouTubeAudio,
} from './trackService.js';
import { Song } from './interfaces';

export const deleteAudioFile = (audioPath: string) => {
  if (!audioPath) return;
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

export const preloadNextSong = async () => {
  if (stateManager.isDownloadInProgress() || !stateManager.hasAnyQueueLeft()) {
    return;
  }

  const nextUser = stateManager.getNextUser();
  if (!nextUser) {
    return;
  }

  const userQueue = stateManager.getUserQueue(nextUser);
  if (!userQueue || userQueue.length === 0) {
    return;
  }

  const nextSong = userQueue[0];
  const currentSong = stateManager.getCurrentSong();

  if (currentSong && (currentSong.id === nextSong.id || currentSong.track_id === nextSong.track_id)) {
    return;
  }

  stateManager.setLockedState(nextUser, nextSong);

  try {
    let audioPath = nextSong.audioPath;
    if (!audioPath) {
      audioPath = await (nextSong.source === 'spotify'
        ? downloadSpotifyAudio(nextSong.track_id)
        : downloadYouTubeAudio(nextSong.uri));
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    nextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;
    console.log('Updating song with audioPath:', nextSong);
    stateManager.updateSongInQueue(nextUser, 0, nextSong);
    
    stateManager.setLockedState(nextUser, nextSong); 
    stateManager.setDownloadInProgress(false);
    
    console.log('Updated song with audioPath:', nextSong);
  } catch (err) {
    console.error('Error preloading next song:', err);
    stateManager.clearLockedState();
  }
};

export const playNextSong = async () => {
  if (stateManager.getIsPlaying()) return;

  const currentSong = stateManager.getCurrentSong();
  if (currentSong?.audioPath) {
    deleteAudioFile(currentSong.audioPath);
    stateManager.setCurrentSong(null);
  }

  if (!stateManager.hasAnyQueueLeft()) {
    stateManager.emitQueueEmpty();
    stateManager.setPlaying(false);
    return;
  }

  const nextUser = stateManager.getLockedUser() ?? stateManager.getNextUser();
  if (!nextUser) {
    stateManager.emitQueueEmpty();
    stateManager.setPlaying(false);
    return;
  }

  const userQueue = stateManager.getUserQueue(nextUser);
  const nextSong = userQueue?.[0];

  if (!nextSong) {
    stateManager.clearLockedState();
    playNextSong();
    return;
  }
  const socket = null; 
  stateManager.removeSongFromQueue(nextUser, 0, socket); 

  stateManager.setCurrentSong(nextSong, nextUser);
  stateManager.setPlaying(true);
  stateManager.clearLockedState();

  preloadNextSong();

  try {
    let audioPath = nextSong.audioPath;
    if (!audioPath) {
      audioPath = await (nextSong.source === 'spotify'
        ? downloadSpotifyAudio(nextSong.track_id)
        : downloadYouTubeAudio(nextSong.uri));
      
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      nextSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;
    }

    stateManager.setSongDownloaded();

  } catch (error) {
    console.error(`Error downloading ${nextSong.source} audio:`, error);
    stateManager.setCurrentSong(null);
    stateManager.setPlaying(false);
    playNextSong();
  }
};

export const handlePreloadFailure = async (data: { songId: string, errorType: string, path?: string }) => {
  console.log('Preload failed:', data);
  const lockedSong = stateManager.getLockedSong();
  const lockedUser = stateManager.getLockedUser();

  if (data.errorType === 'file_not_found' && lockedSong) {
    console.log('Attempting to re-download file for song:', lockedSong.track_name);
    
    try {
      stateManager.setDownloadInProgress(true);
      
      if (lockedSong && (lockedSong.track_id === data.songId || lockedSong.id === data.songId)) {
        let audioPath;
        if (lockedSong.source === 'spotify') {
          audioPath = await downloadSpotifyAudio(lockedSong.track_id);
        } else {
          audioPath = await downloadYouTubeAudio(lockedSong.uri);
        }
        
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
        lockedSong.audioPath = `${backendUrl}/downloads/${path.basename(audioPath)}`;
        
        console.log('Successfully re-downloaded file:', lockedSong.audioPath);
        
        stateManager.setLockedState(lockedUser, lockedSong);
        stateManager.setDownloadInProgress(false);
      }
    } catch (err) {
      console.error('Error re-downloading file:', err);
      const socket = null;
      if (lockedUser && stateManager.getUserQueue(lockedUser)?.length > 0) {
        stateManager.removeSongFromQueue(lockedUser, 0, socket);
      }
      stateManager.clearLockedState();
      preloadNextSong();
    }
  }
};