import os
import redis

class Config:
    DEBUG = os.environ.get('DEBUG', 'False').lower() in ('true', '1', 't')
    SECRET_KEY = os.environ.get('SECRET_KEY', 'a-very-secret-key')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() in ('true', '1', 't')
    SESSION_COOKIE_SAMESITE = 'Lax'
    OIDC_ISSUER = os.environ.get('OIDC_ISSUER', 'https://sso.csh.rit.edu/auth/realms/csh')
    OIDC_CLIENT_ID = os.environ.get('OIDC_CLIENT_ID', 'catjam-app')
    OIDC_CLIENT_SECRET = os.environ.get('OIDC_CLIENT_SECRET', 'NOT-A-SECRET')
    OIDC_REDIRECT_URI = os.environ.get('OIDC_REDIRECT_URI', 'http://localhost:5000/oidc_callback')

    SESSION_TYPE = 'redis'
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = 31536000  # 1 year
    SESSION_USE_SIGNER = True

    redis_url = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
    SESSION_REDIS = redis.from_url(redis_url)
    SERVER_NAME = os.environ.get('SERVER_NAME', 'localhost:5000')
    PREFERRED_URL_SCHEME = os.environ.get('PREFERRED_URL_SCHEME', 'http')
