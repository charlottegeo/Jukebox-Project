from flask import Flask
from flask_socketio import SocketIO
from flask_pyoidc.flask_pyoidc import OIDCAuthentication
from flask_pyoidc.provider_configuration import ProviderConfiguration, ClientMetadata
from config import Config
from flask_session import Session
import logging

socketio = SocketIO(cors_allowed_origins="*")
sess = Session()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    logging.basicConfig(level=logging.DEBUG)
    app.logger.setLevel(logging.DEBUG)
    
    socketio.init_app(app, async_mode='eventlet')
    sess.init_app(app)

    CSH_AUTH = ProviderConfiguration(
        issuer=app.config["OIDC_ISSUER"],
        client_metadata=ClientMetadata(
            app.config["OIDC_CLIENT_ID"], app.config["OIDC_CLIENT_SECRET"]
        ),
    )
    auth = OIDCAuthentication({"default": CSH_AUTH}, app)

    from app.routes import create_main_blueprint, oidc_callback
    main = create_main_blueprint(auth)
    app.register_blueprint(main)

    with app.app_context():
        from app import events
        from app.utils.main import get_token
        token = get_token()
        events.token = token

    return app