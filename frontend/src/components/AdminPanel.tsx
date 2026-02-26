import {
  faClock,
  faForward,
  faMinus,
  faPause,
  faPlay,
  faPlus,
  faVolumeDown,
  faVolumeMute,
  faVolumeUp,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import {
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
} from 'reactstrap';
import { ActiveUser } from '../types';

interface AdminPanelProps {
  onClose: () => void;
  socket: any;
  volume: number;
  onVolumeChange: (volume: number) => void;
  currentUser?: string;
  isPaused?: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = ({
  onClose,
  socket,
  volume,
  onVolumeChange,
  currentUser,
  isPaused: serverIsPaused,
}) => {
  const isPlaying = !(serverIsPaused ?? false);
  const [previousVolume, setPreviousVolume] = useState<number>(volume);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [songLengthLimit, setSongLengthLimit] = useState<number>(10);

  useEffect(() => {
    if (!socket) return;

    const handleActiveUsers = (users: ActiveUser[]) => {
      console.log('Received active users update:', users);
      setActiveUsers(users);
    };

    const handleSongLengthLimit = (data: { limit: number }) => {
      console.log('Received song length limit update:', data);
      setSongLengthLimit(data.limit);
    };

    socket.on('updateActiveUsers', handleActiveUsers);
    socket.on('updateSongLengthLimit', handleSongLengthLimit);

    socket.emit('getActiveUsers');
    socket.emit('getSongLengthLimit');

    return () => {
      socket.off('updateActiveUsers', handleActiveUsers);
      socket.off('updateSongLengthLimit', handleSongLengthLimit);
    };
  }, [socket]);

  const handleForceSkip = () => {
    socket?.emit('force_skip');
  };

  const handlePausePlay = () => {
    socket?.emit('pause_play', { isPaused: isPlaying });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseInt(e.target.value, 10));
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

  const STEP_MINUTES = 0.5; // 30 seconds
  const MIN_MINUTES = 1;
  const MAX_MINUTES = 10;

  const handleMaxLengthStep = (delta: number) => {
    const newLimit = Math.min(
      MAX_MINUTES,
      Math.max(MIN_MINUTES, songLengthLimit + delta)
    );
    const rounded = Math.round(newLimit / STEP_MINUTES) * STEP_MINUTES;
    const clamped = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, rounded));
    setSongLengthLimit(clamped);
    socket?.emit('setSongLengthLimit', { limit: clamped });
  };

  const formatTime = (minutes: number): string => {
    const totalSeconds = Math.round(minutes * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal isOpen toggle={onClose} size="lg" className="admin-panel-modal">
      <ModalHeader
        tag="div"
        className="d-flex align-items-center justify-content-between w-100"
      >
        <span>Admin Controls</span>
        <button
          type="button"
          className="close admin-panel-close"
          data-dismiss="modal"
          aria-label="Close"
          onClick={onClose}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </ModalHeader>
      <ModalBody>
        <div className="mb-3 d-flex gap-3 flex-wrap admin-panel-actions">
          <Button color="primary" onClick={handlePausePlay}>
            <FontAwesomeIcon
              icon={isPlaying ? faPause : faPlay}
              className="mr-1"
            />
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button
            color="danger"
            onClick={handleForceSkip}
          >
            <FontAwesomeIcon icon={faForward} className="mr-1" />
            Force Skip
          </Button>
        </div>

        <div className="admin-controls-row">
          <FormGroup className="admin-volume-group">
            <Label className="d-flex align-items-center mb-2">
              <FontAwesomeIcon
                icon={getVolumeIcon()}
                className="mr-2"
                onClick={handleVolumeIconClick}
                style={{ cursor: 'pointer' }}
              />
              Volume: {volume}%
            </Label>
            <Input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="form-range admin-volume-slider"
              style={{ '--slider-fill': `${volume}%` } as React.CSSProperties}
            />
          </FormGroup>

          <FormGroup className="admin-max-length-group">
            <Label>
              <FontAwesomeIcon icon={faClock} className="mr-2" />
              Max song length
            </Label>
            <div className="admin-max-length-controls">
              <Button
                size="sm"
                onClick={() => handleMaxLengthStep(-STEP_MINUTES)}
                disabled={songLengthLimit <= MIN_MINUTES}
                className="btn btn-primary"
              >
                <FontAwesomeIcon icon={faMinus} />
              </Button>
              <span className="admin-max-length-display">
                {formatTime(songLengthLimit)}
              </span>
              <Button
                size="sm"
                onClick={() => handleMaxLengthStep(STEP_MINUTES)}
                disabled={songLengthLimit >= MAX_MINUTES}
                className="btn btn-primary"
              >
                <FontAwesomeIcon icon={faPlus} />
              </Button>
            </div>
          </FormGroup>
        </div>

        {activeUsers.length > 0 && (
          <>
            <h5 className="mb-2 mt-3">Active Users</h5>
            <div className="d-flex flex-wrap gap-2">
              {activeUsers.map((user) => (
                <div
                  key={user.username}
                  className="card mb-0"
                  style={{ minWidth: '200px' }}
                >
                  <div className="card-body d-flex align-items-center py-2 px-3">
                    <img
                      src={user.profilePicture}
                      alt={user.username}
                      className="rounded mr-2 flex-shrink-0"
                      style={{
                        width: '32px',
                        height: '32px',
                        objectFit: 'cover',
                      }}
                    />
                    <div className="min-width-0 flex-grow-1">
                      <div className="font-weight-bold text-truncate">
                        {user.username}
                      </div>
                      <div className="small text-muted">
                        {user.queueCount}{' '}
                        {user.queueCount === 1 ? 'song' : 'songs'} in queue
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </ModalBody>
    </Modal>
  );
};

export default AdminPanel;
