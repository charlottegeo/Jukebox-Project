declare module 'youtube-search-api' {
    interface Thumbnail {
        url: string;
    }

    interface SearchResult {
        id: string;
        title: string;
        length?: {
            simpleText: string;
        };
        channelTitle: string;
        thumbnail: {
            thumbnails: Thumbnail[];
        };
    }

    interface VideoDetails {
        id: string;
        title: string;
        thumbnail: {
            url: string;
        };
        isLive: boolean;
        channel: string;
        channelId: string;
        description: string;
        keywords: string[];
    }

    interface SearchResponse {
        items: SearchResult[];
    }

    function GetListByKeyword(
        query: string,
        isPlaylist: boolean,
        limit: number,
        options: Array<{ type: string }>
    ): Promise<SearchResponse>;

    function GetPlaylistData(
        playlistId: string,
        limit?: number
    ): Promise<SearchResponse>;

    function GetVideoDetails(videoId: string): Promise<VideoDetails>;

    export {
        GetListByKeyword,
        GetPlaylistData,
        GetVideoDetails
    };
}
