import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faForward, faUsers, faClock } from '@fortawesome/free-solid-svg-icons';
import { Song } from '../types';

interface PlaybackBannerProps {
  currentSong: Song | null;
  isPaused: boolean;
  activeUserCount: number;
  onVoteSkip: () => void;
  songLengthLimit: number;
  isLoading?: boolean;
}

const PlaybackBanner: React.FC<PlaybackBannerProps> = ({
  currentSong,
  isPaused,
  activeUserCount,
  onVoteSkip,
  songLengthLimit,
  isLoading = false
}) => {
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

        <div className="controls">
          <div className="length-limit">
            <FontAwesomeIcon icon={faClock} /> Max song length: {formatLengthLimit(songLengthLimit)}
          </div>
          <button 
            className="skip-button"
            onClick={onVoteSkip}
            disabled={!currentSong}
          >
            <FontAwesomeIcon icon={faForward} />
            Vote to Skip
          </button>
          <div className="user-count">
            <div className="active-indicator">
              <div className={`dot ${activeUserCount > 0 ? 'active' : 'inactive'}`}></div>
            </div>
            <span>{activeUserCount} active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaybackBanner; 