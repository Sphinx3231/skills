/**
 * @jest-environment jsdom
 */
// Ticket 011's +html.tsx has two independently-testable parts:
//   1. The `Root` component — a plain function component returning plain
//      React elements (<html>/<head>/<body>), no native modules involved.
//      Calling it directly (it's just a function) and walking the returned
//      element tree needs no renderer/dependency at all.
//   2. `CLIP_LOADER_SCRIPT` — a string of ES-module source that only ever
//      runs as literal HTML in a real browser. It's exported solely so this
//      file can run its logic directly: strip the CDN `import` line (which
//      Jest/jsdom can't resolve — it's a network fetch by design, see the
//      file's own header comment) and eval the rest with a mock `pipeline`
//      standing in for the real transformers.js export. This exercises the
//      exact success/failure branches a real browser would hit, without
//      needing a real CDN fetch or a real ONNX/WASM model.
import * as React from 'react';
import Root, { CLIP_LOADER_SCRIPT } from '../+html';

function runLoaderScript(pipelineImpl: (...args: any[]) => Promise<any>) {
  const body = CLIP_LOADER_SCRIPT.replace(/^\s*import[^\n]*\n/, '');
  // `window` and `CustomEvent` are ambient globals under the jsdom test
  // environment, exactly as they are in a real browser — the eval'd body
  // references them the same way the real CDN script does, unmodified.
  const run = new Function('pipeline', body);
  run(pipelineImpl);
}

beforeEach(() => {
  delete (window as any).__foxbiteClipPipeline;
  delete (window as any).__foxbiteClipPipelineReady;
  delete (window as any).__foxbiteClipProgressState;
});

function findByType(element: React.ReactElement, type: string): React.ReactElement | undefined {
  if (element.type === type) return element;
  const children = React.Children.toArray((element.props as { children?: React.ReactNode }).children);
  for (const child of children) {
    if (React.isValidElement(child)) {
      const found = findByType(child, type);
      if (found) return found;
    }
  }
  return undefined;
}

describe('Root (the +html.tsx web shell)', () => {
  test('renders the html/head/body structure with the CDN loader script embedded', () => {
    const element = Root({ children: <div id="app-root" /> });

    expect(element.type).toBe('html');

    const head = findByType(element, 'head');
    expect(head).toBeDefined();
    const script = findByType(head!, 'script');
    expect(script).toBeDefined();
    expect((script!.props as { type?: string }).type).toBe('module');

    // The script tag's content (via dangerouslySetInnerHTML) must carry the
    // exact CDN URL and model this ticket's outcome doc measured against —
    // a silent version bump here would invalidate those measurements.
    const scriptHtml = (script!.props as { dangerouslySetInnerHTML: { __html: string } })
      .dangerouslySetInnerHTML.__html;
    expect(scriptHtml).toContain('cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
    expect(scriptHtml).toContain('zero-shot-image-classification');
    expect(scriptHtml).toContain('Xenova/clip-vit-base-patch32');

    // The passed-in children render inside <body>, same as every other
    // Expo Router web shell.
    const body = findByType(element, 'body');
    expect(body).toBeDefined();
    expect(findByType(body!, 'div')?.props).toMatchObject({ id: 'app-root' });
  });
});

describe('CLIP_LOADER_SCRIPT (the CDN-loaded logic, run directly)', () => {
  test('happy path: a successful pipeline load sets the ready global, the classifier global, and dispatches a "ready" progress event', async () => {
    const fakeClassifier = () => Promise.resolve([]);
    const events: CustomEvent[] = [];
    window.addEventListener('foxbite-clip-progress', (e) => events.push(e as CustomEvent));

    runLoaderScript((_task: string, _model: string, options: { progress_callback: (d: unknown) => void }) => {
      // Simulate a couple of real download-progress ticks before resolving,
      // exercising reportProgress()'s non-terminal path too.
      options.progress_callback({ status: 'progress', progress: 10 });
      options.progress_callback({ status: 'progress', progress: 90 });
      return Promise.resolve(fakeClassifier);
    });

    const resolved = await window.__foxbiteClipPipelineReady;

    expect(resolved).toBe(fakeClassifier);
    expect(window.__foxbiteClipPipeline).toBe(fakeClassifier);
    expect(window.__foxbiteClipProgressState).toEqual({ status: 'ready' });
    expect(events.map((e) => e.detail)).toEqual([
      { status: 'progress', progress: 10 },
      { status: 'progress', progress: 90 },
      { status: 'ready' },
    ]);
  });

  test('unhappy path: a failed pipeline load rejects the ready global, never sets the classifier global, and dispatches an "error" progress event with the failure message', async () => {
    const events: CustomEvent[] = [];
    window.addEventListener('foxbite-clip-progress', (e) => events.push(e as CustomEvent));
    const failure = new Error('model.onnx fetch failed: 503');

    runLoaderScript(() => Promise.reject(failure));

    await expect(window.__foxbiteClipPipelineReady).rejects.toBe(failure);
    expect(window.__foxbiteClipPipeline).toBeUndefined();
    expect(window.__foxbiteClipProgressState).toEqual({
      status: 'error',
      message: 'model.onnx fetch failed: 503',
    });
    expect(events.map((e) => e.detail)).toEqual([
      { status: 'error', message: 'model.onnx fetch failed: 503' },
    ]);
  });

  test('unhappy path: a rejection with no .message (a non-Error thrown value) still reports a usable string, not "undefined"', async () => {
    runLoaderScript(() => Promise.reject('plain string failure'));

    await expect(window.__foxbiteClipPipelineReady).rejects.toBe('plain string failure');
    expect(window.__foxbiteClipProgressState).toEqual({
      status: 'error',
      message: 'plain string failure',
    });
  });
});
