import { Server, Socket } from 'socket.io';
import { Song } from './interfaces';

export interface UserState {
  color: string;
  isAdmin: boolean;
  lastActive: Date;
}

export interface SongLengthLimits {
  maxLength: number;
  minLength: number;
}

let io: Server;

const userQueues: { [key: string]: Song[] } = {};
const userStates: { [key: string]: UserState } = {};
const disconnectTimers: { [key: string]: NodeJS.Timeout } = {};
let userOrder: string[] = [];
let isPlaying = false;
let isPaused = false;
let currentPlayingSong: Song | null = null;
let currentCatColor = 'White';
let playbackStartTime: number | null = null;
let songLengthLimits: SongLengthLimits = {
  maxLength: 600,
  minLength: 0,
};
let songLengthLimit = 10;
let displaySocketId: string | null = null;
let skipVotes: Set<string> = new Set();

export const initIo = (serverIo: Server) => {
  io = serverIo;
};

export const getUserQueue = (uid: string) => userQueues[uid];
export const getUserState = (uid: string) => userStates[uid];
export const hasUser = (uid: string) => !!userStates[uid];
export const getUserOrder = () => userOrder;
export const getIsPlaying = () => isPlaying;
export const getIsPaused = () => isPaused;
export const getCurrentSong = () => currentPlayingSong;
export const getCurrentCatColor = () => currentCatColor;
export const getSongLengthLimits = () => songLengthLimits;
export const getSongLengthLimit = () => songLengthLimit;
export const getDisconnectTimer = (uid: string) => disconnectTimers[uid];
export const getDisplaySocketId = () => displaySocketId;
export const setDisplaySocketId = (socketId: string | null) => {
  displaySocketId = socketId;
};
export const getPlaybackStartTime = () => playbackStartTime;
export const hasAnyQueueLeft = (): boolean => {
  return Object.values(userQueues).some((queue) => queue.length > 0);
};

export const setCurrentSong = (song: Song | null, uid?: string) => {
  const previousSong = currentPlayingSong;
  const isNewSong = !previousSong || !song || 
    (previousSong.id !== song.id && previousSong.track_id !== song.track_id);
  
  if (isNewSong) {
    skipVotes.clear();
    broadcastSkipVoteStatus();
    playbackStartTime = null;
  }
  
  currentPlayingSong = song;
  if (song && uid) {
    currentCatColor = userStates[uid]?.color || 'White';
    io.emit('updateUserCatColor', { uid, color: currentCatColor });
  } else if (!song) {
    currentCatColor = 'White';
    playbackStartTime = null;
    skipVotes.clear();
    io.emit('updateUserCatColor', { uid: null, color: 'White' });
    broadcastSkipVoteStatus();
  }
  const isLoading = song ? !song.audioPath : false;
  io.emit('updateCurrentSong', { currentSong: song, isLoading, playbackStartTime });
};

export const startPlaybackTimer = () => {
  playbackStartTime = Date.now();
  if (currentPlayingSong) {
    io.emit('updateCurrentSong', { currentSong: currentPlayingSong, isLoading: false, playbackStartTime });
  }
};

export const setSongDownloaded = () => {
  if (currentPlayingSong) {
    io.emit('updateCurrentSong', { currentSong: currentPlayingSong, isLoading: false, playbackStartTime });
    io.emit('song_download_complete');
  }
};

export const setPlaying = (status: boolean) => {
  isPlaying = status;
};

export const togglePause = () => {
  isPaused = !isPaused;
  io.emit('toggle_pause_play', { isPaused });
};

export const setSongLengthLimit = (limit: number, uid: string) => {
  if (!userStates[uid]?.isAdmin) {
    console.log('User is not admin, ignoring request');
    return;
  }
  const normalizedLimit = Math.round(limit * 2) / 2;
  songLengthLimit = Math.min(Math.max(normalizedLimit, 1), 10);
  console.log('Updated song length limit:', songLengthLimit);
  io.emit('updateSongLengthLimit', { limit: songLengthLimit });
};

