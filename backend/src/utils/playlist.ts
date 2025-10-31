import { getInfo } from 'ytdl-core';

interface YouTubeVideo {
  title: string;
  author: {
    name: string;
  } | string;
  videoId: string;
  thumbnails: Array<{
    url: string;
  }>;
}

export async function getPlaylistSongs(playlistUrl: string): Promise<any[]> {
  try {
    const info = await getInfo(playlistUrl);
    if (!info.related_videos) {
      throw new Error('No videos found in playlist');
    }
    return info.related_videos.map(video => {
      const videoId = video.id;
      return {
        track_name: video.title,
        artist_name: typeof video.author === 'string' ? video.author : video.author?.name || 'Unknown Artist',
        audioPath: `https://www.youtube.com/watch?v=${videoId}`,
        cover_image_url: video.thumbnails?.[0]?.url || '',
        submittedBy: 'Playlist Import'
      };
    });
  } catch (error) {
    console.error('Error getting playlist songs:', error);
    throw error;
  }
} 