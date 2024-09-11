import json
import os
import subprocess
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit, disconnect, join_room
from flask import current_app, session, request, url_for
import paramiko
import re
import time
from pytubefix import YouTube, Playlist
from pytubefix.cli import on_progress
import librosa
from pydub import AudioSegment
from pydub.utils import which
import numpy as np
import tempfile
import logging
from app import socketio
from app.models import Song, UserQueue
from app.utils.main import get_token, search_for_tracks, get_spotify_playlist_tracks, get_spotify_album_tracks
from app.utils.track_wrapper import TrackWrapper, formatTime
from .util import csh_user_auth

# Load environment variables
load_dotenv()
token = get_token()

# Set AudioSegment to use Sox for conversions
AudioSegment.converter = which("ffmpeg")

# Configuration variables
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')
MAX_SONG_LENGTH = 10 * 60  # 10 minutes

# In-memory storage
user_queues = {}
user_order = []
skip_votes = {}
user_colors = {}
selected_color = "White"  # Default color
currentPlayingSong = None

logging.basicConfig(level=logging.INFO)

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
def handle_connect():
    uid = session.get('uid')
    
    join_room('music_room')

    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
    if uid not in user_order:
        user_order.append(uid)
    
    emit('message', {'message': 'Connected to server'}, room=request.sid)
    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('disconnect')
@authenticated_only
def handle_disconnect():
    uid = session.get('uid')
    if uid in user_order:
        user_order.remove(uid)

@socketio.on('join_room')
def handle_join_room(data):
    room = data.get('room')
    join_room(room)
    logging.info(f'Client joined room: {room}')

@socketio.on('youtubePlayerReady')
@authenticated_only
def handle_youtube_player_ready():
    emit('youtubePlayerIsReady', to='music_room')  # Broadcast to all clients

@socketio.on('searchTracks')
@authenticated_only
def handle_search_tracks(data):
    track_name = data.get('track_name')
    source = data.get('source', 'spotify')
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict(source=source) for track in result_array]
        emit('searchResults', {'results': search_results}, room=request.sid)
    except Exception as e:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': str(e)}, room=request.sid)

@socketio.on('addSongToQueue')
@authenticated_only
def handle_add_song_to_queue(data):
    track = data.get('track')
    uid = session.get('uid')

    if track:
        track_length_seconds = track.get('track_length')
        if track_length_seconds is not None:
            if not is_within_length_limit(track_length_seconds):
                max_length_formatted = formatTime(MAX_SONG_LENGTH)
                emit('spawnMessage', {'color': 'red', 'message': f'Track length {formatTime(track_length_seconds)} exceeds maximum allowed length {max_length_formatted}'}, room=request.sid)
                return

            track['source'] = data.get('source', 'spotify')
            add_song_to_user_queue(uid, track)
            emit('spawnMessage', {'color': 'green', 'message': 'Song added to queue'}, room=request.sid)
            if uid in user_queues:
                emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
            
            if not isPlaying:
                check_and_play_next_song()  # Start the next song if nothing is playing
        else:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Track length not provided'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Track data not provided'}, room=request.sid)

@socketio.on('addPlaylistToQueue')
@authenticated_only
def handle_add_playlist_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid')
    default_bpm = data.get('bpm', 90)  # Default BPM to 90 if not provided

    unsuccessful_count = 0
    successful_count = 0
    emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Loading playlist...'}, room=request.sid)

    if source == 'spotify':
        tracks = get_spotify_playlist_tracks(link)
    elif source == 'youtube':
        tracks, unsuccessful_count = get_youtube_playlist_tracks(link, default_bpm)
    else:
        tracks = []

    for track in tracks:
        track_length_seconds = parse_duration_in_seconds(track['track_length'])

        # Check if the song length is within the allowed limit
        if is_within_length_limit(track_length_seconds):
            track['track_length'] = track_length_seconds
            add_song_to_user_queue(uid, track)
            successful_count += 1
            emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
        else:
            unsuccessful_count += 1

    check_and_play_next_song()  # Check to start playing the next song

    # Emit a message summarizing the results
    if successful_count > 0:
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': f'Successfully added {successful_count} tracks to queue. {unsuccessful_count} tracks were skipped due to length limit.'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'All {unsuccessful_count} tracks were skipped due to length limit.'}, room=request.sid)

