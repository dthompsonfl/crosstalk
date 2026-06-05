// This file owns the in-memory process state for joined local sessions, wake polling, and pipeline tracking.

import type { LocalSession, OpenCodeSessionClient } from './types';

export const joined = new Map<string, LocalSession>();
export const waking = new Set<string>();

// Track active pipeline IDs for this session
export const activePipelines = new Set<string>();

let poller: ReturnType<typeof setInterval> | undefined;
let client: OpenCodeSessionClient | undefined;

export function getPoller() {
  return poller;
}

export function setPoller(value: ReturnType<typeof setInterval> | undefined): void {
  poller = value;
}

export function getClient() {
  return client;
}

export function setClient(value: OpenCodeSessionClient | undefined): void {
  client = value;
}

export function resetForTests(): void {
  joined.clear();
  waking.clear();
  activePipelines.clear();
  client = undefined;

  if (!poller) {
    return;
  }

  clearInterval(poller);
  poller = undefined;
}
