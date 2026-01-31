import React, { useEffect, useState } from 'react';
import { Alert } from 'reactstrap';

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
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const alertColor = type === 'error' ? 'danger' : type;

  if (!isVisible) {
    return null;
  }

  return (
    <Alert
      color={alertColor}
      isOpen={isVisible}
      toggle={handleClose}
      className="position-fixed"
      style={{
        top: '20px',
        right: '20px',
        zIndex: 1100,
        minWidth: '300px',
        maxWidth: '500px',
        ...style
      }}
    >
      {message}
    </Alert>
  );
};

export default MessagePopup; 