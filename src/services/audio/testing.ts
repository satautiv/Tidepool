/** A mocked AudioContext for tests: records nodes, starts, stops and parameter changes. */

export class FakeParam {
  value: number;
  events: Array<[string, ...number[]]> = [];
  constructor(value = 1) {
    this.value = value;
  }
  cancelScheduledValues(t: number) {
    this.events.push(['cancel', t]);
  }
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    this.value = v;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['ramp', v, t]);
    this.value = v;
  }
}

export class FakeNode {
  connections: unknown[] = [];
  connect(to: unknown) {
    this.connections.push(to);
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  started: number | null = null;
  stopped: number | null = null;
  start(t = 0) {
    this.started = t;
  }
  stop(t = 0) {
    this.stopped = t;
  }
  /** Simulates the sound finishing. */
  end() {
    this.onended?.();
  }
}

export class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  resumes = 0;
  suspends = 0;
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => data };
  }
  async decodeAudioData(data: ArrayBuffer) {
    return { decoded: data.byteLength };
  }
  async resume() {
    this.resumes++;
    this.state = 'running';
  }
  async suspend() {
    this.suspends++;
    this.state = 'suspended';
  }
}
