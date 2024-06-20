import os
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit
from app import socketio
from app.models import Song, UserQueue
from app.utils.main import get_token, search_for_tracks
from app.utils.track_wrapper import TrackWrapper, formatTime

from .util import csh_user_auth
from flask import session
import paramiko

load_dotenv()
token = get_token()
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')

#store queues in memory
user_queues = {}
user_order = []


@socketio.on('connect')
def handle_connect():
    emit('message', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        del user_queues[uid]
        if uid in user_order:
            user_order.remove(uid)

@socketio.on('ping')
def handle_ping():
    emit('pong')

@socketio.on('searchTracks')
def handle_search_tracks(data):
    track_name = data.get('track_name')
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict() for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results})
    except Exception as e:
        emit('message', {'action': 'error', 'error': str(e)})

@socketio.on('addSongToQueue')
def handle_add_song_to_queue(data):
    track_data = data.get('track')
    uid = session.get('uid') or session.get('preferred_username')
    if track_data and uid:
        add_song_to_user_queue(uid, track_data)
        emit('queueUpdated', broadcast=True)
        check_and_play_next_song()
    else:
        print('Invalid song data')
        emit('error', {'message': 'Invalid song data.'})

@socketio.on('get_user_queue')
def handle_get_user_queue():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        emit('message', {'action': 'updateQueue', 'queue': user_queues[uid].get_queue()})
@socketio.on('isPlaying')
def handle_is_playing(data):
    global isPlaying
    isPlaying = data.get('isPlaying')
    print('Is playing:', isPlaying)
    if not isPlaying:
        print('Playing next song')
        play_next_song()


@socketio.on('get_next_song')
def handle_get_next_song():
    play_next_song()


@socketio.on('clearQueue')
def handle_clear_queue():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('message', {'action': 'updateQueue', 'queue': []}, broadcast=True)

@socketio.on('secondsToMinutes')
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, broadcast=True)

@socketio.on('skipSong')
def handle_skip_song():
    play_next_song()

@socketio.on('refreshDisplay')
def handle_refresh_display():
    emit('reloadPage', broadcast=True)

def get_cat_colors():
    base_path = os.path.join('app', 'static', 'img', 'cats')
    if not os.path.exists(base_path):
        return []
    dirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    return dirs


@socketio.on('get_cat_colors')
def handle_get_cat_colors():
    colors = get_cat_colors()
    emit('message', {'action': 'cat_colors', 'colors': colors}, broadcast=True)

selected_color = "White"  # Default color

@socketio.on('change_cat_color')
def handle_change_cat_color(color):
    global selected_color
    selected_color = color
    emit('color_changed', {'color': color}, broadcast=True)


@socketio.on('set_volume')
def handle_set_volume(data):
    volume = data['volume']

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD)
        ssh_stdin, ssh_stdout, ssh_stderr = ssh.exec_command(f'amixer set Master {volume}%')
        ssh.close()
        emit('volume_set', {'volume': volume}, broadcast=True)
    except Exception as e:
        print(f"Error setting volume: {str(e)}")
        emit('error', {'message': 'Failed to set volume.'})

def add_song_to_user_queue(uid, song):
    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
        user_order.append(uid)
    user_queues[uid].add_song(Song(
        track_name=song['track_name'],
        artist_name=song['artist_name'],
        track_length=song['track_length'],
        cover_url=song['cover_url'],
        track_id=song['track_id'],
        uri=song['uri'],
        bpm=song['bpm'],
        uid=uid
    ))

def get_next_user():
    if user_order:
        user_order.append(user_order.pop(0))
        return user_order[0]
    return None

def play_next_song():
    global isPlaying
    next_user = get_next_user()
    if next_user and user_queues[next_user].queue:
        next_song = user_queues[next_user].remove_song()
        emit('message', {'action': 'next_song', 'nextSong': next_song.to_dict()}, broadcast=True)
        isPlaying = True
    else:
        emit('message', {'action': 'queue_empty'}, broadcast=True)
        isPlaying = False

def check_and_play_next_song():
    if not isPlaying:
        play_next_song()

