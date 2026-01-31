import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Song } from '../types';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import UserInfo from '../UserInfo';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';
import AdminPanel from '../components/AdminPanel';
import PlaybackBanner from '../components/PlaybackBanner';
import './SearchPage.scss';
import { AdminPanelProps } from '../App';

const SearchPage: React.FC<AdminPanelProps> = ({ adminPanelOpen, setAdminPanelOpen }) => {

  const {
    socket,
    isConnected,
    myQueue,
    currentSong,
    isLoading,
    isPaused,
    activeUserCount,
    isAdmin,
    songLengthLimit,
    volume,
    setMyColor,
    setVolume,
    playbackStartTime,
  } = useSocket();

  const [isTunedIn, setIsTunedIn] = useState(false);
  const [radioVolume, setRadioVolume] = useState(50);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSongIdRef = useRef<string | null>(null);
  const loadedRadioTrackIdRef = useRef<string | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);

  const { user } = useAuth();
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username || user?.username;
  
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleSearchResults = (data: { results: Song[] }) => setSongs(data.results);
    socket.on('searchResults', handleSearchResults);

    return () => {
      socket.off('searchResults', handleSearchResults);
    };
  }, [socket, isConnected]);

  const handleSearch = (input: string, source: string) => {
    if (!socket || !isConnected) {
      console.log('Socket not connected, cannot search');
      return;
    }

    const event = source.endsWith('Link') ? 'addLinkToQueue' : 'searchTracks';
    
    if (event === 'addLinkToQueue') {
      socket.emit(event, { link: input, uid });
    } else {
      socket.emit(event, { track_name: input, source, uid });
    }
  };

  const handleColorSelect = (color: string) => {
    setMyColor(color);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleVoteSkip = () => {
    if (socket && isConnected) {
      socket.emit('force_skip');
    }
  };

  const handleAddToQueue = (song: Song) => {
    if (socket && isConnected) {
      if (!uid) {
        console.log('User ID not found, cannot add song to queue');
        return;
      }
      socket.emit('addSongToQueue', { song, uid: uid });
    }
  };

  const calculateSeekTime = (): number => {
    if (!playbackStartTime) return 0;
    return Math.max(0, (Date.now() - playbackStartTime) / 1000);
  };

  useEffect(() => {
    if (!isTunedIn || !currentSong?.audioPath) {
      if (radioAudioRef.current) {
        radioAudioRef.current.pause();
        radioAudioRef.current.src = '';
      }
      lastSongIdRef.current = null;
      loadedRadioTrackIdRef.current = null;
      return;
    }

    const audio = radioAudioRef.current;
    if (!audio) return;

    const trackId = currentSong.track_id || currentSong.id;
    const hasSongChanged = lastSongIdRef.current !== trackId;
    const hasLoadedTrackChanged = loadedRadioTrackIdRef.current !== trackId;

    if (hasSongChanged && hasLoadedTrackChanged) {
      lastSongIdRef.current = trackId;
      loadedRadioTrackIdRef.current = trackId;
      audio.src = currentSong.audioPath;
      audio.volume = radioVolume / 100;
      
      const handleCanPlay = () => {
        if (playbackStartTime && !isPaused && audio.readyState >= 2) {
          const seekTo = calculateSeekTime();
          if (audio.duration) {
            audio.currentTime = Math.min(seekTo, audio.duration);
          }
        }
        if (!isPaused) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              if (e.name === 'AbortError') {
                return;
              }
              if (e.name === 'NotAllowedError') {
                console.warn('Radio playback blocked by browser. User interaction required.');
              } else {
                console.error('Error playing radio audio:', e);
              }
            });
          }
        }
      };
      
      audio.addEventListener('canplay', handleCanPlay, { once: true });
      audio.load();
    } else if (!hasSongChanged) {
      if (audio.src !== currentSong.audioPath) {
        const wasPlaying = !audio.paused;
        const currentTime = audio.currentTime;
        
        audio.src = currentSong.audioPath;
        audio.load();
        
        if (wasPlaying) {
          audio.addEventListener('loadedmetadata', () => {
            if (audio.readyState >= 2 && audio.duration) {
              audio.currentTime = currentTime;
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.catch(e => {
                  if (e.name !== 'AbortError') {
                    console.error('Error resuming playback after token refresh:', e);
                  }
                });
              }
            }
          }, { once: true });
        }
      }
      
      if (playbackStartTime && !isPaused && audio.readyState >= 2) {
        const seekTo = calculateSeekTime();
        if (audio.duration) {
          const currentPos = audio.currentTime;
          const expectedPos = Math.min(seekTo, audio.duration);
          if (Math.abs(currentPos - expectedPos) > 0.5) {
            audio.currentTime = expectedPos;
          }
        }
      }
    }

    if (isPaused) {
      audio.pause();
    } else if (audio.readyState >= 2) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name === 'AbortError') {
            return;
          }
          if (e.name === 'NotAllowedError') {
            console.warn('Radio playback blocked by browser. User interaction required.');
          } else {
            console.error('Error playing radio audio:', e);
          }
        });
      }
    }
  }, [isTunedIn, currentSong?.track_id, currentSong?.id, currentSong?.audioPath, isPaused, playbackStartTime, radioVolume]);

  useEffect(() => {
    if (!isTunedIn || !radioAudioRef.current || !playbackStartTime || isPaused || !currentSong?.audioPath) {
      return;
    }

    const syncInterval = setInterval(() => {
      const audio = radioAudioRef.current;
      if (audio && playbackStartTime && !isPaused && audio.readyState >= 2) {
        const seekTo = calculateSeekTime();
        if (audio.duration) {
          const currentPos = audio.currentTime;
          const expectedPos = Math.min(seekTo, audio.duration);
          if (Math.abs(currentPos - expectedPos) > 2.0) {
            audio.currentTime = expectedPos;
          }
        }
      }
    }, 2000);

    return () => {
      clearInterval(syncInterval);
    };
  }, [isTunedIn, playbackStartTime, isPaused, currentSong?.audioPath]);
  
  useEffect(() => {
    if (radioAudioRef.current) {
      radioAudioRef.current.volume = radioVolume / 100;
    }
  }, [radioVolume]);

  return (
    <div className="search-page">
      <div className="app-container">
        <div className="banner">
          <PlaybackBanner
            currentSong={currentSong}
            isPaused={isPaused}
            activeUserCount={activeUserCount}
            onVoteSkip={handleVoteSkip}
            songLengthLimit={songLengthLimit}
            isLoading={isLoading}
          />
          <div className="radio-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px', marginTop: '10px' }}>
            <button
              onClick={() => setIsTunedIn(!isTunedIn)}
              style={{
                padding: '8px 16px',
                background: isTunedIn ? '#4CAF50' : '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isTunedIn ? '🔊 Tuned In' : '📻 Tune In'}
            </button>
            {isTunedIn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '14px' }}>Volume:</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={radioVolume}
                  onChange={(e) => setRadioVolume(Number(e.target.value))}
                  style={{ width: '100px' }}
                />
                <span style={{ fontSize: '14px', minWidth: '35px' }}>{radioVolume}%</span>
              </div>
            )}
          </div>
          {isTunedIn && (
            <audio
              ref={radioAudioRef}
              crossOrigin="anonymous"
              style={{ display: 'none' }}
            />
          )}
        </div>
        <div className="queue">
          <UserQueue
            queue={myQueue}
            onClearQueue={() => socket?.emit('clearUserQueue', uid)}
            onRemoveSong={(index) => socket?.emit('removeSongFromQueue', { uid, index })}
            onReorderQueue={(newQueue) => socket?.emit('reorderQueue', { queue: newQueue, uid })}
          />
        </div>
        <div className="search">
          <SearchBar onSearch={handleSearch} />
          <SongList
            songs={songs}
            onSelect={handleAddToQueue}
          />
        </div>
      </div>
      {isAdmin && adminPanelOpen && (
        <AdminPanel
          onClose={() => setAdminPanelOpen(false)}
          socket={socket}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          currentUser={uid}
          isPaused={isPaused}
        />
      )}
    </div>
  );
};

export default SearchPage;