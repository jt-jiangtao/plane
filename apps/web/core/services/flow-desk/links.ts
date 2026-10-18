/** flowdesk:// deep-link helpers (N10/N11 / P9). */

export function workItemLink(identifier: string): string {
  return `flowdesk://work-item/${identifier}`;
}

export function executionLink(executionId: string): string {
  return `flowdesk://execution/${executionId}`;
}
