import { prepareImageForUpload } from '@/lib/image-prep';

// Mock shape matches the CURRENT contextual `expo-image-manipulator` API
// (`manipulate() -> chained .resize()/.rotate() -> renderAsync() -> saveAsync()`),
// not the deprecated `manipulateAsync(uri, actions, saveOptions)` shape —
// there is no actions array in this API, so assertions below check what
// `.resize()`/`.rotate()` were CALLED WITH directly.
//
// `image-prep.ts` imports `expo-image-manipulator` lazily via a `require()`
// call inside its `try` block (see C1 in the plan/outcome doc) rather than
// a static top-level import — jest's module registry intercepts `require()`
// calls the same way it does static imports, so this mock applies
// regardless.
const mockManipulate = jest.fn();
const mockSaveAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: (...args: unknown[]) => mockManipulate(...args),
  },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const JPEG_QUALITY = 0.8;

function makeContext(renderResult: { width: number; height: number } | (() => Promise<never>)) {
  const context: any = {
    resize: jest.fn(() => context),
    rotate: jest.fn(() => context),
    renderAsync: jest.fn(async () => {
      if (typeof renderResult === 'function') {
        return renderResult();
      }
      return {
        width: renderResult.width,
        height: renderResult.height,
        saveAsync: mockSaveAsync,
      };
    }),
  };
  return context;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/output.jpg', width: 1, height: 1 });
});

describe('prepareImageForUpload', () => {
  const baseAsset = { uri: 'file:///picked/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' };

  it('no-ops on an already-small image: resize() is never called, only one manipulate() call happens', async () => {
    const ctx = makeContext({ width: 400, height: 300 });
    mockManipulate.mockReturnValue(ctx);

    const result = await prepareImageForUpload(baseAsset);

    expect(mockManipulate).toHaveBeenCalledTimes(1);
    expect(ctx.resize).not.toHaveBeenCalled();
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: JPEG_QUALITY });
    expect(result).toEqual({ uri: 'file:///cache/output.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  });

  it('resizes an oversized image via a second manipulate() call, constraining the correct axis', async () => {
    const measureCtx = makeContext({ width: 4000, height: 3000 });
    const resizeCtx = makeContext({ width: 1024, height: 768 });
    mockManipulate.mockReturnValueOnce(measureCtx).mockReturnValueOnce(resizeCtx);

    const result = await prepareImageForUpload(baseAsset);

    expect(mockManipulate).toHaveBeenCalledTimes(2);
    expect(resizeCtx.resize).toHaveBeenCalledWith({ width: 1024 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: JPEG_QUALITY });
    expect(result.uri).toBe('file:///cache/output.jpg');
    expect(result.type).toBe('image/jpeg');
  });

  it('constrains height for a portrait oversized image (regression test for the axis-inversion bug)', async () => {
    const measureCtx = makeContext({ width: 2000, height: 3000 });
    const resizeCtx = makeContext({ width: 683, height: 1024 });
    mockManipulate.mockReturnValueOnce(measureCtx).mockReturnValueOnce(resizeCtx);

    await prepareImageForUpload(baseAsset);

    expect(resizeCtx.resize).toHaveBeenCalledWith({ height: 1024 });
  });

  it('constrains width for a landscape oversized image (regression test for the axis-inversion bug)', async () => {
    const measureCtx = makeContext({ width: 3000, height: 2000 });
    const resizeCtx = makeContext({ width: 1024, height: 683 });
    mockManipulate.mockReturnValueOnce(measureCtx).mockReturnValueOnce(resizeCtx);

    await prepareImageForUpload(baseAsset);

    expect(resizeCtx.resize).toHaveBeenCalledWith({ width: 1024 });
  });

  it('converts a HEIC input to JPEG output', async () => {
    const ctx = makeContext({ width: 400, height: 300 });
    mockManipulate.mockReturnValue(ctx);

    const result = await prepareImageForUpload({
      uri: 'file:///picked/photo.heic',
      fileName: 'photo.heic',
      mimeType: 'image/heic',
    });

    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: JPEG_QUALITY });
    expect(result.type).toBe('image/jpeg');
  });

  it('never calls rotate() — Step 1a found both platforms normalize orientation on decode already', async () => {
    const measureCtx = makeContext({ width: 4000, height: 3000 });
    const resizeCtx = makeContext({ width: 1024, height: 768 });
    mockManipulate.mockReturnValueOnce(measureCtx).mockReturnValueOnce(resizeCtx);

    await prepareImageForUpload(baseAsset);

    expect(measureCtx.rotate).not.toHaveBeenCalled();
    expect(resizeCtx.rotate).not.toHaveBeenCalled();
  });

  it('falls back to the original asset and warns when manipulation fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockManipulate.mockImplementation(() => {
      throw new Error('native module unavailable');
    });

    const result = await prepareImageForUpload(baseAsset);

    expect(result).toEqual({ uri: baseAsset.uri, name: 'photo.jpg', type: 'image/jpeg' });
    expect(warnSpy).toHaveBeenCalledWith(
      '[image-prep] resize/compress failed, uploading original photo',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('falls back with a distinct "guaranteed downstream failure" warning for a HEIC/HEIF source', async () => {
    // Message text updated by ticket 011 (this codebase's on-device web
    // recognition ticket): the fallback's HEIC/HEIF failure is no longer
    // backend-specific now that web classifies locally in-browser instead
    // of always calling the backend — see image-prep.ts's comment.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockManipulate.mockImplementation(() => {
      throw new Error('native module unavailable');
    });

    const heicAsset = { uri: 'file:///picked/photo.heic', fileName: 'photo.heic', mimeType: 'image/heic' };
    const result = await prepareImageForUpload(heicAsset);

    expect(result).toEqual({ uri: heicAsset.uri, name: 'photo.heic', type: 'image/heic' });
    expect(warnSpy).toHaveBeenCalledWith(
      '[image-prep] manipulation failed on a HEIC/HEIF source — fallback will still fail downstream (backend allowlist on mobile, browser decode on web)',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('falls back to defaulted name/type when the asset has no fileName/mimeType', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockManipulate.mockImplementation(() => {
      throw new Error('native module unavailable');
    });

    const result = await prepareImageForUpload({ uri: 'file:///picked/photo.jpg' });

    expect(result).toEqual({ uri: 'file:///picked/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
    warnSpy.mockRestore();
  });
});
