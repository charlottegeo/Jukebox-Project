import 'express-session';
import { Socket } from 'socket.io';

declare module 'express-session' {
  interface SessionData {
    isAuth?: boolean;
  }
}

declare module 'http' {
  interface IncomingMessage {
    session: Express.Session & { isAuth?: boolean };
  }
}