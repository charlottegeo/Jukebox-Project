import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faForward, faClock, faUndo, faRadio, faCog } from '@fortawesome/free-solid-svg-icons';
import { Song, SkipVoteStatus } from '../types';
import { Button, Card, CardBody, Input } from 'reactstrap';

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
    <Card className="mb-0 rounded-0 border-0">
      <CardBody className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
        <div className="d-flex align-items-center flex-wrap gap-2 flex-grow-1 min-width-0">
          {currentSong ? (
            <>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className="rounded"
                style={{ width: '48px', height: '48px', objectFit: 'cover', flexShrink: 0 }}
              />
              <div className="min-width-0">
                <div className="small text-muted">
                  {isLoading ? 'Loading...' : `Now Playing ${isPaused ? '(Paused)' : ''}`}
                </div>
                <div className="font-weight-bold text-truncate">{currentSong.track_name}</div>
                <div className="small text-muted text-truncate">{currentSong.artist_name}</div>
                <div className="small text-muted">
                  Added by {currentSong.submittedBy} · {currentSong.duration ? formatTime(currentSong.duration) : currentSong.track_length}
                </div>
              </div>
            </>
          ) : (
            <span className="text-muted">No song playing</span>
          )}
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="text-muted small">
            <FontAwesomeIcon icon={faClock} className="mr-1" /> Max: {formatLengthLimit(songLengthLimit)}
          </span>
          {onTuneInToggle && (
            <>
              <Button
                color={isTunedIn ? 'success' : 'primary'}
                size="sm"
                onClick={onTuneInToggle}
              >
                <FontAwesomeIcon icon={faRadio} className="mr-1" />
                {isTunedIn ? 'Tuned In' : 'Tune In'}
              </Button>
              {isTunedIn && onRadioVolumeChange && (
                <div className="d-flex align-items-center">
                  <label className="small text-muted mr-2 mb-0">Volume:</label>
                  <Input
                    type="range"
                    min="0"
                    max="100"
                    value={radioVolume}
                    onChange={(e) => onRadioVolumeChange(Number(e.target.value))}
                    className="mr-2"
                    style={{ width: '100px' }}
                  />
                  <span className="small text-muted">{radioVolume}%</span>
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
            title={skipVoteStatus?.hasVoted ? 'Click to unvote' : 'Click to vote to skip'}
          >
            <FontAwesomeIcon icon={skipVoteStatus?.hasVoted ? faUndo : faForward} className="mr-1" />
            {getSkipButtonText()}
          </Button>
          <span className="text-muted small">
            <span className={`mr-1 rounded-circle d-inline-block ${activeUserCount > 0 ? 'bg-success' : 'bg-secondary'}`} style={{ width: '8px', height: '8px' }} />
            {activeUserCount} active
          </span>
          {isAdmin && onAdminClick && (
            <Button color="link" size="sm" onClick={onAdminClick} className="text-muted" title="Admin Panel">
              <FontAwesomeIcon icon={faCog} />
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

export default PlaybackBanner; 