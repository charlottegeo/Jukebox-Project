import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import styles from './DisplayPage.module.css';
import { Song } from '../types';

const DisplayPage: React.FC = () => {
  const {
    socket,
    currentSong,
    currentCatColor,
    isLoading,
    isPaused,
    volume,
    playbackStartTime,
  } = useSocket();

  const [progress, setProgress] = useState<number>(0);
  const animationIntervalRef = useRef<NodeJS.Timer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const catImageRef = useRef<HTMLImageElement | null>(null);
  const lastLoggedBpmRef = useRef<number | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const currentlyPlayingSrcRef = useRef<string | null>(null);
  const animationTrackIdRef = useRef<string | null>(null);
  const animationColorRef = useRef<string>(currentCatColor);

  const getBpmForTime = (time: number): number => {
    if (!currentSong) return 120;
    
    if (!currentSong.tempoMap || currentSong.tempoMap.length === 0) {
      return currentSong.bpm || 120;
      }

    let bpm = currentSong.bpm || 120;
    
    for (let i = currentSong.tempoMap.length - 1; i >= 0; i--) {
      const tempoEntry = currentSong.tempoMap[i];
      if (tempoEntry.time <= time) {
        bpm = tempoEntry.bpm;
        break;
      }
    }
    
    return bpm;
  };

  const animateFrames = (bpm: number, colorOverride?: string) => {
    if (!catImageRef.current) {
      console.warn('[Animation] catImageRef.current is null, cannot start animation');
      return;
    }

    let currentFrameIndex = 0;
    let currentIncrement = true;
    const currentColor = colorOverride ?? currentCatColor;
    
    const currentSrc = catImageRef.current.src;
      const currentFrame = currentSrc.split('/').pop()?.replace('.png', '');

      if (currentFrame === 'PusayLeft') {
        currentFrameIndex = 0;
        currentIncrement = true;
      } else if (currentFrame === 'PusayCenter') {
        currentFrameIndex = 1;
        const nextFrame = currentIncrement ? 'PusayRight' : 'PusayLeft';
        currentIncrement = nextFrame === 'PusayRight';
      } else if (currentFrame === 'PusayRight') {
        currentFrameIndex = 2;
        currentIncrement = false;
    }

    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current as unknown as number);
    }

    const frames = ['PusayLeft', 'PusayCenter', 'PusayRight'];
    let frameIndex = currentFrameIndex;
    let increment = currentIncrement;
    let lastFrameTime = Date.now();
    let beatPhase = 0.0;

    const updateFrame = () => {
      if (!catImageRef.current || !audioRef.current) {
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current as unknown as number);
          animationIntervalRef.current = null;
        }
        return;
      }

      const now = Date.now();
      const msPassed = now - lastFrameTime;
      lastFrameTime = now;

      let currentBpm = bpm;
      if (audioRef.current) {
        const currentTime = audioRef.current.currentTime || 0;
        currentBpm = getBpmForTime(currentTime);
      }

      if (process.env.NODE_ENV === 'development') {
        if (lastLoggedBpmRef.current === null || currentBpm !== lastLoggedBpmRef.current) {
          const currentTime = audioRef.current?.currentTime || 0;
          console.log(`[BPM] ${currentBpm} BPM at ${currentTime.toFixed(2)}s`);
          lastLoggedBpmRef.current = currentBpm;
        }
      }

      const secondsPassed = msPassed / 1000;
      const beatsPerSecond = currentBpm / 30;
      beatPhase += secondsPassed * beatsPerSecond;

      while (beatPhase >= 1.0) {
        beatPhase -= 1.0;

        if (catImageRef.current) {
        const frame = frames[frameIndex];
        const imgSrc = `/images/cats/${currentColor}/${frame}.png`;
          if (catImageRef.current.src !== imgSrc) {
            catImageRef.current.src = imgSrc;
          }
        } else {
          if (animationIntervalRef.current) {
            clearInterval(animationIntervalRef.current as unknown as number);
            animationIntervalRef.current = null;
          }
          return;
      }

      if (increment) {
        frameIndex++;
      } else {
        frameIndex--;
      }
      if (frameIndex === frames.length - 1) {
        increment = false;
      }
      if (frameIndex === 0) {
        increment = true;
      }
      }
    };

    animationIntervalRef.current = setInterval(updateFrame, 16);
  };

  const setCatImage = (frame: string, colorOverride?: string) => {
    if (catImageRef.current) {
      const color = colorOverride ?? currentCatColor;
      const imgSrc = `/images/cats/${color}/${frame}.png`;
      catImageRef.current.src = imgSrc;
    }
  };  

  const resetCatAnimation = () => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current as unknown as number);
      animationIntervalRef.current = null;
    }
    setCatImage('PusayCenter');
  };

  const calculateSeekTime = (): number => {
    if (!playbackStartTime) return 0;
    return Math.max(0, (Date.now() - playbackStartTime) / 1000);
  };

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume / 100;

    if (isPaused) {
      audioRef.current.pause();
    } else if (currentSong?.audioPath && audioRef.current.readyState >= 2) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
            console.error("Error playing audio:", e);
          }
        });
      }
    }
  }, [isPaused, volume, currentSong?.audioPath]);

  useEffect(() => {
    if (!currentSong?.audioPath || !audioRef.current) {
      if (audioRef.current) {
        audioRef.current.src = '';
        audioRef.current.load();
      }
      currentTrackIdRef.current = null;
      loadedTrackIdRef.current = null;
      currentlyPlayingSrcRef.current = null;
      setProgress(0);
      resetCatAnimation();
      lastLoggedBpmRef.current = null;
      return;
    }

    const trackId = currentSong.track_id || currentSong.id;
    const hasTrackChanged = currentTrackIdRef.current !== trackId;
    
    if (hasTrackChanged) {
      console.log('New song detected:', currentSong.track_name);
      currentTrackIdRef.current = trackId;
      loadedTrackIdRef.current = trackId;
      currentlyPlayingSrcRef.current = currentSong.audioPath;
      lastLoggedBpmRef.current = null;
      
      audioRef.current.src = currentSong.audioPath;
      
      const handleCanPlay = () => {
        if (!audioRef.current) return;
        
        if (playbackStartTime) {
          const seekTo = calculateSeekTime();
          if (audioRef.current.duration) {
            audioRef.current.currentTime = Math.min(seekTo, audioRef.current.duration);
          }
        } else {
          audioRef.current.currentTime = 0;
      }

        if (!isPaused) {
          audioRef.current.play().catch(e => {
            if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
              console.error('Error playing audio:', e);
            }
          });
        }
      };
      
      audioRef.current.addEventListener('canplay', handleCanPlay, { once: true });
      audioRef.current.load();
      setProgress(0);
    } else {
      if (playbackStartTime && !isPaused && audioRef.current.readyState >= 2) {
        const seekTo = calculateSeekTime();
        if (audioRef.current.duration) {
          const currentPos = audioRef.current.currentTime;
          const expectedPos = Math.min(seekTo, audioRef.current.duration);
          if (Math.abs(currentPos - expectedPos) > 1.0) {
            audioRef.current.currentTime = expectedPos;
          }
        }
      }
    }
  }, [currentSong?.track_id, currentSong?.id, currentSong?.audioPath, playbackStartTime, isPaused]);

  useEffect(() => {
    const trackId = currentSong?.track_id || currentSong?.id;
    const shouldAnimate = !isPaused && currentSong?.bpm && currentSong?.audioPath;
    const trackChanged = animationTrackIdRef.current !== trackId;
    const colorChanged = animationColorRef.current !== currentCatColor;
    const animationRunning = animationIntervalRef.current !== null;

    if (shouldAnimate && (trackChanged || !animationRunning || colorChanged)) {
      animationTrackIdRef.current = trackId || null;
      animationColorRef.current = currentCatColor;
      
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current as unknown as number);
        animationIntervalRef.current = null;
      }
      
      const initialBpm = currentSong.bpm!;
      console.log('[Animation] Starting animation for track:', trackId, 'BPM:', initialBpm, 'Color:', currentCatColor);
      
      setTimeout(() => {
        if (catImageRef.current) {
          animateFrames(initialBpm, currentCatColor);
        } else {
          console.warn('[Animation] catImageRef not set, retrying...');
          setTimeout(() => {
            if (catImageRef.current && animationTrackIdRef.current === trackId) {
              animateFrames(initialBpm, currentCatColor);
            }
          }, 100);
        }
      }, 0);
    } else if (!shouldAnimate) {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current as unknown as number);
        animationIntervalRef.current = null;
      }
      animationTrackIdRef.current = null;
      if (!currentSong?.audioPath) {
        resetCatAnimation();
      }
    }

    return () => {
    };
  }, [isPaused, currentSong?.track_id, currentSong?.id, currentSong?.bpm, currentSong?.audioPath, currentCatColor]);

  useEffect(() => {
    if (!animationIntervalRef.current) {
      setCatImage('PusayCenter', currentCatColor);
          }
  }, [currentCatColor]);
  
  useEffect(() => {
    if (!socket) return;
    socket.emit('register_display');
    const handleRedirect = () => window.location.href = '/';
    socket.on('redirect_to_home', handleRedirect);
    return () => { socket.off('redirect_to_home', handleRedirect); };
  }, [socket]);

  useEffect(() => {
    if (!socket || !currentSong?.audioPath) return;
    const refreshToken = () => socket.emit('refresh_stream_token');
    const tokenRefreshInterval = setInterval(refreshToken, 4 * 60 * 1000);
    refreshToken();
    return () => clearInterval(tokenRefreshInterval);
  }, [socket, currentSong?.audioPath]);

  const handleAudioEnded = () => {
    setProgress(0);
    resetCatAnimation();
    socket?.emit('song_finished');
  };

  const renderPlayer = () => {
    const isSongLoading = currentSong && (isLoading || !currentSong.audioPath);
    const showNoSong = !currentSong;

    if (showNoSong) {
      return (
        <div className={styles.songInfoContainer}>
          <div className={styles.songInfo}>
            <div className={styles.placeholder}>
              <img src="/images/placeholder.png" alt="No song playing" className={styles.placeholderImage} />
              <p>No song playing</p>
            </div>
          </div>
          <div className={styles.catContainer}>
            <img 
              id="pusay" 
              ref={catImageRef} 
              src={`/images/cats/${currentCatColor}/PusayCenter.png`} 
              alt="Pusay" 
            />
          </div>
        </div>
      );
    }

    return (
      <>
        {currentSong.audioPath && (
          <audio
            ref={audioRef}
            onEnded={handleAudioEnded}
            onTimeUpdate={() => {
              if (audioRef.current) {
                const duration = audioRef.current.duration || 0;
                const currentTime = audioRef.current.currentTime || 0;
                if (duration > 0) {
                  setProgress((currentTime / duration) * 100);
                }
              }
            }}
            crossOrigin="anonymous"
            style={{ display: 'none' }}
          >
            <source 
              src={currentSong.audioPath} 
              type={currentSong.audioPath.endsWith('.m4a') ? "audio/mp4" : "audio/mpeg"} 
            />
          </audio>
        )}
        <div className={styles.songInfoContainer}>
          <div className={styles.songInfo}>
            <div className={styles.coverImageContainer}>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className={styles.coverImage}
              />
              {isSongLoading && (
                <div className={styles.loadingOverlay}>
                  <div className={styles.loadingSpinner} />
                </div>
              )}
            </div>
            {isSongLoading ? (
              <div className={styles.trackName}>Loading song...</div>
            ) : (
              <>
            <div className={styles.trackName}>{currentSong.track_name}</div>
            <div className={styles.artistName}>{currentSong.artist_name}</div>
            <div className={styles.submittedBy}>Added by {currentSong.submittedBy}</div>
            <div className={styles.progressContainer}>
              <progress 
                    className={styles.progressBar}
                value={progress} 
                max="100"
              />
            </div>
              </>
            )}
          </div>
          <div className={styles.catContainer}>
            <img 
              id="pusay" 
              ref={catImageRef}
              src={`/images/cats/${currentCatColor}/PusayCenter.png`}
              alt="Dancing Cat" 
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={styles.container}>
      {renderPlayer()}
    </div>
  );
};

export default DisplayPage;