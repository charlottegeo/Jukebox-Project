from typing import Optional, List
from pydantic import BaseModel
import time

class TempoPoint(BaseModel):
    time: float
    bpm: float

class Song(BaseModel):
    id: str
    track_name: str
    artist_name: str
    track_length: str
    cover_url: str
    track_id: str
    uri: str
    source: str
    bpm: Optional[float] = None
    tempo_map: Optional[List[TempoPoint]] = None
    submitter_uid: str
    audio_path: Optional[str] = None
    youtube_uri: Optional[str] = None

class UserState(BaseModel):
    color: str = "White"
    admin: bool = False
    last_active: float = time.time()

class SongLengthLimits(BaseModel):
    max_length: int = 600
    min_length: int = 0