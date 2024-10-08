import 'express-session';

declare module 'express-session' {
    interface SessionData {
        spotifyAccessToken?: string;
        spotifyRefreshToken?: string;
        
    }
}