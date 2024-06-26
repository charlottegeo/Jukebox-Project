import time
import json
import os
from threading import Event
from dotenv import load_dotenv
from flask_socketio import emit, disconnect
from flask import session, request, current_app, copy_current_request_context
import logging
import pyotp
import paramiko
import re
from bs4 import BeautifulSoup
import requests
from app.models import Song, UserQueue
from app.utils.main import search_for_tracks, get_spotify_playlist_tracks, get_spotify_album_tracks
from app.utils.track_wrapper import formatTime
from .util import csh_user_auth
from app import socketio

load_dotenv()

# Global variables
current_code = None
code_gen_time = None
code_timer_event = Event()
redis_instance = None
token = None 

logging.basicConfig(level=logging.DEBUG)

def get_redis_instance():
    global redis_instance
    if redis_instance is None:
        redis_instance = current_app.config['SESSION_REDIS']
    return redis_instance

# Configuration variables
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')
MAX_SONG_LENGTH = 10 * 60  # 10 minutes
CODE_INTERVAL = int(os.getenv('CODE_INTERVAL', 30))  # Interval for TOTP code change, default is 30s
VALIDATION_INTERVAL = int(os.getenv('VALIDATION_INTERVAL', 7200))  # Interval for validation check, default is 2h

# In-memory storage
user_queues = {}
user_order = []
skip_votes = {}
disconnect_timers = {}
DISCONNECT_GRACE_PERIOD = 60  # in seconds
selected_color = "White"  # Default color
currentPlayingSong = None
user_last_validated = {}

# Generate a TOTP object
secret = os.getenv('TOTP_SECRET', pyotp.random_base32())
totp = pyotp.TOTP(secret)

def generate_code():
    global current_code, code_gen_time
    current_code = totp.now()
    code_gen_time = time.time()
    return current_code, CODE_INTERVAL

def broadcast_code(app, socketio):
    while not code_timer_event.is_set():
        with app.app_context():
            new_code, interval = generate_code()
            socketio.emit('update_code', {'code': new_code, 'remaining_time': interval})
            for second in range(interval):
                if code_timer_event.is_set():
                    break
                remaining_time = interval - second
                socketio.emit('update_timer', {'remaining_time': remaining_time})
                time.sleep(1)

def load_state():
    global user_queues, user_order, skip_votes, currentPlayingSong, user_last_validated
    redis_instance = get_redis_instance()
    state_json = redis_instance.get('jukebox_state')
    if state_json:
        state = json.loads(state_json)
        user_queues = {uid: UserQueue.from_dict(queue) for uid, queue in state['user_queues'].items()}
        user_order = state['user_order']
        skip_votes = state['skip_votes']
        currentPlayingSong = Song.from_dict(state['currentPlayingSong']) if state['currentPlayingSong'] else None
        user_last_validated = state['user_last_validated']

def save_state():
    redis_instance = get_redis_instance()
    user_queues_serializable = {uid: user_queue.to_dict() for uid, user_queue in user_queues.items()}
    state = {
        'user_queues': user_queues_serializable,
        'user_order': user_order,
        'skip_votes': skip_votes,
        'currentPlayingSong': currentPlayingSong.to_dict() if currentPlayingSong else None,
        'user_last_validated': user_last_validated
    }
    # Save state to Redis
    redis_instance.set('jukebox_state', json.dumps(state))

def periodic_save(app):
    while True:
        with app.app_context():
            save_state()
        time.sleep(60)  # Save every 60s

# Decorator to ensure the user is authenticated
def authenticated_only(f):
    def wrapped(*args, **kwargs):
        if 'uid' not in session:
            disconnect()
        else:
            return f(*args, **kwargs)
    return wrapped

# Event handlers
@socketio.on('connect')
@authenticated_only
def handle_connect(auth):
    uid = session.get('uid')
    # If there was a disconnect timer, cancel it
    if uid in disconnect_timers:
        disconnect_timers[uid]['stop'] = True
        del disconnect_timers[uid]

    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
    if uid not in user_order:
        user_order.append(uid)
    emit('message', {'message': 'Connected to server'})
    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

    # Send the current code and remaining time to the newly connected client
    time_elapsed = time.time() - code_gen_time
    remaining_time = max(CODE_INTERVAL - int(time_elapsed), 0)
    emit('update_code', {'code': current_code, 'remaining_time': remaining_time})

@socketio.on('get_code_interval')
def handle_get_code_interval():
    emit('code_interval', {'CODE_INTERVAL': CODE_INTERVAL})

def start_remove_user_queue(app, uid):
    def _remove_user_queue():
        with app.app_context():
            if uid in disconnect_timers:
                for _ in range(DISCONNECT_GRACE_PERIOD):
                    if disconnect_timers[uid]['stop']:
                        return
                    time.sleep(1)
                remove_user_queue(app, uid)
    return _remove_user_queue

