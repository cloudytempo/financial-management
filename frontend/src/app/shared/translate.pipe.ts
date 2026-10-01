import { Pipe, PipeTransform, inject } from '@angular/core';
import { Language } from '../core/language.service';

@Pipe({ name: 'tr', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private language = inject(Language);
  transform(value: string | null | undefined) { return value ? this.language.text(value) : ''; }
}
