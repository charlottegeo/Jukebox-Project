# app/__init__.py
from flask import Flask
from flask_socketio import SocketIO
from flask_pyoidc.flask_pyoidc import OIDCAuthentication
from flask_pyoidc.provider_configuration import ProviderConfiguration, ClientMetadata
from config import Config
import threading

socketio = SocketIO()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.secret_key = app.config['SECRET_KEY']

    socketio.init_app(app)

    CSH_AUTH = ProviderConfiguration(
        issuer=app.config["OIDC_ISSUER"],
        client_metadata=ClientMetadata(
            app.config["OIDC_CLIENT_ID"], app.config["OIDC_CLIENT_SECRET"]
        ),
    )
    auth = OIDCAuthentication({"default": CSH_AUTH}, app)

    from app.routes import create_main_blueprint

    main = create_main_blueprint(auth)
    app.register_blueprint(main)

    with app.app_context():
        from app import events
        threading.Thread(target=events.check_quiet_hours).start()

    return app

app = create_app()
