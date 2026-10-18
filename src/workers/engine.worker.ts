import { handleEngineRequest, type EngineRequest } from '../engine/simulation/protocol';

self.onmessage = (event: MessageEvent<EngineRequest>) => {
  self.postMessage(handleEngineRequest(event.data));
};
