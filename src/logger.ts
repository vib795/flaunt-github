type Sink = (line: string) => void;
type Shower = (preserveFocus?: boolean) => void;

let sink: Sink = (msg) => {
  // Falls through to stderr until extension.ts wires a VS Code output channel.
   
  console.error(`[flaunt] ${msg}`);
};
let shower: Shower = () => undefined;

export function setLogSink(fn: Sink, show?: Shower): void {
  sink = fn;
  if (show) {shower = show;}
}

export function log(message: string): void {
  const time = new Date().toLocaleTimeString();
  sink(`[${time}] ${message}`);
}

export function logError(message: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  log(`${message}: ${reason}`);
}

export function showLogChannel(): void {
  shower(true);
}
