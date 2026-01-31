import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faForward, faUsers, faClock, faUndo, faRadio, faCog } from '@fortawesome/free-solid-svg-icons';
import { Song, SkipVoteStatus } from '../types';
import { Button, Input } from 'reactstrap';

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
    <div className="playback-banner">
      <div className="banner-content">
        <div className="song-info">
          {currentSong ? (
            <>
              <div className="current-song">
                <img 
                  src={currentSong.cover_url} 
                  alt={currentSong.track_name}
                  className={`cover-art ${isLoading ? 'loading' : ''}`}
                />
                <div className="song-details">
                  <span className="now-playing">
                    {isLoading ? "Loading..." : `Now Playing ${isPaused ? "(Paused)" : ""}`}
                  </span>
                  <span className="track-name">{currentSong.track_name}</span>
                  <span className="artist-name">{currentSong.artist_name}</span>
                  <span className="submitted-by">Added by {currentSong.submittedBy}</span>
                  <div className="metadata">
                    <span>
                      <FontAwesomeIcon icon={faClock} /> {currentSong.duration ? formatTime(currentSong.duration) : currentSong.track_length}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="no-song">
              <span>No song playing</span>
            </div>
          )}
        </div>

        <div className="controls d-flex flex-wrap align-items-center gap-2">
          <div className="length-limit text-muted small">
            <FontAwesomeIcon icon={faClock} className="mr-1" /> Max: {formatLengthLimit(songLengthLimit)}
          </div>
          {onTuneInToggle && (
            <>
              <Button 
                color={isTunedIn ? 'success' : 'primary'}
                size="sm"
                onClick={onTuneInToggle}
                className="d-flex align-items-center"
              >
                <FontAwesomeIcon icon={faRadio} className="mr-2" />
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
                    style={{ width: '100px' }}
                    className="mr-2"
                  />
                  <span className="small text-muted" style={{ minWidth: '35px' }}>{radioVolume}%</span>
                </div>
              )}
            </>
          )}
          <Button 
            className={`${skipVoteStatus?.hasVoted ? 'btn-outline-secondary' : 'btn-primary'}`}
            size="sm"
            onClick={handleVoteSkip}
            disabled={!currentSong}
            title={skipVoteStatus?.hasVoted ? 'Click to unvote' : 'Click to vote to skip'}
          >
            <FontAwesomeIcon icon={skipVoteStatus?.hasVoted ? faUndo : faForward} className="mr-2" />
            {getSkipButtonText()}
          </Button>
          <div className="user-count d-flex align-items-center text-muted small">
            <div className="active-indicator mr-2">
              <div className={`dot ${activeUserCount > 0 ? 'active' : 'inactive'}`}></div>
            </div>
            <span>{activeUserCount} active</span>
          </div>
          {isAdmin && onAdminClick && (
            <Button
              color="link"
              size="sm"
              onClick={onAdminClick}
              className="text-muted"
              title="Admin Panel"
            >
              <FontAwesomeIcon icon={faCog} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaybackBanner; 