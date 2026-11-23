import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, LatheGeometry, Plane, Shape, Vector2, Vector3 } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

// These geometries are built once and shared by every living and fallen piece.
export function knightHead() {
  // Draw the horse's side profile: x becomes forward (+z) after extrusion.
  const outline = new Shape()
  outline.moveTo(-0.14, 0); outline.lineTo(0.12, 0)
  outline.quadraticCurveTo(0.10, 0.16, 0.025, 0.29)
  outline.quadraticCurveTo(0.045, 0.36, 0.16, 0.38)
  outline.lineTo(0.33, 0.37)
  outline.quadraticCurveTo(0.39, 0.38, 0.385, 0.44)
  outline.lineTo(0.365, 0.52)
  outline.quadraticCurveTo(0.27, 0.54, 0.18, 0.60)
  outline.quadraticCurveTo(0.12, 0.67, 0.02, 0.66)
  outline.lineTo(-0.08, 0.64)
  outline.quadraticCurveTo(-0.18, 0.56, -0.19, 0.38)
  outline.quadraticCurveTo(-0.20, 0.18, -0.14, 0)
  outline.closePath()
  const ear = new Shape()
  ear.moveTo(-0.10, 0.61); ear.lineTo(-0.025, 0.62)
  ear.lineTo(-0.045, 0.80); ear.lineTo(-0.10, 0.74); ear.closePath()
  const extrude = (shape: Shape, depth: number) => new ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 6, bevelEnabled: true,
    bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2,
  }).translate(0, 0, -depth / 2).rotateY(-Math.PI / 2)
  const parts = [extrude(outline, 0.26), extrude(ear, 0.06).translate(-0.075, 0, 0), extrude(ear, 0.06).translate(0.075, 0, 0)]
  const raw = mergeGeometries(parts)!
  const geometry = mergeVertices(raw)
  parts.forEach(part => part.dispose()); raw.dispose()
  return geometry
}

export function queenCrown() {
  const outline = new Shape()
  outline.moveTo(-0.22, 0); outline.lineTo(0.22, 0); outline.lineTo(0.26, 0.36)
  outline.lineTo(0.10, 0.20); outline.lineTo(0, 0.47); outline.lineTo(-0.10, 0.20)
  outline.lineTo(-0.26, 0.36); outline.closePath()
  const raw = new ExtrudeGeometry(outline, { depth: 0.13, bevelEnabled: false, steps: 1 }).translate(0, 0, -0.065)
  const geometry = mergeVertices(raw); raw.dispose(); return geometry
}

// Clip a closed, convex mitre against a plane and close the cut with flat faces.
// Removing the thin band between two planes creates the bishop's actual notch.
function clipMitre(source: BufferGeometry, plane: Plane) {
  const mesh = source.toNonIndexed(), positions: number[] = [], normals: number[] = [], uvs: number[] = []
  const edges = new Map<string, Vector3>(), p = mesh.attributes.position, n = mesh.attributes.normal, uv = mesh.attributes.uv
  type Vertex = { p: Vector3; n: Vector3; uv: Vector2 }
  const read = (i: number): Vertex => ({ p: new Vector3().fromBufferAttribute(p, i), n: new Vector3().fromBufferAttribute(n, i), uv: new Vector2(uv.getX(i), uv.getY(i)) })
  const emit = (a: Vertex, b: Vertex, c: Vertex) => { for (const v of [a, b, c]) { positions.push(v.p.x, v.p.y, v.p.z); normals.push(v.n.x, v.n.y, v.n.z); uvs.push(v.uv.x, v.uv.y) } }
  for (let i = 0; i < p.count; i += 3) {
    const triangle = [read(i), read(i + 1), read(i + 2)], clipped: Vertex[] = []
    for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3], da = plane.distanceToPoint(a.p), db = plane.distanceToPoint(b.p)
      if (da >= 0) clipped.push(a)
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db), point = a.p.clone().lerp(b.p, t)
        clipped.push({ p: point, n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) })
        edges.set(`${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`, point)
      }
    }
    for (let j = 1; j < clipped.length - 1; j++) emit(clipped[0], clipped[j], clipped[j + 1])
  }
  const contour = [...edges.values()]
  if (contour.length >= 3) {
    const center = new Vector3(); contour.forEach(v => center.add(v)); center.divideScalar(contour.length)
    const normal = plane.normal.clone().negate(), u = new Vector3(0, 0, 1), v = normal.clone().cross(u).normalize()
    contour.sort((a, b) => Math.atan2(a.clone().sub(center).dot(v), a.clone().sub(center).dot(u)) - Math.atan2(b.clone().sub(center).dot(v), b.clone().sub(center).dot(u)))
    const vertex = (point: Vector3): Vertex => ({ p: point, n: normal, uv: new Vector2(point.dot(u), point.dot(v)) })
    for (let i = 0; i < contour.length; i++) emit(vertex(center), vertex(contour[i]), vertex(contour[(i + 1) % contour.length]))
  }
  mesh.dispose()
  const raw = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)).setAttribute('normal', new Float32BufferAttribute(normals, 3)).setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  const geometry = mergeVertices(raw); raw.dispose(); return geometry
}
export function bishopMitre() {
  const profile = [new Vector2(0, 0), new Vector2(0.10, 0), new Vector2(0.16, 0.09), new Vector2(0.19, 0.23), new Vector2(0.155, 0.36), new Vector2(0.08, 0.47), new Vector2(0, 0.55)]
  const raw = new LatheGeometry(profile, 24), normal = new Vector3(0.6, -0.8, 0)
  const a = clipMitre(raw, new Plane(normal, 0.328)), b = clipMitre(raw, new Plane(normal.clone().negate(), -0.352))
  const geometry = mergeGeometries([a, b])!; a.dispose(); b.dispose(); raw.dispose(); return geometry
}
