import { UserinfoResponse } from 'openid-client';

declare global {
  namespace Express {
    interface User {
      info: UserinfoResponse;
    }

    interface Request {
      authDict?: {
        uid: string;
        first: string;
        last: string;
        picture: string;
        admin: boolean;
      };
    }
  }
}