def remove_user_queue(app, uid):
    with app.app_context():
        if uid in user_order:
            user_order.remove(uid)
        if uid in user_queues:
            del user_queues[uid]
        socketio.emit('message', {'message': 'User queue removed due to disconnect'}, broadcast=True)

@socketio.on('disconnect')
@authenticated_only
def handle_disconnect():
    uid = session.get('uid')

    # Start the grace period task
    if uid in disconnect_timers:
        disconnect_timers[uid]['task'].cancel()
        del disconnect_timers[uid]

    disconnect_timers[uid] = {
        'task': socketio.start_background_task(start_remove_user_queue(current_app._get_current_object(), uid)),
        'stop': False
    }

@socketio.on('get_new_code')
def handle_get_new_code():
    new_code, interval = generate_code()
    socketio.emit('update_code', {'code': new_code, 'remaining_time': interval}, room=request.sid)

@socketio.on('searchTracks')
@authenticated_only
def handle_search_tracks(data):
    track_name = data.get('track_name')
    source = data.get('source', 'spotify')
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict(source=source) for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results})
    except Exception as e:
        emit('message', {'action': 'error', 'error': str(e)})

@socketio.on('addSongToQueue')
@authenticated_only
def handle_add_song_to_queue(data):
    track = data.get('track')
    uid = session.get('uid')
    logging.debug(f"Received addSongToQueue event with track: {track} and uid: {uid}")
    if track:
        track_length = track.get('track_length')
        logging.debug(f"Track length: {track_length}")
        if track_length is not None:
            try:
                track_length = int(track_length)
            except ValueError:
                emit('error', {'message': 'Invalid track length'})
                return
            
            if track_length > MAX_SONG_LENGTH:
                emit('error', {'message': f'Track length {track_length} exceeds maximum allowed length {MAX_SONG_LENGTH}'})
                return

            track['source'] = data.get('source', 'spotify')
            song = Song(
                track_name=track['track_name'],
                artist_name=track['artist_name'],
                track_length=track['track_length'],
                cover_url=track['cover_url'],
                track_id=track['track_id'],
                uri=track['uri'],
                bpm=track['bpm'],
                uid=uid,
                source=track['source']
            )
            logging.debug(f"Adding song to queue: {song.to_dict()}")
            add_song_to_user_queue(uid, song.to_dict())
            emit('songAdded', {'message': 'Song added to queue', 'track': song.to_dict()}, room=request.sid)

            if uid in user_queues:
                emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
            
            if not isPlaying:
                check_and_play_next_song()
        else:
            emit('error', {'message': 'Track length not provided'})
    else:
        emit('error', {'message': 'Track data not provided'})

@socketio.on('youtubePlayerReady')
@authenticated_only
def handle_youtube_player_ready():
    emit('youtubePlayerIsReady', broadcast=True)

@socketio.on('addPlaylistToQueue')
@authenticated_only
def handle_add_playlist_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid')
    
    if source == 'spotify':
        tracks = get_spotify_playlist_tracks(link)
    elif source == 'youtube':
        tracks = get_youtube_playlist_tracks(link)
    else:
        tracks = []

    for track in tracks:
        add_song_to_user_queue(uid, track)

    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    check_and_play_next_song()

@socketio.on('addAlbumToQueue')
@authenticated_only
def handle_add_album_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid')
    
    if source == 'spotify':
        tracks = get_spotify_album_tracks(link)
    else:
        tracks = []

    for track in tracks:
        add_song_to_user_queue(uid, track)

    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    check_and_play_next_song()

@socketio.on('removeSongFromQueue')
@authenticated_only
def handle_remove_song_from_queue(data):
    song_index = data.get('index')
    uid = session.get('uid')
    if uid in user_queues:
        user_queues[uid].remove_song(song_index)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('get_user_queue')
@authenticated_only
def handle_get_user_queue():
    uid = session.get('uid')
    if uid in user_queues:
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    else:
        emit('updateUserQueue', {'queue': []}, room=request.sid)

@socketio.on('vote_to_skip')
@authenticated_only
def handle_vote_to_skip():
    uid = session.get('uid')
    if uid not in skip_votes:
        skip_votes[uid] = True
        active_users = len(user_queues)
        skip_threshold = active_users // 2 + 1

        if len(skip_votes) >= skip_threshold:
            play_next_song()
            skip_votes.clear()
            emit('message', {'action': 'skipSong'}, broadcast=True)
        else:
            emit('vote_count', {'votes': len(skip_votes), 'threshold': skip_threshold}, broadcast=True)

@socketio.on('isPlaying')
@authenticated_only
def handle_is_playing(data):
    global isPlaying
    isPlaying = data.get('isPlaying')
    if not isPlaying:
        play_next_song()

