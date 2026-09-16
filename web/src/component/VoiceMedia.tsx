export function VoiceMedia({jobId, stamp}: {jobId: string; stamp: string}) {
  return (
    <div className="final-media voice-media">
      <div className="produce-head">口播声音</div>
      <audio controls src={`/api/jobs/${jobId}/voice.mp3?t=${stamp}`} />
      <div className="final-downloads">
        <a className="btn ghost" href={`/api/jobs/${jobId}/voice.mp3`} download>
          下载 MP3
        </a>
      </div>
    </div>
  );
}
