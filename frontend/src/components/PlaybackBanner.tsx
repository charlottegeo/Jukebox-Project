import {
  faClock,
  faCog,
  faForward,
  faRadio,
  faUndo,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Input } from 'reactstrap';
import { SkipVoteStatus, Song } from '../types';

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
  elapsedAtPause?: number | null;
  isNext?: boolean;
  nextSong?: {
    track_name: string;
    artist_name: string;
    cover_url: string;
    submittedBy?: string;
  } | null;
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
  playbackStartTime,
  elapsedAtPause,
  isNext,
  nextSong,
}) => {
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
        setIsTitleLong(titleMeasureRef.current.scrollWidth > containerWidth);
      }
      if (titleContainerRef.current && artistMeasureRef.current) {
        const containerWidth = titleContainerRef.current.clientWidth;
        setIsArtistLong(artistMeasureRef.current.scrollWidth > containerWidth);
      }
    };
    const t = window.setTimeout(checkOverflow, 0);
    return () => window.clearTimeout(t);
  }, [currentSong?.track_name, currentSong?.artist_name]);

  useEffect(() => {
    let interval: number | undefined;
    if (currentSong && !isPaused && playbackStartTime) {
      const update = () => {
        setElapsed(Math.max(0, (Date.now() - playbackStartTime!) / 1000));
      };
      update();
      interval = window.setInterval(update, 1000);
    } else if (isPaused && elapsedAtPause != null) {
      setElapsed(Math.max(0, elapsedAtPause));
    } else if (isPaused && playbackStartTime) {
      setElapsed(Math.max(0, (Date.now() - playbackStartTime) / 1000));
    } else {
      setElapsed(0);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [currentSong, isPaused, playbackStartTime, elapsedAtPause]);

  const getSkipButtonText = (): string => {
    // No status yet or effectively only one active participant → simple Skip
    if (!skipVoteStatus || skipVoteStatus.activeUserCount <= 1) {
      return 'Skip';
    }

    const baseLabel = skipVoteStatus.hasVoted ? 'Unvote' : 'Vote to skip';
    return `${baseLabel} (${skipVoteStatus.currentVotes}/${skipVoteStatus.requiredVotes})`;
  };

  const getSkipButtonTitle = (): string => {
    if (!skipVoteStatus?.canVote)
      return 'Add a song to the queue to vote to skip';
    if (activeUserCount > 1)
      return skipVoteStatus?.hasVoted
        ? 'Click to unvote'
        : 'Vote to skip (requires majority)';
    return 'Skip';
  };

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatLengthLimit = (minutes: number): string => {
    const total = Math.round(minutes * 60);
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
  };

  const nowPlayingLabel = isLoading
    ? 'Loading…'
    : isPaused
      ? 'Paused'
      : 'Now Playing';

  return (
    <div className="card mb-0 rounded-0 border-0 playback-banner-card">
      <div className="card-body d-flex align-items-center justify-content-between py-2 px-3 playback-banner-body">
        {/* ── Song info + Up Next ── */}
        <div className="d-flex align-items-center flex-grow-1 min-width-0 playback-banner-song">
          {currentSong ? (
            <>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className="rounded flex-shrink-0 mr-3"
                style={{ width: '56px', height: '56px', objectFit: 'cover' }}
              />

              <div
                className="playback-banner-song-info"
                ref={titleContainerRef}
              >
                {/* Hidden measurement spans */}
                <span
                  ref={titleMeasureRef}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    visibility: 'hidden',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                  }}
                >
                  {currentSong.track_name}
                </span>
                <span
                  ref={artistMeasureRef}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    visibility: 'hidden',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    fontSize: '0.9rem',
                  }}
                >
                  {currentSong.artist_name}
                </span>

                <div className="playback-banner-label">{nowPlayingLabel}</div>

                <div
                  className={`playback-banner-title ${isTitleLong ? 'marquee-container' : 'text-truncate'}`}
                >
                  <span
                    className={
                      isTitleLong ? 'marquee-content animate-marquee' : ''
                    }
                  >
                    {currentSong.track_name}
                    {isTitleLong && (
                      <span
                        style={{ display: 'inline-block', width: '2rem' }}
                      />
                    )}
                    {isTitleLong && currentSong.track_name}
                  </span>
                </div>

                <div
                  className={`playback-banner-artist ${isArtistLong ? 'marquee-container' : 'text-truncate'}`}
                >
                  <span
                    className={
                      isArtistLong ? 'marquee-content animate-marquee' : ''
                    }
                  >
                    {currentSong.artist_name}
                    {isArtistLong && (
                      <span
                        style={{ display: 'inline-block', width: '2rem' }}
                      />
                    )}
                    {isArtistLong && currentSong.artist_name}
                  </span>
                </div>

                <div className="playback-banner-submeta">
                  <span>Added by {currentSong.submittedBy}</span>
                  <span className="playback-banner-dot">·</span>
                  <span>
                    {formatTime(elapsed)} /{' '}
                    {currentSong.duration
                      ? formatTime(currentSong.duration)
                      : currentSong.track_length}
                  </span>
                </div>
              </div>

              {isNext && nextSong && (
                <div className="playback-banner-upnext">
                  <div className="playback-banner-upnext-label">
                    <span>Up Next</span>
                    {nextSong.submittedBy && (
                      <span className="playback-banner-upnext-from">
                        {' '}
                        from {nextSong.submittedBy}
                      </span>
                    )}
                  </div>
                  <div
                    className="playback-banner-upnext-body d-flex align-items-center"
                    style={{ gap: '0.5rem' }}
                  >
                    <img
                      src={nextSong.cover_url}
                      alt={nextSong.track_name}
                      className="rounded flex-shrink-0"
                      style={{
                        width: '32px',
                        height: '32px',
                        objectFit: 'cover',
                      }}
                    />
                    <div className="min-width-0">
                      <div className="playback-banner-upnext-title text-truncate">
                        {nextSong.track_name}
                      </div>
                      <div className="playback-banner-upnext-artist text-truncate text-muted">
                        {nextSong.artist_name}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <span className="playback-banner-meta">No song playing</span>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="d-flex flex-wrap align-items-center playback-banner-controls">
          <span className="playback-banner-meta playback-banner-max mr-3">
            <FontAwesomeIcon icon={faClock} className="mr-1" /> Max:{' '}
            {formatLengthLimit(songLengthLimit)}
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
                {isTunedIn ? 'Listening' : 'Tune In'}
              </Button>
              {isTunedIn && onRadioVolumeChange && (
                <div className="d-flex align-items-center playback-banner-volume mx-2">
                  <Input
                    type="range"
                    min="0"
                    max="100"
                    value={radioVolume}
                    onChange={(e: { target: { value: any } }) =>
                      onRadioVolumeChange(Number(e.target.value))
                    }
                    className="form-range playback-volume-slider"
                    style={
                      {
                        '--slider-fill': `${radioVolume}%`,
                      } as React.CSSProperties
                    }
                  />
                </div>
              )}
            </>
          )}

          {currentSong != null && (
            <div className="playback-banner-skip-wrapper ml-2">
              <Button
                color={skipVoteStatus?.hasVoted ? 'secondary' : 'primary'}
                outline={!!skipVoteStatus?.hasVoted}
                size="sm"
                onClick={onVoteSkip}
                disabled={!skipVoteStatus?.canVote}
                title={getSkipButtonTitle()}
                className="playback-banner-btn"
              >
                <FontAwesomeIcon
                  icon={skipVoteStatus?.hasVoted ? faUndo : faForward}
                  className="mr-1"
                />
                {getSkipButtonText()}
              </Button>

              {skipVoteStatus && activeUserCount > 1 && (
                <div className="skip-vote-dots">
                  {Array.from(
                    { length: skipVoteStatus.requiredVotes },
                    (_, i) => (
                      <span
                        key={i}
                        className={`vote-dot${i < skipVoteStatus.currentVotes ? ' vote-dot-filled' : ''}`}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          <span
            className="playback-banner-active d-flex align-items-center ml-3"
            title="Active Queues: people contributing music to the jukebox"
          >
            <span
              className="mr-1 rounded-circle d-inline-block flex-shrink-0"
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: activeUserCount > 0 ? '#28a745' : '#6c757d',
              }}
            />
            <span className="mr-1">Active queues:</span>
            {activeUserCount}
          </span>

          {isAdmin && onAdminClick && (
            <Button
              color="link"
              size="md"
              onClick={onAdminClick}
              className="playback-banner-admin-btn text-muted px-2 ml-1"
              title="Admin Panel"
            >
              <FontAwesomeIcon icon={faCog} style={{ fontSize: '1.2rem' }} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaybackBanner;
