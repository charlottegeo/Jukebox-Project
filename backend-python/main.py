from fastapi import FastAPI, Query, Request, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
import os

from models import Song
from state import jukebox
from track_service import search_youtube, search_spotify, handle_spotify_link, handle_youtube_link, download_song

app = FastAPI()

clients = set()

class LinkRequest(BaseModel):
    link: str
    submitter_uid: str

async def broadcast_state():
    state_data = {
        "is_playing": jukebox.is_playing,
        "current_song": jukebox.current_song.model_dump() if jukebox.current_song else None,
        "user_order": jukebox.user_order,
        "queues": {uid: [s.model_dump() for s in q] for uid, q in jukebox.user_queues.items()}
    }

    for client in clients:
        await client.put({
            "event": "queue_updated",
            "data": json.dumps(state_data)
        })

async def trigger_preload():
    songs_to_check = []
    
    if jukebox.current_song and not jukebox.current_song.audio_path:
        songs_to_check.append(jukebox.current_song)
    
    next_song = jukebox.peek_next_song()
    if next_song and not next_song.audio_path:
        songs_to_check.append(next_song)
        
    for song in songs_to_check:
        if song.audio_path == "downloading...":
            continue
            
        song.audio_path = "downloading..."
        await broadcast_state()
        
        try:
            local_path = await asyncio.to_thread(download_song, song)
            
            filename = os.path.basename(local_path)
            song.audio_path = f"/api/stream-audio/{filename}"
            
            print(f"Download complete: {song.track_name}")
            await broadcast_state()
            
        except Exception as e:
            print(f"Failed to download {song.track_name}: {e}")
            song.audio_path = None 
            await broadcast_state()

@app.get("/api/stream")
async def stream_state(request: Request):
    client_queue = asyncio.Queue()
    clients.add(client_queue)

    async def event_generator():
        try:
            await broadcast_state()
            while True:
                if await request.is_disconnected():
                    break
                message = await client_queue.get()
                yield message
        except Exception as e:
            print(f"Error streaming state: {e}")
        finally:
            clients.remove(client_queue)
    return EventSourceResponse(event_generator())

@app.get("/api/search")
async def search_tracks(q: str, source: str = "youtube"):
    if source == "youtube":
        results = search_youtube(q, limit=5)
        return {"status": "success", "results": results}

    #spotify search is not possible because the API is paid now
    #but i am keeping the if statement in case that changes or I add other sources later
    elif source == "spotify":
        results = await search_spotify(q, limit=5)
        return {"status": "success", "results": results}
    else:
        return {"status": "error", "message": "Invalid source"}

@app.get("/api/stream-audio/{filename}")
async def stream_audio(filename: str):
    file_path = os.path.join("downloads", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="audio/mp4")
    return {"status": "error", "message": "File not found"}

@app.post("/api/queue")
async def add_to_queue(song: Song, background_tasks: BackgroundTasks):
    jukebox.add_song(song.submitter_uid, song)

    if not jukebox.is_playing:
        jukebox.advance_queue()
    
    background_tasks.add_task(trigger_preload)
    await broadcast_state()
    return {"status": "success", "message": "Song added to queue"}

@app.post("/api/add_link")
async def add_link_to_queue(request: LinkRequest, background_tasks: BackgroundTasks):
    songs = []
    try:
        if "youtube.com" in request.link or "youtu.be" in request.link:
            songs = handle_youtube_link(request.link)
        elif "spotify.com" in request.link:
            songs = handle_spotify_link(request.link)
        else:
            return {"status": "error", "message": "Unsupported link type"}
    except Exception as e:
        return {"status": "error", "message": f"Error processing link: {str(e)}"}
    
    added_count = 0
    for song_data in songs:
        song_data["submitter_uid"] = request.submitter_uid
        try:
            song = Song(**song_data)
            jukebox.add_song(request.submitter_uid, song)
            added_count += 1
        except Exception as e:
            print(f"Error adding song to queue: {str(e)}")
    
    if not jukebox.is_playing and added_count > 0:
        jukebox.advance_queue()
    
    background_tasks.add_task(trigger_preload)
    
    await broadcast_state()
    return {"status": "success", "added_count": added_count}

@app.post("/api/skip")
async def force_skip(background_tasks: BackgroundTasks):
    jukebox.advance_queue()
    background_tasks.add_task(trigger_preload)
    await broadcast_state()
    return {"status": "success", "message": "Queue advanced"}