@socketio.on('addAlbumToQueue')
@authenticated_only
def handle_add_album_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid')
    
    unsuccessful_count = 0
    successful_count = 0

    if source == 'spotify':
        tracks = get_spotify_album_tracks(link)
    else:
        tracks = []

    for track in tracks:
        track_length_seconds = parse_duration_in_seconds(track['track_length'])

        # Check if the song length is within the allowed limit
        if is_within_length_limit(track_length_seconds):
            track['track_length'] = track_length_seconds
            add_song_to_user_queue(uid, track)
            successful_count += 1
        else:
            unsuccessful_count += 1

    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    check_and_play_next_song()

    # Emit a message summarizing the results
    if successful_count > 0:
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': f'Successfully added {successful_count} tracks to queue. {unsuccessful_count} tracks were skipped due to length limit.'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'All {unsuccessful_count} tracks were skipped due to length limit.'}, room=request.sid)

@socketio.on('removeSongFromQueue')
@authenticated_only
def handle_remove_song_from_queue(data):
    song_index = data.get('index')
    uid = session.get('uid')
    if uid in user_queues:
        user_queues[uid].remove_song(song_index)
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Song removed from queue'}, room=request.sid)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

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
        skip_threshold = max(2, active_users // 2 + 1)  # Ensures that at least 50% of users must vote to skip

        emit('vote_count', {'votes': len(skip_votes), 'threshold': skip_threshold}, to='music_room')

        if len(skip_votes) >= skip_threshold:
            play_next_song()
            skip_votes.clear()
            emit('skipSong', to='music_room')

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
    uid = session.get('uid')
    if currentPlayingSong:
        emit('updateCurrentSong', {'currentSong': currentPlayingSong}, room=request.sid)
    else:
        emit('updateCurrentSong', {'currentSong': None}, room=request.sid)

@socketio.on('clearQueueForUser')
@authenticated_only
def handle_clear_queue_for_user():
    uid = session.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('spawnMessage', {'color': 'green', 'message': 'Queue cleared.'}, room=request.sid)
        emit('updateUserQueue', {'queue': []}, room=request.sid)

    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

@socketio.on('secondsToMinutes')
@authenticated_only
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('formattedTime', {'time': formatted_time}, room=request.sid)

@socketio.on('skipSong')
@authenticated_only
def handle_skip_song():
    play_next_song()

@socketio.on('refreshDisplay')
@authenticated_only
def handle_refresh_display():
    emit('reloadPage', room=request.sid)

@socketio.on('userColorChange')
@authenticated_only
def handle_user_color_change(data):
    uid = session.get('uid')
    selected_color = data.get('color')

    if uid:
        user_colors[uid] = selected_color
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': f'Color changed to {selected_color}.'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated.'}, room=request.sid)

@socketio.on('get_cat_colors')
@authenticated_only
def handle_get_cat_colors():
    colors = get_cat_colors()
    emit('cat_colors', {'colors': colors}, room=request.sid)

@socketio.on('change_cat_color')
@authenticated_only
def handle_change_cat_color(color):
    global selected_color
    selected_color = color
    emit('color_changed', {'color': color}, room=request.sid)

@socketio.on('set_volume')
@authenticated_only
def handle_set_volume(data):
    volume = sanitize_volume_input(data['volume'])
    if volume is None:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid volume input.'}, room=request.sid)
        return

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD)
        ssh_stdin, ssh_stdout, ssh_stderr = ssh.exec_command(f'amixer set Master {volume}%')
        ssh.close()
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': f'Volume set to {volume}%'}, room=request.sid)
    except Exception as e:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Failed to set volume.'}, room=request.sid)

@socketio.on('clearSpecificQueue')
@authenticated_only
def handle_clear_specific_queue(data):
    uid = data.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('updateUserQueue', {'queue': []}, room=request.sid)
        emit('queueUpdated', room=request.sid)

@socketio.on('clearAllQueues')
@authenticated_only
def handle_clear_all_queues():
    for uid in user_queues:
        user_queues[uid].queue = []
    emit('queueUpdated', to='music_room')

@socketio.on('updateSongBpm')
@authenticated_only
def handle_update_song_bpm(data):
    song_index = data.get('index')
    new_bpm = data.get('bpm')
    uid = session.get('uid')

    if uid in user_queues:
        try:
            new_bpm = int(new_bpm)
            if new_bpm <= 0:
                raise ValueError("BPM must be a positive integer.")
        except ValueError as e:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': str(e)}, room=request.sid)
            return
        
        user_queue = user_queues[uid]
        if 0 <= song_index < len(user_queue.queue):
            user_queue.queue[song_index].bpm = new_bpm
            emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Song BPM updated.'}, room=request.sid)
            emit('updateUserQueue', {'queue': user_queue.get_queue()}, room=request.sid)
        else:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid song index.'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

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
    emit('queueUserCount', {'queues': queue_count, 'users': user_count}, room=request.sid)

