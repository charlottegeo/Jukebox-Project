import React, { useEffect, useRef, useState } from 'react';

export type MessageType = 'success' | 'error' | 'warning' | 'info';

interface MessagePopupProps {
  message: string;
  type: MessageType;
  onClose: () => void;
  duration?: number;
}

const alertClassMap: Record<MessageType, string> = {
  success: 'alert-success',
  error: 'alert-danger',
  warning: 'alert-warning',
  info: 'alert-info',
};

const MessagePopup: React.FC<MessagePopupProps> = ({
  message,
  type,
  onClose,
  duration = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onCloseRef.current(), 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!isVisible) {
    return null;
  }

  const alertClass = alertClassMap[type];

  return (
    <div
      className={`alert alert-dismissible ${alertClass} shadow mb-0`}
      role="alert"
    >
      <button
        type="button"
        className="close"
        data-dismiss="alert"
        aria-label="Close"
        onClick={handleClose}
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <strong>
        {type === 'error' && 'Oh snap! '}
        {type === 'success' && 'Well done! '}
      </strong>
      {message}
    </div>
  );
};

export default MessagePopup;
