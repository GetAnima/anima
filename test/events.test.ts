import { describe, it, expect } from 'vitest';
import { AnimaEventEmitter } from '../src/events';

describe('AnimaEventEmitter', () => {
  it('should emit and receive events', async () => {
    const emitter = new AnimaEventEmitter();
    let received: any = null;
    emitter.on('afterWake', (data) => { received = data; });
    await emitter.emit('afterWake', { sessionId: 'test', bootTimeMs: 100, memoriesLoaded: 5 });
    expect(received).toEqual({ sessionId: 'test', bootTimeMs: 100, memoriesLoaded: 5 });
  });

  it('should support once()', async () => {
    const emitter = new AnimaEventEmitter();
    let count = 0;
    emitter.once('autoSave', () => { count++; });
    await emitter.emit('autoSave', { savedAt: 'now', memoriesCount: 1 });
    await emitter.emit('autoSave', { savedAt: 'now', memoriesCount: 1 });
    expect(count).toBe(1);
  });

  it('should return unsubscribe function', async () => {
    const emitter = new AnimaEventEmitter();
    let count = 0;
    const unsub = emitter.on('afterSleep', () => { count++; });
    await emitter.emit('afterSleep', { sessionId: 'x', memoriesCreated: 0, memoriesDecayed: 0 });
    unsub();
    await emitter.emit('afterSleep', { sessionId: 'x', memoriesCreated: 0, memoriesDecayed: 0 });
    expect(count).toBe(1);
  });

  it('should handle errors in handlers without breaking', async () => {
    const emitter = new AnimaEventEmitter();
    let secondRan = false;
    emitter.on('afterWake', () => { throw new Error('boom'); });
    emitter.on('afterWake', () => { secondRan = true; });
    await emitter.emit('afterWake', { sessionId: 'x', bootTimeMs: 0, memoriesLoaded: 0 });
    expect(secondRan).toBe(true);
  });

  it('should removeAll handlers', async () => {
    const emitter = new AnimaEventEmitter();
    let count = 0;
    emitter.on('afterWake', () => { count++; });
    emitter.on('afterSleep', () => { count++; });
    emitter.removeAll();
    await emitter.emit('afterWake', { sessionId: 'x', bootTimeMs: 0, memoriesLoaded: 0 });
    await emitter.emit('afterSleep', { sessionId: 'x', memoriesCreated: 0, memoriesDecayed: 0 });
    expect(count).toBe(0);
  });
});