@socketio.on('get_next_song')
@authenticated_only
def handle_get_next_song():
    play_next_song()

@socketio.on('get_current_song')
@authenticated_only
def handle_get_current_song():
    if currentPlayingSong:
        emit('updateCurrentSong', {'currentSong': currentPlayingSong.to_dict()}, room=request.sid)
    else:
        emit('updateCurrentSong', {'currentSong': None}, room=request.sid)

@socketio.on('clearQueueForUser')
@authenticated_only
def handle_clear_queue_for_user():
    uid = session.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('updateUserQueue', {'queue': []}, room=request.sid)
        emit('queueUpdated', broadcast=True)

@socketio.on('secondsToMinutes')
@authenticated_only
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, broadcast=True)

@socketio.on('skipSong')
@authenticated_only
def handle_skip_song():
    play_next_song()

@socketio.on('refreshDisplay')
@authenticated_only
def handle_refresh_display():
    emit('reloadPage', broadcast=True)

@socketio.on('get_cat_colors')
@authenticated_only
def handle_get_cat_colors():
    colors = get_cat_colors()
    emit('message', {'action': 'cat_colors', 'colors': colors}, broadcast=True)

@socketio.on('change_cat_color')
@authenticated_only
def handle_change_cat_color(color):
    global selected_color
    selected_color = color
    emit('color_changed', {'color': color}, broadcast=True)

@socketio.on('set_volume')
@authenticated_only
def handle_set_volume(data):
    volume = sanitize_volume_input(data['volume'])
    if volume is None:
        emit('error', {'message': 'Invalid volume input.'})
        return
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD)
        ssh_stdin, ssh_stdout, ssh_stderr = ssh.exec_command(f'amixer set Master {volume}%')
        ssh.close()
        emit('volume_set', {'volume': volume}, broadcast=True)
    except Exception as e:
        emit('error', {'message': 'Failed to set volume.'})

@socketio.on('validate_code')
def handle_validate_code(data):
    uid = session.get('uid')
    entered_code = data.get('code')
    if entered_code == current_code:
        user_last_validated[uid] = time.time()
        emit('code_validation', {'success': True})
    else:
        emit('code_validation', {'success': False})

@socketio.on('check_validation')
@authenticated_only
def handle_check_validation(data):
    uid = session.get('uid')
    requires_validation = needs_validation(uid)
    emit('check_validation_response', {'needsValidation': requires_validation}, room=request.sid)

@socketio.on('clearSpecificQueue')
@authenticated_only
def handle_clear_specific_queue(data):
    uid = data.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
        emit('queueUpdated', broadcast=True)

@socketio.on('clearAllQueues')
@authenticated_only
def handle_clear_all_queues():
    for uid in user_queues:
        user_queues[uid].queue = []
    emit('queueUpdated', broadcast=True)

@socketio.on('reorderQueue')
@authenticated_only
def handle_reorder_queue(data):
    old_index = data.get('oldIndex')
    new_index = data.get('newIndex')
    uid = session.get('uid')

    if uid in user_queues and old_index is not None and new_index is not None:
        user_queues[uid].reorder_queue(old_index, new_index)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('getQueueUserCount')
@authenticated_only
def handle_get_queue_user_count():
    queue_count = len(user_queues)
    user_count = len(set(user_queues.keys()))
    emit('queueUserCount', {'queues': queue_count, 'users': user_count})

@socketio.on('set_song_length_limit')
@authenticated_only
def handle_set_song_length_limit(data):
    global song_length_limit
    song_length_limit = data['length']
    emit('song_length_limit_set', {'length': song_length_limit}, broadcast=True)

@socketio.on('addYoutubeLinkToQueue')
@authenticated_only
def handle_add_youtube_link_to_queue(data):
    youtube_link = data.get('youtube_link')
    uid = session.get('uid')
    if youtube_link and uid:
        try:
            track_data = parse_youtube_link(youtube_link, uid)  # Pass uid here
            if track_data:
                add_song_to_user_queue(uid, track_data)
                emit('queueUpdated', broadcast=True)
                check_and_play_next_song()
        except Exception as e:
            emit('error', {'message': f'Failed to process YouTube link: {str(e)}'}, room=request.sid)
    else:
        emit('error', {'message': 'Invalid YouTube link or user not authenticated.'})

# Helper functions

def add_song_to_user_queue(uid, song_dict):
    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
    if uid not in user_order:
        user_order.append(uid)
    song = Song.from_dict(song_dict)
    user_queues[uid].add_song(song)
    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

def get_next_user():
    if user_order:
        user_order.append(user_order.pop(0))
        return user_order[0]
    return None

def check_and_play_next_song():
    global isPlaying
    if not isPlaying:
        play_next_song()

