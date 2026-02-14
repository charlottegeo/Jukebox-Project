import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

let essentiaInstance: any = null;

const getEssentiaInstance = async (): Promise<any> => {
  if (!essentiaInstance) {
    const { Essentia, EssentiaWASM } = await import('essentia.js');
    const EssentiaClass = (Essentia as any).Essentia || Essentia;
    essentiaInstance = new EssentiaClass(EssentiaWASM);
  }
  return essentiaInstance;
};

const correctHarmonicError = (bpm: number, averageBpm: number): number => {
  const ratios = [0.5, 1.5, 2.0];
  const tolerance = 0.05;
  
  for (const ratio of ratios) {
    const expectedBpm = averageBpm * ratio;
    const difference = Math.abs(bpm - expectedBpm);
    const toleranceValue = averageBpm * tolerance;
    
    if (difference < toleranceValue && Math.abs(bpm - averageBpm) > 15) {
      return averageBpm;
    }
  }
  
  return bpm;
};

export const analyzeBPM = async (audioPathOrLocalPath: string): Promise<{ bpm: number; tempoMap: { time: number; bpm: number }[] }> => {
  const essentia = await getEssentiaInstance();
  
  let localPath: string;
  
  if (audioPathOrLocalPath.includes('/api/stream/') || audioPathOrLocalPath.startsWith('http')) {
    let filename: string;
    try {
      const url = new URL(audioPathOrLocalPath, 'http://localhost');
      filename = path.basename(url.pathname);
    } catch {
      const pathWithoutQuery = audioPathOrLocalPath.split('?')[0];
      filename = path.basename(pathWithoutQuery);
    }
    localPath = path.join('/app/downloads', filename);
  } else if (audioPathOrLocalPath.startsWith('/downloads/')) {
    const filename = path.basename(audioPathOrLocalPath);
    localPath = path.join('/app/downloads', filename);
  } else {
    localPath = audioPathOrLocalPath;
  }

  const tempFile = `/tmp/full_analysis_${Date.now()}.raw`;
  await execAsync(`ffmpeg -i "${localPath}" -ac 1 -ar 22050 -f s16le "${tempFile}" -y 2>/dev/null`);

  const buffer = fs.readFileSync(tempFile);
  const samples = new Int16Array(buffer.buffer);
  const floatSamples = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) floatSamples[i] = samples[i] / 32768.0;
  fs.unlinkSync(tempFile);

  const sampleRate = 22050;
  const thirtySecs = sampleRate * 30;
  const totalSamples = floatSamples.length;
  const totalDuration = totalSamples / sampleRate;
  
  const bpmSamples: number[] = [];
  
  if (totalSamples >= thirtySecs) {
    const startVector = essentia.arrayToVector(floatSamples.subarray(0, thirtySecs));
    const startBpm = Math.round(essentia.PercivalBpmEstimator(startVector).bpm || 120);
    startVector.delete();
    bpmSamples.push(startBpm);
  }
  
  if (totalDuration >= 60) {
    const middleStart = Math.floor((totalSamples - thirtySecs) / 2);
    const middleVector = essentia.arrayToVector(floatSamples.subarray(middleStart, middleStart + thirtySecs));
    const middleBpm = Math.round(essentia.PercivalBpmEstimator(middleVector).bpm || 120);
    middleVector.delete();
    bpmSamples.push(middleBpm);
  }
  
  if (totalSamples >= thirtySecs) {
    const endStart = totalSamples - thirtySecs;
    const endVector = essentia.arrayToVector(floatSamples.subarray(endStart));
    const endBpm = Math.round(essentia.PercivalBpmEstimator(endVector).bpm || 120);
    endVector.delete();
    bpmSamples.push(endBpm);
  }
  
  bpmSamples.sort((a, b) => a - b);
  const averageBpm = bpmSamples.length > 0 
    ? bpmSamples[Math.floor(bpmSamples.length / 2)]
    : 120;

  const tempoMap: { time: number; bpm: number }[] = [];
  const segmentLength = 15 * sampleRate;
  const thirtySecsInSamples = 30 * sampleRate;
  let previousBpm = averageBpm;
  
  for (let i = 0; i < floatSamples.length; i += segmentLength) {
    const segmentEnd = Math.min(i + segmentLength, floatSamples.length);
    const segment = floatSamples.subarray(i, segmentEnd);
    const segmentTime = i / sampleRate;
    
    if (segment.length < segmentLength * 0.5) break;
    
    const vec = essentia.arrayToVector(segment);
    const detectedBpm = Math.round(essentia.PercivalBpmEstimator(vec).bpm || averageBpm);
    vec.delete();
    
    let correctedBpm = detectedBpm;
    if (i >= thirtySecsInSamples) {
      correctedBpm = correctHarmonicError(detectedBpm, averageBpm);
    }
    
    if (i === 0) {
      tempoMap.push({ time: 0, bpm: correctedBpm });
      previousBpm = correctedBpm;
    } else if (Math.abs(correctedBpm - previousBpm) > 1) {  
      tempoMap.push({ time: segmentTime, bpm: correctedBpm });
      previousBpm = correctedBpm;
    }
  }

  return { bpm: averageBpm, tempoMap };
};
