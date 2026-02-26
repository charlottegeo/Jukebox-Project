import { useOidcAccessToken } from '@axa-fr/react-oidc';
import React, { useEffect, useRef, useState } from 'react';
import { Nav, NavItem, NavLink } from 'reactstrap';
import { AdminPanelProps } from '../App';
import UserInfo from '../UserInfo';
import AdminPanel from '../components/AdminPanel';
import PlaybackBanner from '../components/PlaybackBanner';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Song } from '../types';
import './SearchPage.scss';

const SearchPage: React.FC<AdminPanelProps> = ({
  adminPanelOpen,
  setAdminPanelOpen,
}) => {
  const {
    socket,
    isConnected,
    myQueue,
    currentSong,
    isLoading,
    isPaused,
    activeUserCount,
    activeUsers,
    isAdmin,
    songLengthLimit,
    volume,
    setMyColor,
    setVolume,
    playbackStartTime,
    elapsedAtPause,
    skipVoteStatus,
  } = useSocket();

  const [isTunedIn, setIsTunedIn] = useState(false);
  const [radioVolume, setRadioVolume] = useState(50);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSongIdRef = useRef<string | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'search'>('queue');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const { user } = useAuth();
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username || user?.username;
  const iAmNext =
    activeUsers && activeUsers.length > 0 && activeUsers[0].username === uid;
  const nextSong =
    activeUsers && activeUsers.length > 0
      ? (activeUsers[0].nextSong ?? null)
      : null;
  const nextSongOwner =
    activeUsers && activeUsers.length > 0 ? activeUsers[0].username : null;

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handleSearchResults = (data: { results: Song[] }) =>
      setSongs(data.results);
    socket.on('searchResults', handleSearchResults);
    return () => {
      socket.off('searchResults', handleSearchResults);
    };
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
  const handleVoteSkip = () => {
    if (!socket || !isConnected || !currentSong) return;
    if (!skipVoteStatus?.canVote) return;
    if (skipVoteStatus.hasVoted) {
      socket.emit('unvote_skip');
    } else {
      socket.emit('vote_skip', { songId: currentSong.id });
    }
  };
  const handleAddToQueue = (song: Song) => {
    if (socket && isConnected && uid)
      socket.emit('addSongToQueue', { song, uid });
  };

  const calculateSeekTime = (): number => {
    if (!playbackStartTime) return 0;
    return Math.max(0, (Date.now() - playbackStartTime) / 1000);
  };

  const SEEK_THRESHOLD_SEC = 2.5;

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
  }, [
    isTunedIn,
    currentSong?.audioPath,
    currentSong?.id,
    isPaused,
    radioVolume,
  ]);

  useEffect(() => {
    const audio = radioAudioRef.current;
    if (!isTunedIn || !audio || isPaused || !playbackStartTime) return;

    const checkSync = () => {
      if (audio.paused || audio.readyState < 1) return;

      const expectedTime = calculateSeekTime();
      const currentTime = audio.currentTime;
      const diff = Math.abs(currentTime - expectedTime);

      if (diff > SEEK_THRESHOLD_SEC) {
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
    if (!radioAudioRef.current || !playbackStartTime || !isTunedIn) return;
    const audio = radioAudioRef.current;
    const expectedTime = calculateSeekTime();
    if (!(expectedTime > 0 && Number.isFinite(expectedTime))) return;
    const currentTime = audio.currentTime ?? 0;
    if (
      Math.abs(currentTime - expectedTime) > SEEK_THRESHOLD_SEC &&
      audio.duration &&
      expectedTime < audio.duration
    ) {
      audio.currentTime = expectedTime;
    }
  };

  return (
    <div className="search-page">
      <div className="banner-full-width">
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
          playbackStartTime={playbackStartTime}
          elapsedAtPause={elapsedAtPause}
          isNext={nextSong !== null}
          nextSong={
            nextSong && nextSongOwner
              ? { ...nextSong, submittedBy: nextSongOwner }
              : nextSong
          }
        />
        <audio
          ref={radioAudioRef}
          onLoadedMetadata={handleLoadedMetadata}
          crossOrigin="anonymous"
          style={{ display: 'none' }}
        />
      </div>
      {isMobile ? (
        <div className="search-page-mobile">
          <Nav pills className="search-page-tabs">
            <NavItem>
              <NavLink
                active={activeTab === 'queue'}
                onClick={() => setActiveTab('queue')}
                className="search-page-tab"
              >
                Queue
              </NavLink>
            </NavItem>
            <NavItem>
              <NavLink
                active={activeTab === 'search'}
                onClick={() => setActiveTab('search')}
                className="search-page-tab"
              >
                Search
              </NavLink>
            </NavItem>
          </Nav>
          <div className="search-page-tab-content">
            {activeTab === 'queue' && (
              <div className="queue">
                <UserQueue
                  queue={myQueue}
                  onClearQueue={() => socket?.emit('clearUserQueue', uid)}
                  onRemoveSong={(index) =>
                    socket?.emit('removeSongFromQueue', { uid, index })
                  }
                  onReorderQueue={(newQueue) =>
                    socket?.emit('reorderQueue', { queue: newQueue, uid })
                  }
                  isNext={iAmNext}
                />
              </div>
            )}
            {activeTab === 'search' && (
              <div className="search">
                <div className="card h-100">
                  <div className="card-body">
                    <SearchBar
                      onSearch={handleSearch}
                      onSearchStateChange={setHasSearched}
                    />
                    <SongList
                      songs={songs}
                      onSelect={handleAddToQueue}
                      hasSearched={hasSearched}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="app-container">
          <div className="queue">
            <UserQueue
              queue={myQueue}
              onClearQueue={() => socket?.emit('clearUserQueue', uid)}
              onRemoveSong={(index) =>
                socket?.emit('removeSongFromQueue', { uid, index })
              }
              onReorderQueue={(newQueue) =>
                socket?.emit('reorderQueue', { queue: newQueue, uid })
              }
              wrapInCard={true}
              isNext={iAmNext}
            />
          </div>
          <div className="search">
            <div className="card h-100">
              <div className="card-body">
                <SearchBar
                  onSearch={handleSearch}
                  onSearchStateChange={setHasSearched}
                />
                <SongList
                  songs={songs}
                  onSelect={handleAddToQueue}
                  hasSearched={hasSearched}
                />
              </div>
            </div>
          </div>
        </div>
      )}
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
