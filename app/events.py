import json
import os
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit, disconnect
from flask import current_app, session, request, url_for
import paramiko
import re
import time
import requests
import yt_dlp
import librosa
import numpy as np
import boto3
import tempfile
import logging
from botocore.exceptions import NoCredentialsError
from app import socketio
from app.models import Song, UserQueue
from app.utils.main import get_token, search_for_tracks, get_spotify_playlist_tracks, get_spotify_album_tracks
from app.utils.track_wrapper import TrackWrapper, formatTime
from .util import csh_user_auth


# Load environment variables
load_dotenv()
token = get_token()

# S3 Configuration
s3 = boto3.client('s3', endpoint_url='https://s3.csh.rit.edu',
                  aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                  aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'))
BUCKET_NAME = 'catjam'

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

@socketio.on('searchTracks')
@authenticated_only
def handle_search_tracks(data):
    track_name = data.get('track_name')
    source = data.get('source', 'spotify')
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict(source=source) for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results}, room=request.sid)
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
                emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Track length {formatTime(track_length_seconds)} exceeds maximum allowed length {max_length_formatted}'}, room=request.sid)
                return

            track['source'] = data.get('source', 'spotify')
            add_song_to_user_queue(uid, track)
            emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Song added to queue'}, room=request.sid)

            if uid in user_queues:
                emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
            
            if not isPlaying:
                check_and_play_next_song()
        else:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Track length not provided'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Track data not provided'}, room=request.sid)

@socketio.on('youtubePlayerReady')
@authenticated_only
def handle_youtube_player_ready():
    emit('youtubePlayerIsReady', room=request.sid)

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

    check_and_play_next_song()

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

        emit('vote_count', {'votes': len(skip_votes), 'threshold': skip_threshold}, broadcast=True)

        if len(skip_votes) >= skip_threshold:
            play_next_song()
            skip_votes.clear()
            emit('message', {'action': 'skipSong'}, broadcast=True)

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
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Queue cleared.'}, room=request.sid)
        emit('updateUserQueue', {'queue': []}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

@socketio.on('secondsToMinutes')
@authenticated_only
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, room=request.sid)

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
    emit('queueUpdated', broadcast=True)

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
@authenticated_only
def handle_add_youtube_link_to_queue(data):
    youtube_link = data.get('youtube_link')
    youtube_bpm = data.get('bpm')
    uid = session.get('uid')

    if youtube_link and uid:
        if not is_valid_youtube_link(youtube_link):
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid YouTube link format.'}, room=request.sid)
            return
        
        try:
            # Extract metadata using yt_dlp without downloading
            ydl_opts = {'skip_download': True}  # Skip the download, just get the info
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info_dict = ydl.extract_info(youtube_link, download=False)
                track_name = info_dict.get('title', 'YouTube Video')
                artist_name = info_dict.get('uploader', 'Unknown Artist')
                track_length_seconds = info_dict.get('duration', 0)
                video_id = info_dict.get('id')
                cover_url = f'https://img.youtube.com/vi/{video_id}/0.jpg'

            # If track length exceeds limit, skip
            if not is_within_length_limit(track_length_seconds):
                max_length_formatted = formatTime(MAX_SONG_LENGTH)
                emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Track length {formatTime(track_length_seconds)} exceeds maximum allowed length {max_length_formatted}'}, room=request.sid)
                return

            # Prepare track data
            track_data = {
                'track_name': track_name,
                'artist_name': artist_name,
                'track_length': track_length_seconds,
                'cover_url': cover_url,
                'track_id': video_id,
                'uri': youtube_link,
                'bpm': youtube_bpm or 90,  # Default to 90 if not provided
                'source': 'youtube'
            }

            # Check if the MP3 file already exists in S3
            object_name = f"{track_data['track_id']}.mp3"
            try:
                s3.head_object(Bucket=BUCKET_NAME, Key=object_name)
                print(f"MP3 file {object_name} already exists in S3.")
                track_data['mp3_url'] = f"https://s3.csh.rit.edu/{BUCKET_NAME}/{object_name}"
            except Exception:
                print(f"MP3 file {object_name} not found in S3. Downloading now.")
                # Start the background task to download the MP3 only if it does not exist
                socketio.start_background_task(download_mp3_and_analyze, track_data, request.sid)

            # Add to queue regardless of whether MP3 exists or is being downloaded
            add_song_to_user_queue(uid, track_data)

            # Emit success message
            emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'YouTube link added to queue'}, room=request.sid)

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
    user_queues[uid].add_song(Song(
        track_name=song['track_name'],
        artist_name=song['artist_name'],
        track_length=song['track_length'],
        cover_url=song['cover_url'],
        track_id=song['track_id'],
        uri=song['uri'],
        bpm=song['bpm'],
        uid=uid,
        source=song['source'],
        wav_url=song.get('wav_url')
    ))
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

            # If the next song is a YouTube song, check for the MP3 file availability
            if next_song.source == 'youtube':
                object_name = f"{next_song.track_id}.mp3"
                try:
                    s3.head_object(Bucket=BUCKET_NAME, Key=object_name)
                    print(f"MP3 file {object_name} already exists in S3. Loading now.")
                    next_song.mp3_url = f"https://s3.csh.rit.edu/{BUCKET_NAME}/{object_name}"
                    emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'MP3 file found. Preparing to play...'}, broadcast=True)
                    isPlaying = True
                except Exception:
                    print(f"MP3 file {object_name} not found in S3. It's being prepared.")
                    emit('message', {'action': 'spawnMessage', 'color': 'yellow', 'message': 'Preparing the next song, please wait...'}, broadcast=True)
                    isPlaying = False
                    return

            # Update the current playing song
            currentPlayingSong = next_song.to_dict()

            # Emit update to clients
            emit('updateCurrentSong', {'currentSong': currentPlayingSong}, broadcast=True)
            emit('message', {'action': 'next_song', 'nextSong': currentPlayingSong}, broadcast=True)

            isPlaying = True
        else:
            currentPlayingSong = None
            emit('message', {'action': 'queue_empty'}, room=request.sid)
            isPlaying = False
    else:
        currentPlayingSong = None
        emit('message', {'action': 'queue_empty'}, room=request.sid)
        isPlaying = False


