import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2>Erros e saúde</h2>`,
})
export default class AdminSaude {}
