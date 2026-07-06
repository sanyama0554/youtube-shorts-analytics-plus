import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;

export interface YoutubeVideoSummary {
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  privacyStatus: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface YoutubeChannelListResponse {
  items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
}

interface YoutubePlaylistItemsResponse {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
}

interface YoutubeVideoListResponse {
  items?: {
    id: string;
    snippet: { title: string; publishedAt: string };
    status: { privacyStatus: string };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
}

@Injectable()
export class YoutubeApiService {
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('YOUTUBE_API_KEY');
  }

  // params(APIキー含む)がエラーオブジェクトごとログに出力されるのを防ぐため、
  // axiosの生エラーはここで握りつぶし、整形済みメッセージのみを投げる。
  private async request<T>(url: string, params: Record<string, unknown>): Promise<T> {
    try {
      const { data } = await firstValueFrom(this.httpService.get<T>(url, { params }));
      return data;
    } catch (error) {
      if (isAxiosError(error)) {
        throw new Error(
          `YouTube API request failed: ${error.response?.status ?? 'unknown status'} ${error.response?.statusText ?? ''}`.trim(),
        );
      }
      throw error;
    }
  }

  async getUploadsPlaylistId(channelId: string): Promise<string> {
    const data = await this.request<YoutubeChannelListResponse>(`${YOUTUBE_API_BASE_URL}/channels`, {
      part: 'contentDetails',
      id: channelId,
      key: this.apiKey,
    });

    const uploadsPlaylistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new Error(`uploads playlist not found for channel ${channelId}`);
    }
    return uploadsPlaylistId;
  }

  async listAllVideoIds(uploadsPlaylistId: string): Promise<string[]> {
    const videoIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const data = await this.request<YoutubePlaylistItemsResponse>(`${YOUTUBE_API_BASE_URL}/playlistItems`, {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: PAGE_SIZE,
        pageToken,
        key: this.apiKey,
      });

      for (const item of data.items ?? []) {
        if (item.contentDetails?.videoId) {
          videoIds.push(item.contentDetails.videoId);
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return videoIds;
  }

  async getVideoDetails(videoIds: string[]): Promise<YoutubeVideoSummary[]> {
    const results: YoutubeVideoSummary[] = [];

    for (let i = 0; i < videoIds.length; i += PAGE_SIZE) {
      const chunk = videoIds.slice(i, i + PAGE_SIZE);
      const data = await this.request<YoutubeVideoListResponse>(`${YOUTUBE_API_BASE_URL}/videos`, {
        part: 'snippet,statistics,status',
        id: chunk.join(','),
        key: this.apiKey,
      });

      for (const item of data.items ?? []) {
        results.push({
          youtubeVideoId: item.id,
          title: item.snippet.title,
          publishedAt: item.snippet.publishedAt,
          privacyStatus: item.status.privacyStatus,
          // いいね数が非公開設定の動画はstatistics.likeCountが返らないため0扱いにする
          viewCount: Number(item.statistics.viewCount ?? 0),
          likeCount: Number(item.statistics.likeCount ?? 0),
          commentCount: Number(item.statistics.commentCount ?? 0),
        });
      }
    }

    return results;
  }

  async fetchAllVideos(channelId: string): Promise<YoutubeVideoSummary[]> {
    const uploadsPlaylistId = await this.getUploadsPlaylistId(channelId);
    const videoIds = await this.listAllVideoIds(uploadsPlaylistId);
    return this.getVideoDetails(videoIds);
  }
}
