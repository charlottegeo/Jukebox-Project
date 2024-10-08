### General Integration
- [ ] Implement authenticated_only for the following:
    - [ ] Searching for tracks

### YouTube Integration
- [X] Make it so that when a youtube video is submitted, the initial bpm is 90.
    - [X] When BPM analysis is done, update the bpm with this value.
    - [ ] Update cat animation to reflect new bpm while song is playing
- [ ] look into an api (NOT THE GOOGLE YOUTUBE ONE) to get search results for youtube videos in the same way as Spotify (top 5 results, show it in the dropdown)
- [ ] fix issue with plyr where
    - [ ] the progress bar is not updated properly
    - [ ] the song does not unload after the song is finished - it seems that the on_ended event is not triggered
### Spotify Integration
- [ ] Check Spotify songs, albums, and playlists for song length limit
### Queue Management
- [ ] Make sure only 1 instance of display page can exist
    - [ ] Redirect user to search page if they try to go to display page
- [ ] Fix issues with submission and reordering queue on mobile?
- [ ] Ask Jeremy and other admins (RTPS, eboard, etc.) what admin commands would be necessary
    - [ ] Take into consideration things like the individual queues and song length limit + stuff

### User Experience
- [ ] Persist user's cat color when page reloads
    - [ ] Make it so if a user's song is playing and they change their color during that song playback, the cat color changes on the display page
- [ ] Fix visual issues with message boxes (it shows up briefly after fading out then disappears again)
- [ ] Ask others: a skip button on the display, or vote-to-skip button on user page
- [ ] Fix issue where user queue and "current song" display on search page don't update visually when songs load/unload/change

### Visual Enhancements
- [ ] Add marquee effect to song title, artist name, and submitter name (if # of characters in text is > x, use marquee effect to ensure it fits in screen, maybe if it is greater than the length of the album image?)
