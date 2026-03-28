import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_PARAMS, MoireParams } from '../models/moire-params';

@Injectable({ providedIn: 'root' })
export class MoireStateService {
  private paramsSubject = new BehaviorSubject<MoireParams>({ ...DEFAULT_PARAMS });
  readonly params$ = this.paramsSubject.asObservable();

  updateParams(partial: Partial<MoireParams>): void {
    this.paramsSubject.next({ ...this.paramsSubject.value, ...partial });
  }

  reset(): void {
    this.paramsSubject.next({ ...DEFAULT_PARAMS });
  }

  get currentParams(): MoireParams {
    return this.paramsSubject.value;
  }
}
