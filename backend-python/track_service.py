import yt_dlp
import os
import requests
import uuid
import logging
import urllib.parse
import asyncio
from typing import List, Optional
from spotify_scraper import SpotifyClient
from models import Song
from playwright.async_api import async_playwright

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

_CACHED_TOKEN = None
_TOKEN_EXPIRY = 0

#General functions
def download_audio(youtube_url: str) -> str:
    filename = f"{uuid.uuid4().hex}.m4a"
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    ytdl_opts = {
        "format": "m4a/bestaudio/best",
        "outtmpl": os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4().hex}.%(ext)s"),
    }

    with yt_dlp.YoutubeDL(ytdl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        final_path = ydl.prepare_filename(info)
        return final_path

def download_song(song: Song) -> str:
    url_to_download = song.uri
    
    if song.source == "spotify":
        if not song.youtube_uri:
            query = f"{song.track_name} {song.artist_name} audio"
            print(f"Finding YouTube equivalent for Spotify track: {query}")
            yt_results = search_youtube(query, limit=1)
            
            if yt_results:
                song.youtube_uri = yt_results[0]["uri"]
            else:
                raise Exception("Could not find a YouTube equivalent for this Spotify song.")
                
        url_to_download = song.youtube_uri

    print(f"Downloading audio from: {url_to_download}")
    return download_audio(url_to_download)

#YouTube functions
def search_youtube(query: str, limit: int = 5) -> List[dict]:
    ytdl_opts = {
        "format": "m4a/best",
        "noplaylist": True,
        "extract_flat": True,
    }

    with yt_dlp.YoutubeDL(ytdl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
        results = []
        for entry in info["entries"]:
            video_id = entry.get("id", "Unknown")
            duration = entry.get("duration", 0)
            if isinstance(duration, (int, float)):
                track_length = f"{int(duration // 60)}:{int(duration % 60):02d}"
            else:
                track_length = "00:00"
            thumbnails = entry.get("thumbnails", [])
            cover_url = thumbnails[-1].get('url', '') if thumbnails else entry.get('thumbnail', '')
            results.append({
                "id": video_id,
                "track_name": entry.get('title', 'Unknown Title'),
                "artist_name": entry.get('uploader', 'Unknown Artist'),
                "track_length": track_length,
                "cover_url": cover_url.split('?')[0],
                "uri": f"https://www.youtube.com/watch?v={video_id}",
                "source": "youtube",
                "track_id": video_id
            })
        return results

def handle_youtube_link(url: str) -> list[dict]:
    ydl_opts = {
        "format": "m4a/best",
        "extract_flat": True,
    }

    results = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        entries = info.get("entries", [info])

        for entry in entries:
            if not entry:
                continue

            video_id = entry.get("id", "Unknown")
            duration = entry.get("duration", 0)
            if isinstance(duration, (int, float)):
                track_length = f"{int(duration // 60)}:{int(duration % 60):02d}"
            else:
                track_length = "00:00"
            thumbnails = entry.get("thumbnails", [])
            cover_url = thumbnails[-1].get('url', '') if thumbnails else entry.get('thumbnail', '')
            results.append({
                "id": video_id,
                "track_name": entry.get('title', 'Unknown Title'),
                "artist_name": entry.get('uploader', 'Unknown Artist'),
                "track_length": track_length,
                "cover_url": cover_url.split('?')[0],
                "uri": f"https://www.youtube.com/watch?v={video_id}",
                "source": "youtube",
                "track_id": video_id
            })
    return results

#Spotify functions
async def search_spotify(query: str, limit: int = 5) -> List[dict]:
    results = []
    encoded_query = urllib.parse.quote(query)
    search_url = f"https://open.spotify.com/search/{encoded_query}/tracks"

    print(f"Scraping Spotify UI for tracks: {query}")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_selector('a[href^="/track/"]', timeout=5000)
            except Exception as timeout_err:
                print(f"Timeout waiting for UI to load: {timeout_err}")

            track_urls = await page.evaluate(f"""
                () => {{
                    const urls = [];
                    const links = Array.from(document.querySelectorAll('a[href^="/track/"]'));
                    for (let link of links) {{
                        if (link.href && !urls.includes(link.href)) {{
                            urls.push(link.href);
                            if (urls.length >= {limit}) break;
                        }}
                    }}
                    return urls;
                }}
            """)
            await browser.close()

            print(f"Found URLs: {track_urls}. Extracting metadata...")

            for url in track_urls:
                track_data = await asyncio.to_thread(handle_spotify_link, url)
                if track_data:
                    results.extend(track_data)

    except Exception as e:
        print(f"UI Scraper search failed: {e}")

    return results

def _format_spotify_track(track_data: dict, fallback_cover: str = "") -> dict:
    duration_ms = track_data.get("duration_ms", 0)
    seconds = duration_ms // 1000
    track_length = f"{seconds // 60}:{seconds % 60:02d}"

    artists = track_data.get("artists", [])
    artist_name = artists[0].get("name", "Unknown Artist") if artists else "Unknown Artist"

    album = track_data.get("album", {})
    images = album.get("images", []) if isinstance(album, dict) else []
    cover_url = images[0].get("url", fallback_cover) if images else fallback_cover

    track_id = track_data.get("id", "Unknown")

    return {
        "id": uuid.uuid4().hex,
        "track_name": track_data.get('name', 'Unknown Title'),
        "artist_name": artist_name,
        "track_length": track_length,
        "cover_url": cover_url,
        "track_id": track_id,
        "uri": track_data.get('uri', f"spotify:track:{track_id}"),
        "source": "spotify"
    }

def handle_spotify_link(url: str) -> list[dict]:
    client = SpotifyClient(browser_type="requests")
    results = []

    try:
        if "track" in url:
            data = client.get_track_info(url)
            results.append(_format_spotify_track(data))
        elif "album" in url:
            data = client.get_album_info(url)
            album_cover = data.get("images", [{}])[0].get("url", "")
            for track in data.get("tracks", []):
                results.append(_format_spotify_track(track, album_cover))
        elif "playlist" in url:
            data = client.get_playlist_info(url)
            for item in data.get("tracks", []):
                track_data = item.get("track", item)
                results.append(_format_spotify_track(track_data))
    except Exception as e:
        print(f"Spotify extraction error: {e}")
    
    return results

