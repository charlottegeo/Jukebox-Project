import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faForward, faPlay, faPause, faSync, faTimes, faVolumeUp, faVolumeDown, faVolumeMute } from '@fortawesome/free-solid-svg-icons';

interface AdminPanelProps {
  onClose: () => void;
  socket: any;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, socket, volume, onVolumeChange }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [previousVolume, setPreviousVolume] = useState<number>(volume);

  const handleForceSkip = () => {
    socket?.emit('force_skip');
  };

  const handlePausePlay = () => {
    setIsPlaying(!isPlaying);
    socket?.emit('pause_play', { isPaused: isPlaying });
  };

  const handleRefreshDisplay = () => {
    socket?.emit('refresh_display');
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    onVolumeChange(newVolume);
  };

  const handleVolumeIconClick = () => {
    if (volume > 0) {
      setPreviousVolume(volume);
      onVolumeChange(0);
    } else {
      onVolumeChange(previousVolume);
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return faVolumeMute;
    if (volume < 50) return faVolumeDown;
    return faVolumeUp;
  };

  return (
    <div className="admin-panel-overlay">
      <div className="admin-panel">
        <button onClick={onClose} className="close-button">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <h2>Admin Controls</h2>
        
        <div className="admin-controls-group">
          <div className="playback-controls">
            <button onClick={handlePausePlay} className="control-button">
              <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
            </button>
            <button onClick={handleForceSkip} className="control-button">
              <FontAwesomeIcon icon={faForward} />
            </button>
          </div>

          <div className="volume-control">
            <div className="volume-icon" onClick={handleVolumeIconClick}>
              <FontAwesomeIcon icon={getVolumeIcon()} />
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
            <span className="volume-value">{volume}%</span>
          </div>

          <button onClick={handleRefreshDisplay} className="refresh-button">
            <FontAwesomeIcon icon={faSync} /> Refresh Display
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
