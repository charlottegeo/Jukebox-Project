declare module 'essentia.js' {
  export interface VectorFloat {
    delete(): void;
    size(): number;
    get(index: number): number;
    push_back(value: number): void;
  }

  export class Essentia {
    constructor(wasmModule: any);
    arrayToVector(data: Float32Array): VectorFloat;
    PercivalBpmEstimator(audioData: VectorFloat): { bpm: number };
    [key: string]: any;
  }

  export const EssentiaWASM: any;
  export default Essentia;
}