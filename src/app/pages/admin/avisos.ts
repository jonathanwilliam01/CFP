import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2>Avisos</h2>`,
})
export default class AdminAvisos {}
