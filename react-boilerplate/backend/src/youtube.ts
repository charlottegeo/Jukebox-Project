import { Song } from './interfaces';
import { v4 as uuidv4 } from 'uuid';
const youtubeSearchApi = require("youtube-search-api");
const ytdl = require('ytdl-core'); 

export const searchYouTube = async (query: string, limit = 5): Promise<Song[]> => {
    try {
        const result = await youtubeSearchApi.GetListByKeyword(query, false, limit, [{ type: 'video' }]);
        const videos = result.items.map((item: any) => ({
            track_name: item.title,
            artist_name: item.channelTitle || 'Unknown',
            track_length: item.length?.simpleText || 'Unknown',
            cover_url: item.thumbnail.thumbnails[0].url,
            track_id: item.id,
            bpm: 90,
            uri: `https://www.youtube.com/watch?v=${item.id}`,
            source: 'youtube' as const,
            id: uuidv4()
        }));

        return videos;
    } catch (error) {
        console.error('Error fetching YouTube search results:', error);
        return [];
    }
};

export const handleYouTubeLink = async (link: string): Promise<Song[]> => {
    try {
        let videoId: string | null = null;

        if (link.includes('watch?v=')) {
            videoId = link.split('watch?v=')[1].split('&')[0];
        } else if (link.includes('youtu.be/')) {
            videoId = link.split('youtu.be/')[1].split('?')[0];
        }

        if (videoId) {
            const videoDetails = await youtubeSearchApi.GetVideoDetails(videoId);
            console.log('Video details:', videoDetails);
            const videoInfo = await ytdl.getInfo(videoId);
            const duration = videoInfo.videoDetails.lengthSeconds; // Get duration in seconds
            const formattedDuration = formatYouTubeDuration(duration); // Format into mm:ss
            return [{
                id: uuidv4(),
                track_name: videoDetails.title || 'Unknown Title',
                artist_name: videoDetails.channel || videoDetails.shortBylineText || 'Unknown Artist',
                track_length: formattedDuration,
                cover_url: videoDetails.thumbnail.thumbnails.sort((a: any, b: any) => b.width - a.width)[0].url,
                track_id: videoDetails.id,
                bpm: 90,
                uri: `https://www.youtube.com/watch?v=${videoDetails.id}`,
                source: 'youtube'
            }];
        } else if (link.includes('playlist?list=')) {
            const playlistId = link.split('playlist?list=')[1].split('&')[0];
            const playlistData = await youtubeSearchApi.GetPlaylistData(playlistId);
            const videos = playlistData.items;

            const songs: Song[] = await Promise.all(videos.map(async (item: any) => {
                const videoDetails = await youtubeSearchApi.GetVideoDetails(item.id);
                const videoInfo = await ytdl.getInfo(item.id);
                const duration = videoInfo.videoDetails.lengthSeconds; // Get duration in seconds
                const formattedDuration = formatYouTubeDuration(duration); // Format into mm:ss

                return {
                    id: uuidv4(),
                    track_name: item.title || 'Unknown Title',
                    artist_name: videoDetails.channel || item.shortBylineText || 'Unknown Artist',
                    track_length: formattedDuration,
                    cover_url: item.thumbnail.thumbnails[0]?.url || '',
                    track_id: item.id,
                    bpm: 90,
                    uri: `https://www.youtube.com/watch?v=${item.id}`,
                    source: 'youtube'
                };
            }));

            return songs;
        } else {
            throw new Error('Invalid YouTube link');
        }
    } catch (error) {
        console.error('Error handling YouTube link:', error);
        throw error;
    }
};

const formatYouTubeDuration = (duration: string): string => {
    const seconds = parseInt(duration, 10);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