@socketio.on('set_song_length_limit')
@authenticated_only
def handle_set_song_length_limit(data):
    global MAX_SONG_LENGTH
    MAX_SONG_LENGTH = data['length']
    emit('song_length_limit_set', {'length': MAX_SONG_LENGTH}, room=request.sid)

@socketio.on('addYoutubeLinkToQueue')
def handle_add_youtube_link_to_queue(data):
    youtube_link = data.get('youtube_link')
    youtube_bpm = data.get('bpm', 90)  # Default to 90 BPM if not provided
    uid = session.get('uid')

    if youtube_link and uid:
        try:
            # Fetch YouTube video metadata
            yt = YouTube(youtube_link)
            track_length_seconds = yt.length
            video_id = yt.video_id
            cover_url = f'https://img.youtube.com/vi/{video_id}/0.jpg'
            track_name = yt.title
            artist_name = yt.author

            # Check track length
            if not is_within_length_limit(track_length_seconds):
                max_length_formatted = formatTime(MAX_SONG_LENGTH)
                emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Track length {formatTime(track_length_seconds)} exceeds maximum allowed length {max_length_formatted}'}, room=request.sid)
                return

            # Add song to the queue immediately with loading state
            track_data = {
                'track_name': track_name,
                'artist_name': artist_name,
                'track_length': track_length_seconds,
                'cover_url': cover_url,
                'track_id': video_id,
                'uri': youtube_link,
                'bpm': '90',
                'source': 'youtube'
            }
            add_song_to_user_queue(uid, track_data)
            emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'YouTube link added to queue, analyzing BPM...'}, room=request.sid)

            # Capture the current app context and pass it to the background task
            app_ctx = current_app._get_current_object()
            socketio.start_background_task(target=download_audio_and_analyze, app_ctx=app_ctx, track_data=track_data, sid=request.sid)
            emit('queueUpdated', room=request.sid)
            check_and_play_next_song()

        except Exception as e:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to process YouTube link: {str(e)}'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid YouTube link or user not authenticated.'}, room=request.sid)

# Helper functions

def add_song_to_user_queue(uid, song):
    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
    if uid not in user_order:
        user_order.append(uid)

    # Add song to the queue
    user_queues[uid].add_song(Song(
        track_name=song['track_name'],
        artist_name=song['artist_name'],
        track_length=song['track_length'],
        cover_url=song['cover_url'],
        track_id=song['track_id'],
        uri=song['uri'],
        bpm=song['bpm'],
        uid=uid,
        source=song['source']
    ))

    # Log the queue after adding a song
    logging.info(f"Song added to queue for user {uid}: {user_queues[uid].get_queue()}")
    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

def get_next_user():
    if user_order:
        user_order.append(user_order.pop(0))
        return user_order[0]
    return None

def peek_next_user():
    if user_order:
        return user_order[0]
    return None

def is_next_song_globally(uid, track_id):
    """Check if the song is the next one to be played globally in the round-robin."""
    next_user = peek_next_user()
    if next_user and next_user in user_queues:
        next_queue = user_queues[next_user].get_queue()
        if next_queue and next_queue[0]['track_id'] == track_id and uid == next_user:
            return True
    return False

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
            currentPlayingSong = next_song.to_dict()

            # Emit to all connected clients
            socketio.emit('next_song', {'nextSong': currentPlayingSong}, to='music_room')
            socketio.emit('updateCurrentSong', {'currentSong': currentPlayingSong}, to='music_room')

            isPlaying = True
        else:
            currentPlayingSong = None
            socketio.emit('queue_empty', to='music_room')
            isPlaying = False
    else:
        currentPlayingSong = None
        socketio.emit('queue_empty', to='music_room')
        isPlaying = False