def download_mp3_and_analyze(track_data, sid):
    try:
        # Create a temporary file to store the downloaded MP3
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp_file:
            tmp_filepath = tmp_file.name

        # yt-dlp options for downloading the best audio format
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': tmp_filepath,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,  # Suppress output
            'no_warnings': True,  # Suppress warnings
            'logger': logging.getLogger()  # Use logging for yt-dlp
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(track_data['uri'], download=True)

        # Analyze BPM with librosa
        bpm = analyze_bpm(tmp_filepath)
        track_data['bpm'] = bpm

        # Upload the file to S3 with metadata
        object_name = f"{track_data['track_id']}.mp3"
        with open(tmp_filepath, 'rb') as data:
            s3.upload_fileobj(data, BUCKET_NAME, object_name, ExtraArgs={"Metadata": {"bpm": str(bpm)}})

        logging.info(f"Uploaded {object_name} to S3 with BPM metadata: {bpm}")

        # Clean up local file
        os.remove(tmp_filepath)

        socketio.emit('mp3ReadyForPlayback', {'mp3_url': track_data['mp3_url'], 'track_data': track_data}, room=sid)
        socketio.emit('updateCurrentSong', {'currentSong': track_data}, room=sid)

    except Exception as e:
        logging.error(f"Error in download_mp3_and_analyze: {str(e)}")
        socketio.emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to download and analyze YouTube link: {str(e)}'}, room=sid)

def analyze_bpm(mp3_file):
    try:
        # Load the MP3 file and analyze the tempo
        y, sr = librosa.load(mp3_file, sr=None)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = tempo[0]  # If tempo is returned as an array, take the first value
        print(f"Analyzed BPM: {tempo}")
        return int(round(tempo))
    except Exception as e:
        print(f"Error analyzing BPM: {str(e)}")
        return 90  # Return a default BPM if analysis fails

def get_cat_colors():
    base_path = os.path.join('static/img/cats')
    print(f"Base path: {base_path}")
    dirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    print(f"Cat colors: {dirs}")
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
        ydl_opts = {}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(youtube_link, download=False)
            track_name = info_dict.get('title', 'YouTube Video')
            artist_name = info_dict.get('uploader', 'Unknown Artist')
            track_length_seconds = info_dict.get('duration', 0)
            video_id = info_dict.get('id')
        
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
        emit_func('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to process YouTube link: {str(e)}'}, room=sid)
        return None

def get_youtube_playlist_tracks(link, default_bpm):
    tracks = []
    unsuccessful_count = 0

    try:
        ydl_opts = {
            'extract_flat': True,  # Do not download, only extract metadata
            'quiet': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            playlist_info = ydl.extract_info(link, download=False)
            for entry in playlist_info['entries']:
                video_link = f"https://www.youtube.com/watch?v={entry['id']}"
                track_data = parse_youtube_link(video_link, emit, request.sid)
                
                if track_data:
                    track_length_seconds = track_data['track_length']
                    if is_within_length_limit(track_length_seconds):
                        track_data['bpm'] = default_bpm if default_bpm else '90'  # Default to 90 if no BPM is provided
                        tracks.append(track_data)
                    else:
                        unsuccessful_count += 1
                else:
                    unsuccessful_count += 1

    except Exception as e:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to process YouTube playlist: {str(e)}'}, room=request.sid)

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
