import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_PARAMS, MoireParams } from '../models/moire-params';
import { encodePattern } from '../utils/pattern-encoder';

@Injectable({ providedIn: 'root' })
export class MoireStateService {
  private paramsSubject = new BehaviorSubject<MoireParams>({ ...DEFAULT_PARAMS });
  readonly params$ = this.paramsSubject.asObservable();

  updateParams(partial: Partial<MoireParams>): void {
    let next = { ...this.paramsSubject.value, ...partial };
    // Re-encode whenever grid/viewer params change while a custom pattern is active
    if (next.customPattern) {
      const offsets = encodePattern(next.customPattern.image, next);
      next = { ...next, customPattern: { ...next.customPattern, ...offsets } };
    }
    this.paramsSubject.next(next);
  }

  setCustomPattern(image: Uint8Array): void {
    const params  = this.paramsSubject.value;
    const offsets = encodePattern(image, params);
    this.paramsSubject.next({ ...params, customPattern: { image, ...offsets } });
  }

  clearCustomPattern(): void {
    const { customPattern: _, ...rest } = this.paramsSubject.value;
    this.paramsSubject.next(rest as MoireParams);
  }

  reset(): void {
    this.paramsSubject.next({ ...DEFAULT_PARAMS });
  }

  get currentParams(): MoireParams {
    return this.paramsSubject.value;
  }
}
