// Updated in place; sampling diagnostics never causes a scene render.
export const renderMetrics = { fps: 0, frameMs: 0, slowFrames: 0, drawCalls: 0, liveBodies: 0, fallenBodies: 0, pooledBodies: 0, bodyCreations: 0 }
let seconds = 0, frames = 0, slow = 0
export function sampleFrame(delta: number, drawCalls: number) {
  seconds += delta; frames++; if (delta > 0.025) slow++
  if (seconds >= 1) {
    renderMetrics.fps = Math.round(frames / seconds); renderMetrics.frameMs = seconds * 1000 / frames
    renderMetrics.slowFrames = slow; renderMetrics.drawCalls = drawCalls
    seconds = 0; frames = 0; slow = 0
  }
}
