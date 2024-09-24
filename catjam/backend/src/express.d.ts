import { AuthDict } from './utils';
import { UserinfoResponse } from 'openid-client';

declare global {
  namespace Express {
    interface Request {
      logout(callback: (err: any) => void): void;
      isAuthenticated(): boolean;
      authDict?: AuthDict;  // Add authDict to the Request type
    }

    interface User {
      info: UserinfoResponse;
    }
  }
}

declare module 'http' {
  interface IncomingMessage {
    session: Express.Session & { isAuth?: boolean };
  }
}
