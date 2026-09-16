import {jobCoverUrl} from '../api';

export function FinalMedia({
  jobId,
  stamp,
  orientation,
  hasCover,
}: {
  jobId: string;
  stamp: string;
  orientation: string;
  hasCover?: boolean;
}) {
  const cover = jobCoverUrl(jobId, stamp);
  return (
    <div className={`final-media ${orientation}`}>
      {hasCover ? (
        <div className={`cover-row ${orientation}`}>
          <figure className={`cover-wrap ${orientation}`}>
            <img src={cover} alt="成片主图" />
          </figure>
          <div>
            <div className="produce-head">成片主图</div>
            <p className="hint">生成成片时从片头截出，可当作抖音、视频号、小红书封面。</p>
          </div>
        </div>
      ) : null}
      <div className={`video-wrap ${orientation}`}>
        <video controls poster={hasCover ? cover : undefined} src={`/api/jobs/${jobId}/final.mp4?t=${stamp}`} />
      </div>
      <div className="final-downloads">
        <a className="btn" href={`/api/jobs/${jobId}/final.mp4`} download>
          下载 MP4
        </a>
        {hasCover ? (
          <a className="btn ghost" href={cover} download>
            下载主图
          </a>
        ) : null}
      </div>
    </div>
  );
}
