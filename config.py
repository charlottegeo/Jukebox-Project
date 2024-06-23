import os
import redis

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-very-secret-key'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() in ('true', '1', 't')
    SESSION_COOKIE_SAMESITE = 'Lax'
    OIDC_ISSUER = os.environ.get("OIDC_ISSUER", "https://sso.csh.rit.edu/auth/realms/csh")
    OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "catjam-app")
    OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "NOT-A-SECRET")
    OIDC_REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "http://localhost:5000/oidc_callback")
    
    SESSION_TYPE = 'redis'
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = 31536000  # 1 year
    SESSION_USE_SIGNER = True
    SESSION_REDIS = redis.from_url(os.environ.get('REDIS_URL') or 'redis://localhost:6379')
