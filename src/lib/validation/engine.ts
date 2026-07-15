import { ValidationIssue, IssueType, ValidationSeverity } from '@/types';

export class ValidationEngine {
  private issues: ValidationIssue[] = [];

  public logIssue(
    source: string,
    sourceRowNumber: number | undefined,
    severity: ValidationSeverity,
    issueType: IssueType,
    message: string,
    originalItemName?: string,
    skuId?: string,
    impactQuantity?: number,
    impactValue?: number
  ) {
    this.issues.push({
      issueId: crypto.randomUUID(),
      source,
      sourceRowNumber,
      severity,
      issueType,
      message,
      originalItemName,
      skuId,
      impactQuantity,
      impactValue,
    });
  }

  public getIssues(): ValidationIssue[] {
    return this.issues;
  }

  public getCriticalIssues(): ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'Critical');
  }

  public getWarnings(): ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'Warning');
  }

  public hasCriticalIssues(): boolean {
    return this.getCriticalIssues().length > 0;
  }

  public clear() {
    this.issues = [];
  }
}
