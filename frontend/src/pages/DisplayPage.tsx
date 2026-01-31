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
  const lastLoggedBpmRef = useRef<number | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const currentlyPlayingSrcRef = useRef<string | null>(null);

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
    let currentFrameIndex = 0;
    let currentIncrement = true;
    const currentColor = colorOverride ?? currentCatColor;
    const imgElement = document.getElementById('pusay') as HTMLImageElement;
    if (imgElement) {
      const currentSrc = imgElement.src;
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
      const imgElement = document.getElementById('pusay') as HTMLImageElement;
      if (!imgElement || !audioRef.current) {
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

        const currentImgElement = document.getElementById('pusay') as HTMLImageElement;
        if (currentImgElement) {
          const frame = frames[frameIndex];
          const imgSrc = `/images/cats/${currentColor}/${frame}.png`;
          currentImgElement.src = imgSrc;
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
    const imgElement = document.getElementById('pusay') as HTMLImageElement;
    if (imgElement) {
      const color = colorOverride ?? currentCatColor;
      const imgSrc = `/images/cats/${color}/${frame}.png`;
      imgElement.src = imgSrc;
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
    if (!isPaused && currentSong?.bpm && currentSong.audioPath) {
      const initialBpm = currentSong.bpm;
      animateFrames(initialBpm, currentCatColor);
    } else {
      resetCatAnimation();
    }

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current as unknown as number);
        animationIntervalRef.current = null;
      }
    };
  }, [isPaused, currentSong?.bpm, currentSong?.audioPath, currentCatColor]);

  useEffect(() => {
    if (!animationIntervalRef.current) {
      setCatImage('PusayCenter', currentCatColor);
    }
  }, [currentCatColor]);
  
  useEffect(() => {
    if (!socket) return;
    
    socket.emit('register_display');
    
    const handleRedirect = () => {
      console.log('Another display is already open, redirecting to home...');
      window.location.href = '/';
    };
    
    socket.on('redirect_to_home', handleRedirect);
    
    return () => {
      socket.off('redirect_to_home', handleRedirect);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !currentSong?.audioPath) return;
    
    const refreshToken = () => {
      socket.emit('refresh_stream_token');
    };
    
    const tokenRefreshInterval = setInterval(refreshToken, 4 * 60 * 1000);
    
    refreshToken();
    
    return () => {
      clearInterval(tokenRefreshInterval);
    };
  }, [socket, currentSong?.audioPath]);

  const handleAudioEnded = () => {
    console.log('Audio finished playing');
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
            <img id="pusay" src={`/images/cats/${currentCatColor}/PusayCenter.png`} alt="Pusay" />
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
            <source src={currentSong.audioPath} type="audio/mpeg" />
            Your browser does not support the audio element.
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
            <img id="pusay" src={`/images/cats/${currentCatColor}/PusayCenter.png`} alt="Dancing Cat" />
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