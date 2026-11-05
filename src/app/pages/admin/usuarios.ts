import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2>Usuários</h2>`,
})
export default class AdminUsuarios {}
