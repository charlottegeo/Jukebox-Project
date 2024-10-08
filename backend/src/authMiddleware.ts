import { Request, Response, NextFunction } from 'express';

export const authenticatedOnly = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !((req.session as any).uid)) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
};