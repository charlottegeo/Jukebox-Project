import pkg from 'ytdl-core';
const { getInfo } = pkg;

export async function getSongDuration(audioPath: string): Promise<number> {
  try {
    if (audioPath.includes('youtube.com') || audioPath.includes('youtu.be')) {
      const info = await getInfo(audioPath);
      return parseInt(info.videoDetails.lengthSeconds);
    }

    if (audioPath.includes('spotify')) {
      const lengthParts = audioPath.split(':');
      if (lengthParts.length === 2) {
        const minutes = parseInt(lengthParts[0]);
        const seconds = parseInt(lengthParts[1]);
        return (minutes * 60) + seconds;
      }
    }
    return 0;
  } catch (error) {
    console.error('Error getting song duration:', error);
    throw error;
  }
} 