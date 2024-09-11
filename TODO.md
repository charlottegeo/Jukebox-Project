### YouTube Integration
- [ ] Make it so that when a youtube video is submitted, the initial bpm is 90.
    - [ ] When BPM analysis is done, update the bpm with this value.
    - [ ] Update cat animation to reflect new bpm while song is playing
- [X] Implement YouTube player embed (Fixed by replacing with Plyr)
    - [X] fix issue where Youtube player is not always ready
- [X] Remove MP3 player code, the only use for MP3/WAV is for BPM analysis
- [X] How to deal with YouTube songs being first in the queue (YouTube song being added to queue when player is currently empty), since YouTube songs take longer to analyze
- [ ] look into an api (NOT THE GOOGLE YOUTUBE ONE) to get search results for youtube videos
### Spotify Integration
- [ ] Check Spotify songs, albums, and playlists for song length limit
- [ ] See if it is possible to embed the Spotify website into the display page and log in, to prevent having to have the Spotify website open in another tab
- [ ] Figure out why songs don't always load and play (no apparent pattern, just inconsistent behavior)
    - [ ] ok this is an issue for both spotify and youtube
### Queue Management
- [ ] Make sure only 1 instance of display page can exist
    - [ ] Redirect user to search page if they try to go to display page
- [ ] Remove BPM input from queue items
- [ ] Fix issues with submission and reordering queue on mobile?
- [ ] Ask Jeremy and other admins (RTPS, eboard, etc.) what admin commands would be necessary
    - [ ] Take into consideration things like the individual queues and song length limit + stuff

### User Experience
- [ ] Persist user's cat color when page reloads
- [ ] Fix visual issues with message boxes (it shows up briefly after fading out then disappears again)
- [ ] Ask others: a skip button on the display, or vote-to-skip button on user page
- [ ] Fix issue where user queue and "current song" display on search page don't update visually when songs load/unload/change

### Visual Enhancements
- [ ] Add marquee effect to song title, artist name, and submitter name (if # of characters in text is > x, use marquee effect to ensure it fits in screen, maybe if it is greater than the length of the album image?)