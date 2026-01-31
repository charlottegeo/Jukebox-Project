import crypto from 'crypto';

const tokenStore = new Map<string, number>();
const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const generateShortLivedToken = (): string => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + TOKEN_EXPIRY_MS;
  tokenStore.set(token, expiry);
  
  if (tokenStore.size > 1000) {
    const now = Date.now();
    for (const [t, exp] of tokenStore.entries()) {
      if (exp < now) {
        tokenStore.delete(t);
      }
    }
  }
  
  return token;
};

export const validateStreamToken = (token: string): boolean => {
  const expiry = tokenStore.get(token);
  if (!expiry) {
    return false;
  }
  
  if (expiry < Date.now()) {
    tokenStore.delete(token);
    return false;
  }
  
  return true;
};

export const revokeToken = (token: string): void => {
  tokenStore.delete(token);
};
