import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import MessagePopup, { MessageType } from '../components/MessagePopup';

interface Message {
  id: string;
  text: string;
  type: MessageType;
}

interface MessageContextType {
  showMessage: (text: string, type: MessageType) => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export const useMessage = () => {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
};

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const idCounter = useRef(0);

  const showMessage = useCallback((text: string, type: MessageType) => {
    const id = `msg-${idCounter.current++}`;
    setMessages(prev => [...prev, { id, text, type }]);
  }, []);

  const handleClose = (id: string) => {
    setMessages(prev => prev.filter(message => message.id !== id));
  };

  return (
    <MessageContext.Provider value={{ showMessage }}>
      {children}
      <div className="position-fixed top-0 end-0 m-3 d-flex flex-column gap-2" style={{ zIndex: 1100 }}>
        {messages.map((message) => (
          <MessagePopup
            key={message.id}
            message={message.text}
            type={message.type}
            onClose={() => handleClose(message.id)}
          />
        ))}
      </div>
    </MessageContext.Provider>
  );
}; 