import { Request, Response, NextFunction } from 'express';
import { UserinfoResponse } from 'openid-client';
import { Song } from './interfaces';

export const getSongLengthInSeconds = (song: Song): number => {
  const lengthParts = song.track_length?.split(':') || ['0', '0'];
  let lengthInSeconds = 0;

  if (lengthParts.length === 3) {
    lengthInSeconds =
      parseInt(lengthParts[0]) * 3600 +
      parseInt(lengthParts[1]) * 60 +
      parseInt(lengthParts[2]);
  } else if (lengthParts.length === 2) {
    lengthInSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);
  }
  return lengthInSeconds;
};

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
    admin: isEboard || isRtp || uid === 'ccyborgg',
  };

  next();
};
