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
    skipVoteStatus,
  } = useSocket();

  const [isTunedIn, setIsTunedIn] = useState(false);
  const [radioVolume, setRadioVolume] = useState(50);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSongIdRef = useRef<string | null>(null);
  
  const [songs, setSongs] = useState<Song[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const { user } = useAuth();
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username || user?.username;
  
  useEffect(() => {
    if (!socket || !isConnected) return;
    const handleSearchResults = (data: { results: Song[] }) => setSongs(data.results);
    socket.on('searchResults', handleSearchResults);
    return () => { socket.off('searchResults', handleSearchResults); };
  }, [socket, isConnected]);

  const handleSearch = (input: string, source: string) => {
    if (!socket || !isConnected) return;
    const event = source.endsWith('Link') ? 'addLinkToQueue' : 'searchTracks';
    if (event === 'addLinkToQueue') {
      socket.emit(event, { link: input, uid });
    } else {
      socket.emit(event, { track_name: input, source, uid });
    }
  };

  const handleColorSelect = (color: string) => setMyColor(color);
  const handleVolumeChange = (newVolume: number) => setVolume(newVolume);
  const handleVoteSkip = () => { if (socket && isConnected) socket.emit('force_skip'); };
  const handleAddToQueue = (song: Song) => { if (socket && isConnected && uid) socket.emit('addSongToQueue', { song, uid }); };

  const calculateSeekTime = (): number => {
    if (!playbackStartTime) return 0;
    return Math.max(0, (Date.now() - playbackStartTime) / 1000);
  };

  useEffect(() => {
    const audio = radioAudioRef.current;
    
    if (!isTunedIn || !currentSong?.audioPath || !audio) {
      if (audio) audio.pause();
      return;
    }

    audio.volume = radioVolume / 100;

    const trackId = currentSong.track_id || currentSong.id;
    const isNewSong = lastSongIdRef.current !== trackId;

    if (isNewSong) {
      lastSongIdRef.current = trackId;
      audio.src = currentSong.audioPath;
      audio.load();
    }

    if (isPaused) {
      audio.pause();
    } else {
       const playAudio = async () => {
         try {
           if (audio.paused) {
             await audio.play();
           }
         } catch (e) {
           console.warn('Playback failed (autoplay blocked?):', e);
         }
       };
       playAudio();
    }
  }, [isTunedIn, currentSong?.audioPath, currentSong?.id, isPaused, radioVolume]);

  useEffect(() => {
    const audio = radioAudioRef.current;
    if (!isTunedIn || !audio || isPaused || !playbackStartTime) return;

    const checkSync = () => {
      if (audio.paused || audio.readyState < 1) return;
      
      const expectedTime = calculateSeekTime();
      const currentTime = audio.currentTime;
      const diff = Math.abs(currentTime - expectedTime);

      if (diff > 0.5) {
        if (audio.duration && expectedTime < audio.duration) {
           if (expectedTime > 0.1) {
             audio.currentTime = expectedTime;
           }
        }
      }
    };

    const interval = setInterval(checkSync, 1000);
    return () => clearInterval(interval);
  }, [isTunedIn, isPaused, playbackStartTime]);
  
  const handleLoadedMetadata = () => {
    if (radioAudioRef.current && playbackStartTime && isTunedIn) {
       const expectedTime = calculateSeekTime();
       if (expectedTime > 0 && Number.isFinite(expectedTime)) {
          radioAudioRef.current.currentTime = expectedTime;
       }
    }
  };

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
            skipVoteStatus={skipVoteStatus}
            socket={socket}
            isTunedIn={isTunedIn}
            onTuneInToggle={() => setIsTunedIn(!isTunedIn)}
            radioVolume={radioVolume}
            onRadioVolumeChange={setRadioVolume}
            isAdmin={isAdmin}
            onAdminClick={() => setAdminPanelOpen(true)}
          />
          <audio
            ref={radioAudioRef}
            onLoadedMetadata={handleLoadedMetadata}
            crossOrigin="anonymous"
            style={{ display: 'none' }}
          />
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
          <SearchBar onSearch={handleSearch} onSearchStateChange={setHasSearched} />
          <SongList
            songs={songs}
            onSelect={handleAddToQueue}
            hasSearched={hasSearched}
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