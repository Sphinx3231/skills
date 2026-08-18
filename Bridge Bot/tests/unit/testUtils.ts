import { EventEmitter } from "node:events";

/**
 * A fake writable stdin whose write() we fully control, so tests can force
 * backpressure (write() returning false) and then manually fire 'drain'.
 */
export class FakeStdin extends EventEmitter {
  writes: string[] = [];
  ended = false;
  /** When set, the next write() call returns this and is then reset to true. */
  private nextWriteReturnsOk = true;

  write(chunk: string): boolean {
    this.writes.push(chunk);
    const ok = this.nextWriteReturnsOk;
    this.nextWriteReturnsOk = true;
    return ok;
  }

  end() {
    this.ended = true;
  }

  forceNextWriteToBlock() {
    this.nextWriteReturnsOk = false;
  }
}

/** A minimal fake ChildProcess good enough for spawnGemini.ts's usage. */
export class FakeChildProcess extends EventEmitter {
  pid = 4242;
  stdin = new FakeStdin();
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  emitClose(exitCode: number | null) {
    this.emit("close", exitCode);
  }

  emitError(err: Error) {
    this.emit("error", err);
  }

  emitStdout(text: string) {
    this.stdout.emit("data", Buffer.from(text));
  }

  emitStderr(text: string) {
    this.stderr.emit("data", Buffer.from(text));
  }
}
