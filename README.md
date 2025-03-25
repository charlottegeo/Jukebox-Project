# CatJam

An online jukebox application for creating a collaborative music queue through a round-robin system.
Made with React and NodeJS.

Developed by Charlotte George, Matt Marafino, Saavan Tandon, and Jinna Smail as part of the CSHacks and Opcommathon hackathons.

Available at [catjam.csh.rit.edu](catjam.csh.rit.edu). Note: The site is behind authentication and is only available to CSH members.

## Features
- Search for songs + add songs and playlists to a personal queue
- Round-robin queue system
- Manage queues in admin panel
- Spotify API and YouTube API integration
- Updates queue in real time for users
- Real-time BPM analysis

## Installation

In your terminal, clone into the repo.

Fill in the docker-compose.yml with your credentials.
Reach out to an RTP to get OIDC credentials to enable CSH authentication.
Replace the `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` values with your Spotify client ID and secret.

To get your client ID and secret, head to https://developer.spotify.com/dashboard and make a new app. When you're done, go to Settings to find your ID and secret. In order for your creds to work properly in dev, you'll need to add `http://localhost:8080/callback` to the Redirect URIs in your Spotify app settings.


## Usage

To run the server locally, make sure you have Docker and Docker Compose installed. Then, run `docker-compose up --build` in the root directory of the project. The server will be running on localhost:8080.
