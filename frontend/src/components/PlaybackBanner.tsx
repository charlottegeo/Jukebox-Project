import React from 'react';
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
  onAdminClick
}) => {
  const { darkMode } = useTheme();
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
      <CardBody className="d-flex flex-wrap align-items-center justify-content-between py-3 px-4 playback-banner-body">
        <div className="d-flex align-items-center gap-3 flex-grow-1 min-width-0 playback-banner-song">
          {currentSong ? (
            <>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className="rounded flex-shrink-0"
                style={{ width: '56px', height: '56px', objectFit: 'cover' }}
              />
              <div className="min-width-0 d-flex flex-wrap align-items-center gap-4">
                <div>
                  <div className="playback-banner-label">
                    {isLoading ? 'Loading...' : `Now Playing ${isPaused ? '(Paused)' : ''}`}
                  </div>
                  <div className="playback-banner-title text-truncate" style={{ maxWidth: '280px' }}>{currentSong.track_name}</div>
                  <div className="playback-banner-artist text-truncate" style={{ maxWidth: '280px' }}>{currentSong.artist_name}</div>
                </div>
                <div className="playback-banner-meta">
                  <div>Added by {currentSong.submittedBy}</div>
                  <div>{currentSong.duration ? formatTime(currentSong.duration) : currentSong.track_length}</div>
                </div>
              </div>
            </>
          ) : (
            <span className="playback-banner-meta">No song playing</span>
          )}
        </div>

        <div className="d-flex flex-wrap align-items-center playback-banner-controls">
          <span className="playback-banner-meta playback-banner-max">
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
                <div className="d-flex align-items-center playback-banner-volume">
                  <label className="playback-banner-meta mr-2 mb-0">Volume:</label>
                  <Input
                    type="range"
                    min="0"
                    max="100"
                    value={radioVolume}
                    onChange={(e) => onRadioVolumeChange(Number(e.target.value))}
                    className="mr-2"
                    style={{ width: '100px' }}
                  />
                  <span className="playback-banner-meta">{radioVolume}%</span>
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
            className="playback-banner-btn playback-banner-skip"
          >
            <FontAwesomeIcon icon={skipVoteStatus?.hasVoted ? faUndo : faForward} className="mr-1" />
            {getSkipButtonText()}
          </Button>
          <span className="playback-banner-active d-flex align-items-center">
            <span
              className="mr-1 rounded-circle d-inline-block flex-shrink-0"
              style={{
                width: '10px',
                height: '10px',
                backgroundColor: activeUserCount > 0 ? '#28a745' : '#6c757d',
              }}
            />
            {activeUserCount} active
          </span>
          {isAdmin && onAdminClick && (
            <Button color="link" size="md" onClick={onAdminClick} className="playback-banner-admin-btn text-muted px-2" title="Admin Panel">
              <FontAwesomeIcon icon={faCog} style={{ fontSize: '1.35rem' }} />
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

export default PlaybackBanner; 