def play_next_song():
    global isPlaying, currentPlayingSong
    next_user = get_next_user()
    if next_user and next_user in user_queues:
        user_queue = user_queues[next_user]
        if user_queue.queue:
            next_song = user_queue.remove_song()
            currentPlayingSong = next_song
            emit('message', {'action': 'next_song', 'nextSong': currentPlayingSong.to_dict()}, broadcast=True)
            emit('updateCurrentSong', {'currentSong': currentPlayingSong.to_dict()}, broadcast=True)
            isPlaying = True
        else:
            currentPlayingSong = None
            emit('message', {'action': 'queue_empty'}, broadcast=True)
            isPlaying = False
    else:
        currentPlayingSong = None
        emit('message', {'action': 'queue_empty'}, broadcast=True)
        isPlaying = False
    emit('updateUserQueue', {'queue': user_queues[next_user].get_queue()}, broadcast=True)

def get_cat_colors():
    base_path = os.path.join('app', 'static', 'img', 'cats')
    if not os.path.exists(base_path):
        return []
    dirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    return dirs

def sanitize_volume_input(volume):
    try:
        volume = int(volume)
        if 0 <= volume <= 100:
            return volume
        else:
            return None
    except ValueError:
        return None

def parse_youtube_link(youtube_link, uid):
    try:
        response = requests.get(youtube_link)
        if response.status_code != 200:
            return None
        soup = BeautifulSoup(response.text, 'html.parser')

        title_tag = soup.find('meta', {'name': 'title'})
        track_name = title_tag['content'] if title_tag else 'YouTube Video'
        channel_tag = soup.find('link', {'itemprop': 'name'})
        artist_name = channel_tag['content'] if channel_tag else 'Unknown Artist'
        duration_tag = soup.find('meta', {'itemprop': 'duration'})
        track_length = parse_duration(duration_tag['content']) if duration_tag else 'Unknown'

        video_id = youtube_link.split('v=')[1].split('&')[0]

        track_data = {
            'track_name': track_name,
            'artist_name': artist_name,
            'track_length': track_length,
            'cover_url': f'https://img.youtube.com/vi/{video_id}/0.jpg',
            'track_id': video_id,
            'uri': youtube_link,
            'bpm': 'Unknown',
            'source': 'youtube',
            'uid': uid
        }

        return track_data
    except Exception as e:
        return None

def get_youtube_playlist_tracks(link):
    try:
        response = requests.get(link)
        soup = BeautifulSoup(response.text, 'html.parser')
        scripts = soup.find_all('script')

        tracks = []
        for script in scripts:
            if 'ytInitialData' in script.text:
                initial_data = script.string
                break
        else:
            raise ValueError("ytInitialData not found in page scripts")

        playlist_info = re.search(r'ytInitialData\s*=\s*(\{.*?\});', initial_data)
        if not playlist_info:
            raise ValueError("Playlist info not found in ytInitialData")

        playlist_json = json.loads(playlist_info.group(1))
        playlist_items = playlist_json['contents']['twoColumnBrowseResultsRenderer']['tabs'][0]['tabRenderer']['content']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents'][0]['playlistVideoListRenderer']['contents']

        for item in playlist_items:
            video_info = item.get('playlistVideoRenderer', {})
            video_id = video_info.get('videoId')
            track_name = video_info.get('title', {}).get('runs', [{}])[0].get('text', 'Unknown Title')
            artist_name = video_info.get('shortBylineText', {}).get('runs', [{}])[0].get('text', 'Unknown Artist')
            duration_text = video_info.get('lengthText', {}).get('simpleText', '0:00')
            track_length = parse_duration_in_seconds(duration_text)

            tracks.append({
                'track_name': track_name,
                'artist_name': artist_name,
                'track_length': track_length,
                'cover_url': f'https://img.youtube.com/vi/{video_id}/0.jpg',
                'track_id': video_id,
                'uri': f'https://www.youtube.com/watch?v={video_id}',
                'bpm': 'Unknown',
                'source': 'youtube'
            })

        return tracks

    except Exception as e:
        return []

def parse_duration(duration_str):
    match = re.match(r'PT(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        minutes = int(match.group(1)) if match.group(1) else 0
        seconds = int(match.group(2)) if match.group(2) else 0
        return f"{minutes}:{seconds:02d}"
    return 'Unknown'

def parse_duration_in_seconds(duration_str):
    match = re.match(r'(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        hours = int(match.group(1)) if match.group(1) else 0
        minutes = int(match.group(2)) if match.group(2) else 0
        seconds = int(match.group(3)) if match.group(3) else 0
        return hours * 3600 + minutes * 60 + seconds
    return 0

def needs_validation(uid):
    if uid not in user_last_validated:
        return True
    return (time.time() - user_last_validated[uid]) > VALIDATION_INTERVAL

def start_code_generation(app, socketio):
    socketio.start_background_task(broadcast_code, app, socketio)
