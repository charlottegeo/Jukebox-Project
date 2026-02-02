import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faForward, faClock, faUndo, faRadio, faCog } from '@fortawesome/free-solid-svg-icons';
import { Song, SkipVoteStatus } from '../types';
import { Button, Card, CardBody, Input } from 'reactstrap';
import { useTheme } from '../contexts/ThemeContext';

interface PlaybackBannerProps {
  currentSong: Song | null;
  isPaused: boolean;
  activeUserCount: number;
  onVoteSkip: () => void;
  songLengthLimit: number;
  isLoading?: boolean;
  skipVoteStatus: SkipVoteStatus | null;
  socket: any;
  isTunedIn?: boolean;
  onTuneInToggle?: () => void;
  radioVolume?: number;
  onRadioVolumeChange?: (volume: number) => void;
  isAdmin?: boolean;
  onAdminClick?: () => void;
  playbackStartTime?: number | null;
}

const PlaybackBanner: React.FC<PlaybackBannerProps> = ({
  currentSong,
  isPaused,
  activeUserCount,
  onVoteSkip,
  songLengthLimit,
  isLoading = false,
  skipVoteStatus,
  socket,
  isTunedIn = false,
  onTuneInToggle,
  radioVolume = 50,
  onRadioVolumeChange,
  isAdmin = false,
  onAdminClick,
  playbackStartTime
}) => {
  const { darkMode } = useTheme();
  const [elapsed, setElapsed] = useState(0);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const artistMeasureRef = useRef<HTMLSpanElement>(null);
  const [isTitleLong, setIsTitleLong] = useState(false);
  const [isArtistLong, setIsArtistLong] = useState(false);

  useEffect(() => {
    if (!currentSong) {
      setIsTitleLong(false);
      setIsArtistLong(false);
      return;
    }
    const checkOverflow = () => {
      if (titleContainerRef.current && titleMeasureRef.current) {
        const containerWidth = titleContainerRef.current.clientWidth;
        const textWidth = titleMeasureRef.current.scrollWidth;
        setIsTitleLong(textWidth > containerWidth);
      }
      if (titleContainerRef.current && artistMeasureRef.current) {
        const containerWidth = titleContainerRef.current.clientWidth;
        const textWidth = artistMeasureRef.current.scrollWidth;
        setIsArtistLong(textWidth > containerWidth);
      }
    };
    const t = window.setTimeout(checkOverflow, 0);
    return () => window.clearTimeout(t);
  }, [currentSong?.track_name, currentSong?.artist_name]);

  useEffect(() => {
    let interval: number | undefined;
    if (currentSong && !isPaused && playbackStartTime) {
      const update = () => {
        const now = Date.now();
        const diff = Math.max(0, (now - playbackStartTime) / 1000);
        setElapsed(diff);
      };
      update();
      interval = window.setInterval(update, 1000);
    } else if (isPaused && playbackStartTime) {
       const now = Date.now();
       const diff = Math.max(0, (now - playbackStartTime) / 1000);
       setElapsed(diff);
    } else {
        setElapsed(0);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [currentSong, isPaused, playbackStartTime]);


  const handleVoteSkip = () => {
    if (!socket || !currentSong) return;
    
    if (skipVoteStatus?.hasVoted) {
      socket.emit('unvote_skip');
    } else {
      socket.emit('vote_skip');
    }
  };

  const getSkipButtonText = (): string => {
    if (!skipVoteStatus || activeUserCount === 1) {
      return 'Skip';
    }
    
    if (skipVoteStatus.hasVoted) {
      return `Unvote (${skipVoteStatus.currentVotes}/${skipVoteStatus.requiredVotes})`;
    }
    
    return `Vote to Skip (${skipVoteStatus.currentVotes}/${skipVoteStatus.requiredVotes})`;
  };
  
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatLengthLimit = (minutes: number): string => {
    const totalSeconds = Math.round(minutes * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={`mb-0 rounded-0 border-0 ${darkMode ? 'bg-dark text-white' : 'bg-light border-light'}`}>
      <CardBody className="d-flex flex-wrap align-items-center justify-content-between py-2 px-3 playback-banner-body">
        <div className="d-flex align-items-center flex-grow-1 min-width-0 playback-banner-song" style={{ gap: '1rem' }}>
          {currentSong ? (
            <>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className="rounded flex-shrink-0"
                style={{ width: '56px', height: '56px', objectFit: 'cover' }}
              />
              <div className="min-width-0 d-flex flex-wrap align-items-center gap-4">
                <div ref={titleContainerRef} style={{ maxWidth: '300px', overflow: 'hidden', position: 'relative', paddingRight: '1rem' }}>
                  <span
                    ref={titleMeasureRef}
                    className="playback-banner-title"
                    aria-hidden
                    style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}
                  >
                    {currentSong.track_name}
                  </span>
                  <span
                    ref={artistMeasureRef}
                    className="playback-banner-artist"
                    aria-hidden
                    style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}
                  >
                    {currentSong.artist_name}
                  </span>
                  <div className="playback-banner-label">
                    {isLoading ? 'Loading...' : `Now Playing ${isPaused ? '(Paused)' : ''}`}
                  </div>
                  <div className={`playback-banner-title ${isTitleLong ? 'marquee-container' : 'text-truncate'}`}>
                    <span className={isTitleLong ? 'marquee-content animate-marquee' : ''}>
                         {currentSong.track_name}
                         {isTitleLong && <span style={{display: 'inline-block', width: '2rem'}}></span>}
                         {isTitleLong && currentSong.track_name}
                    </span>
                  </div>
                  <div className={`playback-banner-artist ${isArtistLong ? 'marquee-container' : 'text-truncate'}`}>
                      <span className={isArtistLong ? 'marquee-content animate-marquee' : ''}>
                         {currentSong.artist_name}
                         {isArtistLong && <span style={{display: 'inline-block', width: '2rem'}}></span>}
                         {isArtistLong && currentSong.artist_name}
                    </span>
                  </div>
                </div>
                
                <div className="playback-banner-meta d-flex flex-column border-left pl-3" style={{ borderLeftColor: 'rgba(255,255,255,0.2)' }}>
                  <div className="small text-muted mb-1">Added by {currentSong.submittedBy}</div>
                  <div className="font-weight-bold">
                    {formatTime(elapsed)} / {currentSong.duration ? formatTime(currentSong.duration) : currentSong.track_length}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <span className="playback-banner-meta">No song playing</span>
          )}
        </div>

        <div className="d-flex flex-wrap align-items-center playback-banner-controls">
          <span className="playback-banner-meta playback-banner-max mr-3">
            <FontAwesomeIcon icon={faClock} className="mr-1" /> Max: {formatLengthLimit(songLengthLimit)}
          </span>
          {onTuneInToggle && (
            <>
              <Button
                color={isTunedIn ? 'success' : 'primary'}
                size="sm"
                onClick={onTuneInToggle}
                className="playback-banner-btn"
              >
                <FontAwesomeIcon icon={faRadio} className="mr-1" />
                {isTunedIn ? 'Tuned In' : 'Tune In'}
              </Button>
              {isTunedIn && onRadioVolumeChange && (
                <div className="d-flex align-items-center playback-banner-volume mx-2">
                  <Input
                    type="range"
                    min="0"
                    max="100"
                    value={radioVolume}
                    onChange={(e) => onRadioVolumeChange(Number(e.target.value))}
                    style={{ width: '80px', height: '4px' }}
                  />
                </div>
              )}
            </>
          )}
          <Button
            color={skipVoteStatus?.hasVoted ? 'secondary' : 'primary'}
            outline={!!skipVoteStatus?.hasVoted}
            size="sm"
            onClick={handleVoteSkip}
            disabled={!currentSong}
            title={activeUserCount > 1 ? (skipVoteStatus?.hasVoted ? 'Click to unvote' : 'Vote to skip (requires majority)') : 'Skip'}
            className="playback-banner-btn playback-banner-skip ml-2"
          >
            <FontAwesomeIcon icon={skipVoteStatus?.hasVoted ? faUndo : faForward} className="mr-1" />
            {getSkipButtonText()}
          </Button>
          <span className="playback-banner-active d-flex align-items-center ml-3">
            <span
              className="mr-1 rounded-circle d-inline-block flex-shrink-0"
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: activeUserCount > 0 ? '#28a745' : '#6c757d',
              }}
            />
            {activeUserCount}
          </span>
          {isAdmin && onAdminClick && (
            <Button color="link" size="md" onClick={onAdminClick} className="playback-banner-admin-btn text-muted px-2 ml-1" title="Admin Panel">
              <FontAwesomeIcon icon={faCog} style={{ fontSize: '1.2rem' }} />
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

export default PlaybackBanner;