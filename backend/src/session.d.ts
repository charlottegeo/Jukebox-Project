import 'express-session';
import { Session } from 'express-session';
import { Socket } from 'socket.io';

declare module 'express-session' {
  interface SessionData {
    isAuth?: boolean;
    uid?: string;
    codeVerifier?: string;
    
  }
}

declare module 'http' {
  interface IncomingMessage {
    session: Session & { isAuth?: boolean; uid?: string };
  }
}
