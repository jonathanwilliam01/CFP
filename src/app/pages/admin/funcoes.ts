import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2>Funções</h2>`,
})
export default class AdminFuncoes {}
