# run.py
from app import socketio
from dotenv import load_dotenv

load_dotenv()

if __name__ == '__main__':
    from app import create_app
    app = create_app()
    socketio.run(app, debug=True)
