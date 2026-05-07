from typing import Dict, List, Optional
from models import Song, UserState

class JukeboxState:
    def __init__(self):
        self.user_queues: Dict[str, List[Song]] = {}
        self.user_states: Dict[str, UserState] = {}
        self.user_order: List[str] = []
        self.current_song: Optional[Song] = None
        self.is_playing: bool = False

    def add_song(self, uid: str, song: Song):
        if uid not in self.user_queues:
            self.user_queues[uid] = []
        
        song.submitter_uid = uid
        self.user_queues[uid].append(song)

        if uid not in self.user_order:
            self.user_order.append(uid)
    
    def _move_user_to_back(self, uid: str):
        if uid in self.user_order:
            self.user_order.remove(uid)
            self.user_order.append(uid)
    
    def _get_next_song(self) -> Optional[Song]:
        for uid in self.user_order:
            if uid in self.user_queues and len(self.user_queues[uid]) > 0:
                return self.user_queues[uid].pop(0)
        return None
    
    def peek_next_song(self) -> Optional[Song]:
        for uid in self.user_order:
            if uid in self.user_queues and len(self.user_queues[uid]) > 0:
                return self.user_queues[uid][0]
        return None
        
    def advance_queue(self) -> Optional[Song]:
        if self.current_song:
            self._move_user_to_back(self.current_song.submitter_uid)
        next_song = self._get_next_song()

        if next_song:
            self.current_song = next_song
            self.is_playing = True
        else:
            self.current_song = None
            self.is_playing = False
        return next_song
    
jukebox = JukeboxState()