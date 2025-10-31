import React, { useEffect, useState } from 'react';

export type MessageType = 'success' | 'error' | 'warning' | 'info';

interface MessagePopupProps {
  message: string;
  type: MessageType;
  onClose: () => void;
  duration?: number;
  style?: React.CSSProperties;
}

const MessagePopup: React.FC<MessagePopupProps> = ({
  message,
  type,
  onClose,
  duration = 5000,
  style
}) => {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          setIsVisible(false);
          setTimeout(onClose, 300);
          return 0;
        }
        return prev - (100 / (duration / 100));
      });
    }, 100);

    return () => clearInterval(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div className={`messagePopup ${isVisible ? 'messagePopup-enter' : 'messagePopup-exit'}`} style={style}>
      <div className="header">
        <h2 className="title">Message</h2>
        <span className="icon">
          {type === 'success' && '✓'}
          {type === 'error' && '✕'}
          {type === 'warning' && '⚠'}
          {type === 'info' && 'ℹ'}
        </span>
        <button className="closeButton" onClick={handleClose}>×</button>
      </div>
      <div className="content">{message}</div>
      <div className="actions">
        <button className="button secondary" onClick={handleClose}>Close</button>
      </div>
      <div className="progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
};

export default MessagePopup; 