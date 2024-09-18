import youtubeSearchApi from 'youtube-search-api';
import { Song } from './interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Search YouTube based on a query.
 */
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

/**
 * Handle YouTube link: individual video or playlist.
 */
export const handleYouTubeLink = async (link: string): Promise<Song[]> => {
    try {
        if (link.includes('watch?v=')) {
            const videoId = link.split('watch?v=')[1];
            const videoDetails = await youtubeSearchApi.GetVideoDetails(videoId); // Use GetVideoDetails

            return [{
                id: uuidv4(),
                track_name: videoDetails.title || 'Unknown Title',
                artist_name: videoDetails.channel || 'Unknown Artist',
                track_length: 'Unknown',
                cover_url: videoDetails.thumbnail.url || '',
                track_id: videoDetails.id,
                bpm: 90,
                uri: `https://www.youtube.com/watch?v=${videoDetails.id}`,
                source: 'youtube'
            }];
        } else if (link.includes('playlist?list=')) {
            const playlistId = link.split('playlist?list=')[1];
            const playlistData = await youtubeSearchApi.GetPlaylistData(playlistId, 50); // Fetch up to 50 videos
            const videos = playlistData.items;

            const songs: Song[] = await Promise.all(videos.map(async (item: any) => {
                const videoDetails = await youtubeSearchApi.GetVideoDetails(item.id);
                return {
                    id: uuidv4(),
                    track_name: item.title || 'Unknown Title',
                    artist_name: videoDetails.channel || 'Unknown Artist',
                    track_length: item.length?.simpleText || 'Unknown',
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


/**
 * Format the video duration into mm:ss.
 */
const formatYouTubeDuration = (duration: string): string => {
    const seconds = parseInt(duration, 10);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
