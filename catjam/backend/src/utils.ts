import { Request, Response, NextFunction } from 'express';
import { UserinfoResponse } from 'openid-client';

export interface AuthDict {
  uid: string;
  first: string;
  last: string;
  picture: string;
  admin: boolean;
}

export const cshUserAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.info) {
    return res.status(401).send('Unauthorized');
  }

  const userInfo = req.user.info as UserinfoResponse;
  const uid = userInfo.preferred_username || '';
  const first = userInfo.given_name || '';
  const last = userInfo.family_name || '';
  const picture = `https://profiles.csh.rit.edu/image/${uid}`;
  const groups = Array.isArray(userInfo.groups) ? (userInfo.groups as string[]) : [];

  const isEboard = groups.includes('eboard');
  const isRtp = groups.includes('rtp');

  req.authDict = {
    uid,
    first,
    last,
    picture,
    admin: isEboard || isRtp || uid === 'ccyborgg' || uid === 'snail',
  };

  next();
};
