import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_PARAMS, MoireParams } from '../models/moire-params';
import { encodePattern, encodePatternToBack } from '../utils/pattern-encoder';

@Injectable({ providedIn: 'root' })
export class MoireStateService {
  private paramsSubject = new BehaviorSubject<MoireParams>({ ...DEFAULT_PARAMS });
  readonly params$ = this.paramsSubject.asObservable();

  updateParams(partial: Partial<MoireParams>): void {
    const prev = this.paramsSubject.value;
    const next = { ...prev, ...partial };

    // If cellCount changed while a custom pattern is active, deactivate the
    // encoded offsets (they were computed for the old N) but keep the image so
    // the user can re-apply after adjusting the cell count.
    if (partial.cellCount !== undefined && partial.cellCount !== prev.cellCount) {
      delete next.customPattern;
    }

    this.paramsSubject.next(next);
  }

  /**
   * Called when the user confirms a new image in the pattern editor dialog.
   * Stores the image but does NOT encode yet — the user must click "Apply Pattern".
   */
  storePatternImage(image: Uint8Array): void {
    this.paramsSubject.next({
      ...this.paramsSubject.value,
      patternImage:  image,
      customPattern: undefined,
    });
  }

  /**
   * Encodes the stored patternImage with the current params and activates rendering.
   * No-op if no patternImage is stored.
   */
  applyPattern(): void {
    const params = this.paramsSubject.value;
    if (!params.patternImage) return;
    const { frontPhaseX } = encodePattern(params.patternImage, params);
    this.paramsSubject.next({ ...params, customPattern: { frontPhaseX } });
  }

  /** Stores the second pattern image. Does not encode yet. */
  storePatternImage2(image: Uint8Array): void {
    this.paramsSubject.next({
      ...this.paramsSubject.value,
      patternImage2: image,
    });
  }

  /**
   * Encodes the stored patternImage2 into back grid Y offsets using the current
   * viewer position, and merges into the existing customPattern (preserving frontPhaseX).
   * No-op if no patternImage2 is stored or pattern 1 is not yet applied.
   */
  applyPattern2(): void {
    const params = this.paramsSubject.value;
    if (!params.patternImage2 || !params.customPattern) return;
    const { backPhaseY } = encodePatternToBack(params.patternImage2, params);
    this.paramsSubject.next({
      ...params,
      customPattern: { ...params.customPattern, backPhaseY },
    });
  }

  /** Removes both the stored image and the active encoded pattern. */
  clearPattern(): void {
    const { patternImage: _img, patternImage2: _img2, customPattern: _cp, ...rest } =
      this.paramsSubject.value;
    this.paramsSubject.next(rest as MoireParams);
  }

  reset(): void {
    this.paramsSubject.next({ ...DEFAULT_PARAMS });
  }

  get currentParams(): MoireParams {
    return this.paramsSubject.value;
  }
}
