from functools import wraps
from flask import session, current_app
import jwt
import datetime

def generate_token(uid):
    payload = {
        'user_id': uid,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=1)
    }
    token = jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')
    return token

def decode_token(token):
    try:
        payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        return payload['user_id']
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def csh_user_auth(func):
    @wraps(func)
    def wrapped_function(*args, **kwargs):
        uid = str(session["userinfo"].get("preferred_username", ""))
        last = str(session["userinfo"].get("family_name", ""))
        first = str(session["userinfo"].get("given_name", ""))
        picture = "https://profiles.csh.rit.edu/image/" + uid
        groups = session["userinfo"].get("groups", [])
        is_eboard = "eboard" in groups
        is_rtp = "rtp" in groups
        auth_dict = {
            "uid": uid,
            "first": first,
            "last": last,
            "picture": picture,
            "admin": is_eboard or is_rtp or uid == "ccyborgg" or uid == "snail",
        }
        session["uid"] = uid
        kwargs["auth_dict"] = auth_dict
        return func(*args, **kwargs)

    return wrapped_function
