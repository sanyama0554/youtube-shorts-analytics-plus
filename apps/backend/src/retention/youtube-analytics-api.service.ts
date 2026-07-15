import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const ANALYTICS_API_BASE_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

export interface RetentionPointData {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
  relativeRetentionPerformance: number;
}

interface AnalyticsReportResponse {
  rows?: number[][];
}

@Injectable()
export class YoutubeAnalyticsApiService {
  constructor(private readonly httpService: HttpService) {}

  // dimensions=elapsedVideoTimeRatio, metrics=audienceWatchRatio,relativeRetentionPerformanceの順で
  // rowsが返るため、その順でパースする。動画1本につき最大100点。
  async getAudienceRetention(
    youtubeVideoId: string,
    startDate: string,
    accessToken: string,
  ): Promise<RetentionPointData[]> {
    const endDate = new Date().toISOString().slice(0, 10);
    const data = await this.request<AnalyticsReportResponse>(
      {
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'audienceWatchRatio,relativeRetentionPerformance',
        dimensions: 'elapsedVideoTimeRatio',
        filters: `video==${youtubeVideoId}`,
      },
      accessToken,
    );

    return (data.rows ?? []).map(([elapsedVideoTimeRatio, audienceWatchRatio, relativeRetentionPerformance]) => ({
      elapsedVideoTimeRatio,
      audienceWatchRatio,
      relativeRetentionPerformance,
    }));
  }

  // paramsやレスポンスにトークンが含まれるため、axiosの生エラーはそのままログ/例外に出さない
  private async request<T>(params: Record<string, string>, accessToken: string): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<T>(ANALYTICS_API_BASE_URL, {
          params,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return data;
    } catch (error) {
      if (isAxiosError(error)) {
        throw new Error(
          `YouTube Analytics API request failed: ${error.response?.status ?? 'unknown status'} ${error.response?.statusText ?? ''}`.trim(),
        );
      }
      throw error;
    }
  }
}