def download_audio_and_analyze(app_ctx, track_data, sid):
    with app_ctx.app_context():
        try:
            # Create a temporary file to store the downloaded audio
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp_file:
                tmp_filepath = tmp_file.name

            # Download audio using pytubefix
            yt = YouTube(track_data['uri'])
            stream = yt.streams.get_audio_only()
            stream.download(output_path=os.path.dirname(tmp_filepath), filename=os.path.basename(tmp_filepath))

            # Validate that the file is not corrupt
            if not os.path.exists(tmp_filepath) or os.path.getsize(tmp_filepath) == 0:
                logging.error(f"Downloaded file size: {os.path.getsize(tmp_filepath)}")
                raise Exception("Downloaded file is invalid or corrupt.")
            else:
                logging.info(f"Downloaded file size: {os.path.getsize(tmp_filepath)}")

            # Convert the downloaded audio to WAV using Pydub for BPM analysis
            audio = AudioSegment.from_file(tmp_filepath)
            wav_filepath = tmp_filepath.replace('.mp3', '.wav')
            audio.export(wav_filepath, format="wav")

            # Analyze BPM directly from the WAV file using librosa
            bpm = analyze_bpm_librosa(wav_filepath)
            track_data['bpm'] = bpm

            # Remove the temporary WAV file after analysis
            os.remove(wav_filepath)
        except Exception as e:
            logging.error(f"Error in download_audio_and_analyze: {str(e)}")
            socketio.emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to download and analyze YouTube link: {str(e)}. Please yell at @ccyborgg'}, room=sid)

def analyze_bpm_librosa(audio_file):
    try:
        logging.info(f"Analyzing BPM using librosa for file: {audio_file}")
        y, sr = librosa.load(audio_file)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        logging.info(f"Analyzed BPM using librosa: {tempo}")
        return float(tempo)
    except Exception as e:
        logging.error(f"Error analyzing BPM with librosa: {str(e)}")
        return 90

def get_cat_colors():
    base_path = os.path.join('static/img/cats')
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

def is_within_length_limit(track_length_seconds):
    return track_length_seconds <= MAX_SONG_LENGTH

def is_valid_youtube_link(link):
    regex = re.compile(r'^(https?://)?(www\.)?(youtube\.com|youtu\.?be)/(watch\?v=|embed/|v/|.+\?v=|.+&v=|playlist\?list=|.*list=)([a-zA-Z0-9_-]{11}|[a-zA-Z0-9_-]+)')
    return bool(regex.match(link))

def parse_youtube_link(youtube_link, emit_func, sid):
    try:
        yt = YouTube(youtube_link)
        track_name = yt.title
        artist_name = yt.author
        track_length_seconds = yt.length
        video_id = yt.video_id

        if not is_within_length_limit(track_length_seconds):
            max_length_formatted = formatTime(MAX_SONG_LENGTH)
            emit_func('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Track length {formatTime(track_length_seconds)} exceeds maximum allowed length {max_length_formatted}'}, room=sid)
            return None

        track_data = {
            'track_name': track_name,
            'artist_name': artist_name,
            'track_length': track_length_seconds,
            'cover_url': f'https://img.youtube.com/vi/{video_id}/0.jpg',
            'track_id': video_id,
            'uri': youtube_link,
            'bpm': 'Unknown',
            'source': 'youtube'
        }

        return track_data

    except Exception as e:
        emit_func('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to process YouTube link: {str(e)}. Please yell at @ccyborgg'}, room=sid)
        return None


def get_youtube_playlist_tracks(link, default_bpm):
    tracks = []
    unsuccessful_count = 0

    try:
        playlist = Playlist(link)
        for video in playlist.videos:
            track_data = parse_youtube_link(video.watch_url, emit, request.sid)
                
            if track_data:
                track_length_seconds = track_data['track_length']
                if is_within_length_limit(track_length_seconds):
                    track_data['bpm'] = default_bpm if default_bpm else '90'
                    tracks.append(track_data)
                else:
                    unsuccessful_count += 1
            else:
                unsuccessful_count += 1

    except Exception as e:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to process YouTube playlist: {str(e)}. Please yell at @ccyborgg'}, room=request.sid)

    return tracks, unsuccessful_count

def parse_duration(duration_str):
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        hours = int(match.group(1)) if match.group(1) else 0
        minutes = int(match.group(2)) if match.group(2) else 0
        seconds = int(match.group(3)) if match.group(3) else 0
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return 'Unknown'

def parse_duration_in_seconds(duration_str):
    if isinstance(duration_str, int):
        return duration_str

    match = re.match(r'(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        hours = int(match.group(1)) if match.group(1) else 0
        minutes = int(match.group(2)) if match.group(2) else 0
        seconds = int(match.group(3)) if match.group(3) else 0
        return hours * 3600 + minutes * 60 + seconds
    return 0
