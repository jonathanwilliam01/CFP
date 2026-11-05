import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2>Auditoria</h2>`,
})
export default class AdminAuditoria {}
