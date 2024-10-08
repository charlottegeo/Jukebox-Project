import { AuthDict } from './utils';
import { UserinfoResponse } from 'openid-client';
import { Session } from 'express-session';

declare global {
  namespace Express {
    interface Request {
      logout(callback: (err: any) => void): void;
      isAuthenticated(): boolean;
      authDict?: AuthDict;
      user?: {
        info: UserinfoResponse;
      };
    }

    interface User {
      info: UserinfoResponse;
    }
  }
}

declare module 'http' {
  interface IncomingMessage {
    session: Session & { isAuth?: boolean };
  }
}
