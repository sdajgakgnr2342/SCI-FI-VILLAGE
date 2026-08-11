/// <reference lib="webworker" />
import {
  InfiniteTerrain,
  buildChunkMeshBuffers,
  type BlockId,
  type ChunkLod,
  type ChunkMeshBuffers,
} from './chunkMeshApi'

export type ChunkMeshJobRequest = {
  jobId: number
  seed: number
  cx: number
  cz: number
  lod: ChunkLod
  overrides: { x: number; y: number; z: number; blockId: BlockId }[]
}

export type ChunkMeshJobResult = {
  jobId: number
  cx: number
  cz: number
  lod: ChunkLod
  buffers: ChunkMeshBuffers
}

function collectTransferables(buffers: ChunkMeshBuffers): Transferable[] {
  const list: Transferable[] = []
  const pushLayer = (layer: { pos: Float32Array; nor: Float32Array; col: Float32Array; idx: Uint32Array } | null) => {
    if (!layer) return
    list.push(layer.pos.buffer, layer.nor.buffer, layer.col.buffer, layer.idx.buffer)
  }
  pushLayer(buffers.solid)
  pushLayer(buffers.water)
  if (buffers.grass) {
    list.push(
      buffers.grass.pos.buffer,
      buffers.grass.nor.buffer,
      buffers.grass.uv.buffer,
      buffers.grass.idx.buffer
    )
  }
  return list
}

self.onmessage = (ev: MessageEvent<ChunkMeshJobRequest>) => {
  const { jobId, seed, cx, cz, lod, overrides } = ev.data
  const world = new InfiniteTerrain(seed)
  for (const o of overrides) {
    world.set(o.x, o.y, o.z, o.blockId)
  }
  const buffers = buildChunkMeshBuffers(world, cx, cz, lod)
  const result: ChunkMeshJobResult = { jobId, cx, cz, lod, buffers }
  ;(self as DedicatedWorkerGlobalScope).postMessage(result, collectTransferables(buffers))
}