export const setSongLengthLimits = (limits: SongLengthLimits, uid: string) => {
  if (!uid || !userStates[uid]?.isAdmin) return;
  songLengthLimits = {
    maxLength: Math.min(Math.max(limits.maxLength, 0), 600),
    minLength: Math.max(limits.minLength, 0),
  };
  io.emit('updateSongLengthLimits', songLengthLimits);
};

export const clearDisconnectTimer = (uid: string) => {
  if (disconnectTimers[uid]) {
    clearTimeout(disconnectTimers[uid]);
    delete disconnectTimers[uid];
  }
};

export const scheduleUserRemoval = (uid: string) => {
  disconnectTimers[uid] = setTimeout(() => {
    delete userStates[uid];
    updateActiveUsers();
  }, 5 * 60 * 1000);
};

export const isUserAdmin = (userInfo: any): boolean => {
  if (userInfo.preferred_username === 'ccyborgg') {
    return true;
  }
  const groups = userInfo.groups || [];
  return groups.some(
    (group: string) =>
      group.toLowerCase() === 'rtp' || group.toLowerCase() === 'eboard'
  );
};

export const addUser = (uid: string, userInfo: any, socket: Socket) => {
  clearDisconnectTimer(uid);

  if (!userStates[uid]) {
    userStates[uid] = {
      color: 'White',
      isAdmin: isUserAdmin(userInfo),
      lastActive: new Date(),
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
    socket.emit('updateUserCatColor', {
      uid: currentPlayingSong.submittedBy,
      color: currentCatColor,
    });
  }

  updateActiveUsers();
};

export const rotateUserOrder = () => {
  if (userOrder.length > 1) {
    const previousUser = userOrder.shift();
    if (previousUser) {
      userOrder.push(previousUser);
    }
  }
};

export const getNextUser = (): string | null => {
  while (userOrder.length > 0) {
    const uid = userOrder[0];
    if (userQueues[uid] && userQueues[uid].length > 0) {
      return uid;
    }
    userOrder.shift();
    delete userQueues[uid];
  }
  return null;
};

export const addSongToQueue = (uid: string, song: Song) => {
  if (!userQueues[uid]) {
    userQueues[uid] = [];
  }
  song.submittedBy = uid;
  userQueues[uid].push(song);
  
  if (!userOrder.includes(uid)) {
    userOrder.push(uid);
  }
  
  updateActiveUsers();
  io.emit('updateUserQueue', { queue: userQueues[uid], uid });
};

export const addSongsToQueue = (uid: string, songs: Song[]) => {
  if (!userQueues[uid]) {
    userQueues[uid] = [];
  }
  songs.forEach((song) => {
    song.submittedBy = uid;
  });
  userQueues[uid].push(...songs);
  
  if (!userOrder.includes(uid)) {
    userOrder.push(uid);
  }
  
  updateActiveUsers();
  io.emit('updateUserQueue', { queue: userQueues[uid], uid });
};

export const removeSongFromQueue = (uid: string, index: number, socket: Socket | null) => {
  if (!userQueues[uid]) return;

  userQueues[uid].splice(index, 1);
  if (userQueues[uid].length === 0) {
    delete userQueues[uid];
    userOrder = userOrder.filter((user) => user !== uid);
  }
  io.emit('updateUserQueue', { queue: userQueues[uid] || [], uid });
  updateActiveUsers();
};

export const reorderQueue = (uid: string, queue: Song[], socket: Socket) => {
  if (!userQueues[uid]) return;

  userQueues[uid] = queue;
  io.emit('updateUserQueue', { queue, uid });
};

export const updateSongInQueue = (uid: string, index: number, song: Song) => {
  if (userQueues[uid] && userQueues[uid][index]) {
    userQueues[uid][index] = song;
    io.emit('updateUserQueue', { queue: userQueues[uid], uid });
  }
};

export const clearUserQueue = (uid: string, socket: Socket | null) => {
  if (!userQueues[uid]) return;

  delete userQueues[uid];
  userOrder = userOrder.filter((user) => user !== uid);
  io.emit('updateUserQueue', { queue: [], uid });
  updateActiveUsers();

  if (!hasAnyQueueLeft() && !isPlaying) {
    io.emit('queue_empty');
  }
};

export const updateUserColor = (uid: string, color: string, socket: Socket) => {
  if (!userStates[uid]) {
    userStates[uid] = {
      color,
      isAdmin: false,
      lastActive: new Date(),
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
};

export const updateActiveUsers = () => {
  const activeUsers = Object.entries(userStates)
    .filter(([uid, _]) => userQueues[uid] && userQueues[uid].length > 0)
    .map(([username, state]) => ({
      username,
      queueCount: userQueues[username].length,
      profilePicture: `https://profiles.csh.rit.edu/image/${username}`,
      color: state.color || 'White',
      isAdmin: state.isAdmin || false,
    }));

  console.log('Active users from queues:', activeUsers);
  io.emit('updateActiveUsers', activeUsers);
  
  broadcastSkipVoteStatus();
};

export const addSkipVote = (uid: string) => {
  skipVotes.add(uid);
  broadcastSkipVoteStatus();
};

export const removeSkipVote = (uid: string) => {
  skipVotes.delete(uid);
  broadcastSkipVoteStatus();
};

/** Count of skip votes from users who currently have a non-empty queue (active contributors). */
const getEligibleSkipVoteCount = (): number => {
  return [...skipVotes].filter((voterUid) => userQueues[voterUid] && userQueues[voterUid].length > 0).length;
};

export const getSkipVoteStatus = (uid?: string) => {
  const activeUserCount = Object.keys(userQueues).filter(
    (id) => userQueues[id] && userQueues[id].length > 0
  ).length;

  const requiredVotes = activeUserCount === 1
    ? 1
    : Math.floor(activeUserCount / 2) + 1;

  const currentVotes = getEligibleSkipVoteCount();
  const hasVoted = uid ? skipVotes.has(uid) : false;
  const canVote = uid ? !!(userQueues[uid] && userQueues[uid].length > 0) : false;

  return {
    currentVotes,
    requiredVotes,
    hasVoted,
    activeUserCount,
    canVote,
  };
};

export const shouldTriggerSkip = (): boolean => {
  if (!currentPlayingSong) return false;
  const status = getSkipVoteStatus();
  return status.currentVotes >= status.requiredVotes;
};

const broadcastSkipVoteStatus = () => {
  const activeUserCount = Object.keys(userQueues).filter(
    (id) => userQueues[id] && userQueues[id].length > 0
  ).length;

  const requiredVotes = activeUserCount === 1
    ? 1
    : Math.floor(activeUserCount / 2) + 1;

  const currentVotes = getEligibleSkipVoteCount();

  const allUsers = Object.keys(userStates);
  allUsers.forEach((id) => {
    const hasVoted = skipVotes.has(id);
    const canVote = !!(userQueues[id] && userQueues[id].length > 0);
    io.to(id).emit('updateSkipVotes', {
      currentVotes,
      requiredVotes,
      activeUserCount,
      hasVoted,
      canVote,
    });
  });
};

export const resetServerState = () => {
  Object.keys(userStates).forEach((uid) => {
    if (userStates[uid]) {
      userStates[uid].color = 'White';
    }
  });
  currentCatColor = 'White';
  currentPlayingSong = null;
  playbackStartTime = null;
  
  if (io) {
    io.emit('server_startup', { timestamp: Date.now() });
    io.emit('updateUserCatColor', { uid: null, color: 'White' });
    io.emit('updateCurrentSong', { currentSong: null, playbackStartTime: null });
  }
};

export const emitQueueEmpty = () => {
  io.emit('queue_empty');
};

export const emitToSocket = (socket: Socket, event: string, data: any) => {
  socket.emit(event, data);
};

export const broadcast = (event: string, data: any) => {
  io.emit(event, data);
};