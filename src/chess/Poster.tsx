// Also present in index.html so the opening board can paint before JavaScript.
export function ChessPoster() {
  return <div className="chess-poster" aria-hidden="true">
    <img src={`${import.meta.env.BASE_URL}images/chess-poster.webp`} alt="" width={3072} height={3072} loading="eager" fetchPriority="high" decoding="sync" />
  </div>
}
