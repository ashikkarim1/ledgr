/**
 * Agent input validation
 */

export function validateAgentInput(data: any) {
  const errors: string[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name: Required, must be non-empty string');
  }

  if (!data.email || typeof data.email !== 'string' || !isValidEmail(data.email)) {
    errors.push('email: Required, must be valid email address');
  }

  if (!data.phone || typeof data.phone !== 'string' || data.phone.trim().length === 0) {
    errors.push('phone: Required, must be non-empty string');
  }

  if (!data.role || !['tax', 'ap', 'ar', 'reconciliation', 'reporting', 'supervisor'].includes(data.role)) {
    errors.push('role: Required, must be one of: tax, ap, ar, reconciliation, reporting, supervisor');
  }

  if (data.specialization !== undefined) {
    if (!Array.isArray(data.specialization)) {
      errors.push('specialization: Must be an array of strings');
    } else {
      for (const spec of data.specialization) {
        if (typeof spec !== 'string' || spec.trim().length === 0) {
          errors.push('specialization: All items must be non-empty strings');
          break;
        }
      }
    }
  }

  if (data.max_concurrent_tasks !== undefined) {
    if (typeof data.max_concurrent_tasks !== 'number' || data.max_concurrent_tasks < 1 || data.max_concurrent_tasks > 20) {
      errors.push('max_concurrent_tasks: Must be a number between 1 and 20');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAssignmentInput(data: any) {
  const errors: string[] = [];

  if (!data.entity_type || typeof data.entity_type !== 'string' || data.entity_type.trim().length === 0) {
    errors.push('entity_type: Required, must be non-empty string (e.g., "invoice", "report")');
  }

  if (!data.entity_id || typeof data.entity_id !== 'string' || data.entity_id.trim().length === 0) {
    errors.push('entity_id: Required, must be non-empty string (UUID format)');
  }

  if (data.priority !== undefined) {
    if (typeof data.priority !== 'number' || data.priority < 1 || data.priority > 5) {
      errors.push('priority: Must be a number between 1 (low) and 5 (critical)');
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('description: Must be a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
