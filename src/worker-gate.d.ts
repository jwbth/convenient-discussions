declare module './worker/worker-gate' {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}

export {};
