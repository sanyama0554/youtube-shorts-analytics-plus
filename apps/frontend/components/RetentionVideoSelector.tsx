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
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto' }}>
      {videos.map((video) => (
        <li key={video.id} style={{ borderBottom: '1px solid #eee' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
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
