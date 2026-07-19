'use client';

import { VideoDto } from '@/lib/api';

export function RetentionVideoSelector({
  videos,
  selectedVideoIds,
  onChange,
}: {
  videos: VideoDto[];
  selectedVideoIds: string[];
  onChange: (videoIds: string[]) => void;
}) {
  function toggle(videoId: string) {
    if (selectedVideoIds.includes(videoId)) {
      onChange(selectedVideoIds.filter((id) => id !== videoId));
    } else {
      onChange([...selectedVideoIds, videoId]);
    }
  }

  return (
    <ul className="selector-list">
      {videos.map((video) => (
        <li key={video.id}>
          <label className="selector-row">
            <input
              type="checkbox"
              checked={selectedVideoIds.includes(video.id)}
              onChange={() => toggle(video.id)}
            />
            <span>{video.title}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
