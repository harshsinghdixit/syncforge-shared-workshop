/**
 * Client-only MediaPipe Selfie Segmentation helper.
 * Strictly SSR-safe: dynamic import occurs ONLY on the client when background removal is initialized.
 */

export interface SegmentationMaskData {
  maskWidth: number;
  maskHeight: number;
  maskValues: Float32Array;
  isPersonInverted: boolean;
}

let segmenterPromise: Promise<any> | null = null;
let segmenterInstance: any = null;
let isModelLoading = false;

export function isSegmenterLoading(): boolean {
  return isModelLoading;
}

export function isSegmenterReady(): boolean {
  return Boolean(segmenterInstance);
}

/**
 * Initializes and returns a shared singleton ImageSegmenter instance.
 * Gracefully tries GPU delegate first, falling back to CPU if WebGL fails.
 */
export async function getOrInitSegmenter(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("MediaPipe ImageSegmenter can only be initialized in the browser.");
  }

  if (segmenterInstance) {
    return segmenterInstance;
  }

  if (segmenterPromise) {
    return segmenterPromise;
  }

  isModelLoading = true;

  segmenterPromise = (async () => {
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const wasmFileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const modelAssetPath =
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

      try {
        // Try GPU delegate first for hardware acceleration
        segmenterInstance = await ImageSegmenter.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath,
            delegate: "GPU",
          },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      } catch (gpuError) {
        console.warn("MediaPipe GPU delegate initialization failed, falling back to CPU:", gpuError);
        segmenterInstance = await ImageSegmenter.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      }

      isModelLoading = false;
      return segmenterInstance;
    } catch (err) {
      isModelLoading = false;
      segmenterPromise = null;
      throw err;
    }
  })();

  return segmenterPromise;
}

/**
 * Runs image segmentation on a live video/canvas/image element and extracts the confidence mask.
 * Automatically guards polarity using corner samples (top-left & top-right) so background is always 0
 * and person is always 1.
 */
export function segmentPersonFrame(
  segmenter: any,
  source: CanvasImageSource
): SegmentationMaskData | null {
  if (!segmenter) return null;

  try {
    const result = segmenter.segment(source);
    if (!result || !result.confidenceMasks || result.confidenceMasks.length === 0) {
      return null;
    }

    const mask = result.confidenceMasks[0];
    const maskWidth = mask.width;
    const maskHeight = mask.height;
    const maskValues = mask.getAsFloat32Array();

    // Guard polarity: sample corners (background is almost certainly in the upper corners)
    const tlIndex = 0;
    const trIndex = Math.min(maskWidth - 1, maskValues.length - 1);
    const cornerAvg = (maskValues[tlIndex] + maskValues[trIndex]) / 2;
    // If corners have confidence > 0.5, the mask is inverted (i.e. background is ~1.0, person is ~0.0)
    const isPersonInverted = cornerAvg > 0.5;

    // We can close masks if they support it
    if (typeof mask.close === "function") {
      try {
        mask.close();
      } catch {}
    }

    return {
      maskWidth,
      maskHeight,
      maskValues,
      isPersonInverted,
    };
  } catch (err) {
    return null;
  }
}
