import fs from 'fs';
import path from 'path';
import * as stateManager from './stateManager.js';
import {
  downloadSpotifyAudio,
  downloadYouTubeAudio,
} from './trackService.js';
import { analyzeBPM } from './bpmAnalyzer.js';
import { Song } from './interfaces';
import { generateShortLivedToken } from './streamToken.js';

const getBackendUrl = () => process.env.BACKEND_URL || 'http://localhost:3001';

const buildAudioPath = (localPath: string): string => {
  const backendUrl = getBackendUrl();
  const filename = path.basename(localPath);
  const streamToken = generateShortLivedToken();
  return `${backendUrl}/api/stream/${filename}?streamToken=${streamToken}`;
};

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
  if (!stateManager.hasAnyQueueLeft()) {
    return;
  }

  const userOrder = stateManager.getUserOrder();
  if (userOrder.length === 0) {
    return;
  }

  let nextUser: string | null = null;
  let nextSong: Song | null = null;

  for (const uid of userOrder) {
    const userQueue = stateManager.getUserQueue(uid);
    if (userQueue && userQueue.length > 0) {
      nextUser = uid;
      nextSong = userQueue[0];
      break;
    }
  }

  if (!nextUser || !nextSong) {
    return;
  }

  const currentSong = stateManager.getCurrentSong();
  if (currentSong && (currentSong.id === nextSong.id || currentSong.track_id === nextSong.track_id)) {
    return;
  }

  if (nextSong.audioPath && nextSong.bpm !== undefined && nextSong.bpm !== null) {
    return;
  }

  try {
    let localPath: string;
    
    if (!nextSong.audioPath) {
      localPath = await (nextSong.source === 'spotify'
        ? downloadSpotifyAudio(nextSong.track_id, nextSong.youtubeUri)
        : downloadYouTubeAudio(nextSong.uri));
      nextSong.audioPath = buildAudioPath(localPath);
      stateManager.updateSongInQueue(nextUser, 0, nextSong);
    } else {
      const urlMatch = nextSong.audioPath.match(/\/stream\/([^?]+)/);
      if (urlMatch) {
        localPath = `/app/downloads/${urlMatch[1]}`;
      } else {
        const pathWithoutQuery = nextSong.audioPath.split('?')[0];
        const filename = path.basename(pathWithoutQuery);
        localPath = `/app/downloads/${filename}`;
      }
    }

    if ((nextSong.bpm === undefined || nextSong.bpm === null) && fs.existsSync(localPath)) {
      console.log(`Analyzing BPM for ${nextSong.track_name} (source: ${nextSong.source})...`);
      const { bpm, tempoMap } = await analyzeBPM(localPath);
      nextSong.bpm = bpm;
      nextSong.tempoMap = tempoMap;
      stateManager.updateSongInQueue(nextUser, 0, nextSong);
      console.log(`BPM analysis complete: ${bpm} BPM for ${nextSong.track_name} (${nextSong.source})`);
    }
  } catch (err) {
    console.error('Error preloading next song:', err);
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

  const nextUser = stateManager.getNextUser();
  if (!nextUser) {
    stateManager.emitQueueEmpty();
    stateManager.setPlaying(false);
    return;
  }

  const userQueue = stateManager.getUserQueue(nextUser);
  if (!userQueue || userQueue.length === 0) {
    playNextSong();
    return;
  }

  const nextSong = userQueue[0];
  if (!nextSong) {
    playNextSong();
    return;
  }

  stateManager.removeSongFromQueue(nextUser, 0, null); 

  stateManager.setCurrentSong(nextSong, nextUser);
  stateManager.setPlaying(true);

  preloadNextSong();

  try {
    let localPath: string;
    
    if (!nextSong.audioPath) {
      localPath = await (nextSong.source === 'spotify'
        ? downloadSpotifyAudio(nextSong.track_id, nextSong.youtubeUri)
        : downloadYouTubeAudio(nextSong.uri));
      nextSong.audioPath = buildAudioPath(localPath);
      stateManager.updateSongInQueue(nextUser, 0, nextSong);
    } else {
      const urlMatch = nextSong.audioPath.match(/\/stream\/([^?]+)/);
      if (urlMatch) {
        localPath = `/app/downloads/${urlMatch[1]}`;
      } else {
        const pathWithoutQuery = nextSong.audioPath.split('?')[0];
        const filename = path.basename(pathWithoutQuery);
        localPath = `/app/downloads/${filename}`;
      }
    }

    stateManager.setSongDownloaded();

    if ((nextSong.bpm === undefined || nextSong.bpm === null) && fs.existsSync(localPath)) {
      console.log(`Analyzing BPM for ${nextSong.track_name} (source: ${nextSong.source})...`);
      analyzeBPM(localPath).then(({ bpm, tempoMap }) => {
        nextSong.bpm = bpm;
        nextSong.tempoMap = tempoMap;
        stateManager.updateSongInQueue(nextUser, 0, nextSong);
        
        const currentSong = stateManager.getCurrentSong();
        if (currentSong && (currentSong.id === nextSong.id || currentSong.track_id === nextSong.track_id)) {
          stateManager.setCurrentSong(nextSong, nextUser);
          console.log(`BPM analysis complete: ${bpm} BPM for ${nextSong.track_name}`);
        }
      }).catch(err => {
        console.error(`BPM analysis failed for ${nextSong.track_name}:`, err);
      });
    }

  } catch (error) {
    console.error(`Error downloading ${nextSong.source} audio:`, error);
    stateManager.setCurrentSong(null);
    stateManager.setPlaying(false);
    playNextSong();
  }
};